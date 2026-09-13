//! /api/admin/*: who gets in, and what saving does. Content lives in a temporary folder, read
//! through the same `LocalContentStore` that `make dev` uses.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use async_trait::async_trait;
use axum::Router;
use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use http_body_util::BodyExt;
use portfolio_api::admin::{
    Admin, AdminAuth, AuthError, CacheInvalidator, CdnError, MediaError, MediaStore,
    PresignedUpload, SessionUser,
};
use portfolio_api::content::{ContentHandle, LocalContentStore};
use portfolio_api::email::LogMailer;
use portfolio_api::photos::{PhotoStore, PhotoStoreError};
use portfolio_api::{AppState, app};
use serde_json::{Value, json};
use tower::ServiceExt;

const OWNER: &str = "session=owner";
const STRANGER: &str = "session=stranger";
const UNVERIFIED: &str = "session=unverified";
const SITE_ORIGIN: &str = "https://site.test";

const SITE: &str = r#"
[profile]
name = "Test Person"
headline = "Engineer"
location = "Somewhere"
tagline = "Builds things."
email = "test@example.com"

[about]
background = ["Paragraph."]
"#;

const ALPHA: &str = "+++\ntitle = \"Alpha\"\ncategory = \"C\"\nsummary = \"S\"\ntags = [\"Rust\"]\n+++\nAlpha body.\n";

/// Stands in for the Better Auth service: a fixed session per cookie.
struct FakeAuth;

#[async_trait]
impl AdminAuth for FakeAuth {
    async fn user(&self, cookie: &str) -> Result<Option<SessionUser>, AuthError> {
        let user = |email: &str, email_verified| {
            Some(SessionUser {
                email: email.into(),
                email_verified,
            })
        };
        Ok(match cookie {
            // Emails compare case-insensitively.
            OWNER => user("Owner@Example.com", true),
            STRANGER => user("someone@example.com", true),
            UNVERIFIED => user("owner@example.com", false),
            _ => None,
        })
    }
}

#[derive(Default)]
struct FakeMedia {
    deleted: Mutex<Vec<String>>,
}

#[async_trait]
impl MediaStore for FakeMedia {
    async fn upload_url(
        &self,
        key: &str,
        content_type: &str,
    ) -> Result<PresignedUpload, MediaError> {
        Ok(PresignedUpload {
            url: format!("https://upload.test/{key}"),
            headers: vec![("content-type".into(), content_type.into())],
        })
    }

    async fn delete(&self, key: &str) -> Result<(), MediaError> {
        self.deleted.lock().unwrap().push(key.into());
        Ok(())
    }
}

#[derive(Default)]
struct FakeCdn {
    invalidated: Mutex<Vec<String>>,
}

#[async_trait]
impl CacheInvalidator for FakeCdn {
    async fn invalidate(&self, paths: &[&str]) -> Result<(), CdnError> {
        let mut invalidated = self.invalidated.lock().unwrap();
        invalidated.extend(paths.iter().map(|path| (*path).to_owned()));
        Ok(())
    }
}

struct NoPhotos;

#[async_trait]
impl PhotoStore for NoPhotos {
    async fn list(&self, _folder: &str) -> Result<Vec<String>, PhotoStoreError> {
        Ok(Vec::new())
    }
}

struct TestAdmin {
    router: Router,
    dir: PathBuf,
    media: Arc<FakeMedia>,
    cdn: Arc<FakeCdn>,
}

impl TestAdmin {
    async fn new(name: &str) -> Self {
        let dir =
            std::env::temp_dir().join(format!("portfolio-admin-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("projects")).unwrap();
        std::fs::write(dir.join("site.toml"), SITE).unwrap();
        std::fs::write(dir.join("projects/alpha.md"), ALPHA).unwrap();

        let store = Arc::new(LocalContentStore::new(&dir));
        let content = ContentHandle::from_store(store, Duration::from_secs(3600))
            .await
            .unwrap();
        let media = Arc::new(FakeMedia::default());
        let cdn = Arc::new(FakeCdn::default());
        let admin = Admin::new(
            Arc::new(FakeAuth),
            "owner@example.com",
            vec![SITE_ORIGIN.into()],
            media.clone(),
            cdn.clone(),
        );
        let router = app(AppState {
            content: Arc::new(content),
            mailer: Arc::new(LogMailer),
            photos: Arc::new(NoPhotos),
            admin: Some(Arc::new(admin)),
        });
        Self {
            router,
            dir,
            media,
            cdn,
        }
    }

    async fn send(
        &self,
        method: &str,
        uri: &str,
        cookie: Option<&str>,
        origin: Option<&str>,
        if_match: Option<&str>,
        body: Option<Value>,
    ) -> (StatusCode, Value) {
        let mut request = Request::builder().method(method).uri(uri);
        if let Some(cookie) = cookie {
            request = request.header(header::COOKIE, cookie);
        }
        if let Some(origin) = origin {
            request = request.header(header::ORIGIN, origin);
        }
        if let Some(version) = if_match {
            request = request.header(header::IF_MATCH, version);
        }
        let body = match body {
            Some(json) => {
                request = request.header(header::CONTENT_TYPE, "application/json");
                Body::from(json.to_string())
            }
            None => Body::empty(),
        };
        let response = self
            .router
            .clone()
            .oneshot(request.body(body).unwrap())
            .await
            .unwrap();
        let status = response.status();
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        let value = if bytes.is_empty() {
            Value::Null
        } else {
            serde_json::from_slice(&bytes)
                .unwrap_or_else(|_| Value::String(String::from_utf8_lossy(&bytes).into_owned()))
        };
        (status, value)
    }

    /// A request from the owner, from the site.
    async fn owner(
        &self,
        method: &str,
        uri: &str,
        if_match: Option<&str>,
        body: Option<Value>,
    ) -> (StatusCode, Value) {
        self.send(method, uri, Some(OWNER), Some(SITE_ORIGIN), if_match, body)
            .await
    }

    async fn public(&self, uri: &str) -> (StatusCode, Value) {
        self.send("GET", uri, None, None, None, None).await
    }

    async fn document(&self) -> Value {
        let (status, doc) = self.owner("GET", "/api/admin/content", None, None).await;
        assert_eq!(status, StatusCode::OK);
        doc
    }

    fn file(&self, path: &str) -> String {
        std::fs::read_to_string(self.dir.join(path)).unwrap_or_default()
    }
}

impl Drop for TestAdmin {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}

#[tokio::test]
async fn anyone_but_the_owner_gets_the_same_404_as_an_unknown_path() {
    let t = TestAdmin::new("strangers").await;
    let (_, unknown) = t.public("/api/no-such-thing").await;

    for cookie in [
        None,
        Some(STRANGER),
        Some(UNVERIFIED),
        Some("session=forged"),
    ] {
        for (method, uri) in [
            ("GET", "/api/admin/content"),
            ("PUT", "/api/admin/site"),
            ("DELETE", "/api/admin/projects/alpha"),
            ("POST", "/api/admin/uploads"),
        ] {
            let (status, body) = t
                .send(
                    method,
                    uri,
                    cookie,
                    Some(SITE_ORIGIN),
                    None,
                    Some(json!({})),
                )
                .await;
            assert_eq!(
                status,
                StatusCode::NOT_FOUND,
                "{method} {uri} as {cookie:?}"
            );
            assert_eq!(body, unknown, "{method} {uri} as {cookie:?}");
        }
    }

    let doc = t.document().await;
    assert_eq!(doc["site"]["profile"]["name"], "Test Person");
    assert_eq!(doc["projects"][0]["slug"], "alpha");
    assert_eq!(doc["projects"][0]["markdown"], "Alpha body.\n");
    assert!(doc["resume_url"].is_null());
}

#[tokio::test]
async fn changes_must_come_from_the_site() {
    let t = TestAdmin::new("origin").await;
    let site = t.document().await["site"].clone();

    for origin in [None, Some("https://evil.test")] {
        let (status, _) = t
            .send(
                "PUT",
                "/api/admin/site",
                Some(OWNER),
                origin,
                None,
                Some(site.clone()),
            )
            .await;
        assert_eq!(status, StatusCode::NOT_FOUND, "{origin:?}");
    }
    assert_eq!(t.file("site.toml"), SITE, "nothing was written");
}

#[tokio::test]
async fn saving_the_site_publishes_it_and_refuses_stale_versions() {
    let t = TestAdmin::new("save").await;
    let doc = t.document().await;
    let version = doc["version"].as_str().unwrap().to_owned();
    let mut site = doc["site"].clone();
    site["about"]["background"] = json!(["Edited from admin."]);
    site["about"]["focus_areas"] = json!([{ "title": "Backend", "description": "APIs." }]);

    let (status, saved) = t
        .owner("PUT", "/api/admin/site", Some(&version), Some(site.clone()))
        .await;
    assert_eq!(status, StatusCode::OK, "{saved}");
    assert_ne!(saved["version"], version, "a save makes a new version");

    let (_, public) = t.public("/api/site").await;
    assert_eq!(public["about"]["background"], json!(["Edited from admin."]));
    assert_eq!(public["about"]["focus_areas"][0]["title"], "Backend");
    assert!(t.file("site.toml").contains("Edited from admin."));
    assert_eq!(*t.cdn.invalidated.lock().unwrap(), ["/api/*"]);

    let (status, body) = t
        .owner("PUT", "/api/admin/site", Some(&version), Some(site))
        .await;
    assert_eq!(status, StatusCode::CONFLICT, "{body}");
}

#[tokio::test]
async fn invalid_content_is_refused_and_nothing_is_written() {
    let t = TestAdmin::new("invalid").await;
    let mut site = t.document().await["site"].clone();
    site["galleries"] =
        json!([{ "folder": "../escape", "title": "Bad", "description": null, "photos": {} }]);

    let (status, body) = t.owner("PUT", "/api/admin/site", None, Some(site)).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert!(
        body["error"].as_str().unwrap().contains("../escape"),
        "{body}"
    );
    assert_eq!(t.file("site.toml"), SITE);

    let mut unknown_field = t.document().await["site"].clone();
    unknown_field["profile"]["nickname"] = json!("Dan");
    let (status, _) = t
        .owner("PUT", "/api/admin/site", None, Some(unknown_field))
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);

    let project = json!({ "front": { "title": "X", "category": "C", "summary": "S", "tags": [],
        "featured": false, "order": 0, "date": null, "image": null, "links": [] }, "markdown": "" });
    let (status, _) = t
        .owner("PUT", "/api/admin/projects/Bad_Name", None, Some(project))
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert!(t.cdn.invalidated.lock().unwrap().is_empty());
}

#[tokio::test]
async fn projects_can_be_created_edited_and_deleted() {
    let t = TestAdmin::new("projects").await;
    let mut project = json!({
        "front": { "title": "Beta", "category": "Web app", "summary": "A new one.", "tags": ["Rust", "React"],
            "featured": true, "order": 2, "date": "Sep 2026", "image": null,
            "links": [{ "label": "Source", "url": "https://github.com/me/beta" }] },
        "markdown": "## Overview\n\nBeta body.\n"
    });

    let (status, doc) = t
        .owner(
            "PUT",
            "/api/admin/projects/beta",
            None,
            Some(project.clone()),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{doc}");
    assert_eq!(doc["projects"][1]["slug"], "beta");
    let (status, public) = t.public("/api/projects/beta").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(public["links"][0]["label"], "Source");
    assert!(
        public["body_html"]
            .as_str()
            .unwrap()
            .contains("<h2>Overview</h2>")
    );
    let (_, site) = t.public("/api/site").await;
    assert_eq!(site["skills"][0]["name"], "Rust", "tags are recounted");
    assert_eq!(site["skills"][0]["projects"].as_array().unwrap().len(), 2);

    project["front"]["title"] = json!("Beta, renamed");
    // Alpha has the default order, 0; ties sort by title, so -1 is needed to move ahead of it.
    project["front"]["order"] = json!(-1);
    let (status, doc) = t
        .owner("PUT", "/api/admin/projects/beta", None, Some(project))
        .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        doc["projects"][0]["front"]["title"], "Beta, renamed",
        "order is saved"
    );

    let (status, _) = t
        .owner("DELETE", "/api/admin/projects/beta", None, None)
        .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        t.public("/api/projects/beta").await.0,
        StatusCode::NOT_FOUND
    );
    assert!(!t.dir.join("projects/beta.md").exists());
    let (status, _) = t
        .owner("DELETE", "/api/admin/projects/beta", None, None)
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn uploads_go_to_safe_places() {
    let t = TestAdmin::new("uploads").await;
    let upload = |body: Value| t.owner("POST", "/api/admin/uploads", None, Some(body));

    let (status, ticket) =
        upload(json!({ "kind": "photo", "folder": "trip", "filename": "My Photo (1).JPG" })).await;
    assert_eq!(status, StatusCode::OK, "{ticket}");
    assert_eq!(ticket["path"], "/photos/trip/my-photo-1.jpg");
    assert_eq!(
        ticket["url"],
        "https://upload.test/photos/trip/my-photo-1.jpg"
    );
    assert_eq!(ticket["headers"], json!([["content-type", "image/jpeg"]]));

    let (_, ticket) =
        upload(json!({ "kind": "resume", "folder": null, "filename": "CV.PDF" })).await;
    assert_eq!(ticket["path"], "/api/resume.pdf");
    assert_eq!(ticket["url"], "https://upload.test/content/resume.pdf");

    let (_, ticket) =
        upload(json!({ "kind": "headshot", "folder": null, "filename": "me.png" })).await;
    let path = ticket["path"].as_str().unwrap();
    assert!(
        path.starts_with("/uploads/headshot-") && path.ends_with(".png"),
        "{path}"
    );

    for bad in [
        json!({ "kind": "resume", "folder": null, "filename": "cv.docx" }),
        json!({ "kind": "headshot", "folder": null, "filename": "me.svg" }),
        json!({ "kind": "photo", "folder": "../escape", "filename": "a.jpg" }),
        json!({ "kind": "photo", "folder": null, "filename": "a.jpg" }),
    ] {
        let (status, _) = upload(bad.clone()).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{bad}");
    }
}

#[tokio::test]
async fn a_new_resume_gets_a_new_url() {
    let t = TestAdmin::new("resume").await;
    let reload = async || {
        let (_, doc) = t.owner("POST", "/api/admin/reload", None, None).await;
        doc["resume_url"].as_str().unwrap().to_owned()
    };

    std::fs::write(t.dir.join("resume.pdf"), "first").unwrap();
    let first = reload().await;
    std::fs::write(t.dir.join("resume.pdf"), "second, longer").unwrap();
    let second = reload().await;

    // So neither browsers nor CloudFront answer with the old PDF.
    assert_ne!(first, second);
    assert_eq!(t.public("/api/resume").await.1["pdf_url"], second);
    assert_eq!(t.public(&second).await.1, "second, longer");
}

#[tokio::test]
async fn the_resume_page_is_read_from_the_pdf() {
    let t = TestAdmin::new("resume-import").await;
    let import = || t.owner("POST", "/api/admin/resume/import", None, None);

    let (status, body) = import().await;
    assert_eq!(
        status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "no PDF yet: {body}"
    );

    let pdf = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/resume.pdf");
    std::fs::copy(pdf, t.dir.join("resume.pdf")).unwrap();
    let (status, doc) = import().await;
    assert_eq!(status, StatusCode::OK, "{doc}");
    assert_eq!(
        doc["site"]["experience"][0]["company"],
        "Stealth Start-Up (AI Company)"
    );
    assert_eq!(
        t.public("/api/resume").await.1["awards"][0]["title"],
        "Summit Impact Award"
    );
    assert!(t.file("site.toml").contains("Summit Impact Award"), "saved");

    std::fs::write(t.dir.join("resume.pdf"), "not a pdf").unwrap();
    let (status, body) = import().await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{body}");
    assert!(
        t.file("site.toml").contains("Summit Impact Award"),
        "left as it was"
    );
}

#[tokio::test]
async fn photos_can_be_deleted() {
    let t = TestAdmin::new("photos").await;
    let (status, _) = t
        .owner("DELETE", "/api/admin/photos/trip/01.jpg", None, None)
        .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(*t.media.deleted.lock().unwrap(), ["photos/trip/01.jpg"]);
    assert_eq!(*t.cdn.invalidated.lock().unwrap(), ["/api/*"]);

    let (status, _) = t
        .owner(
            "DELETE",
            "/api/admin/photos/Not_A_Folder/01.jpg",
            None,
            None,
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}
