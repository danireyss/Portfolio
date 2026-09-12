//! HTTP-level tests against the full router, with fixture content and a recording mailer.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use axum::Router;
use axum::body::{Body, Bytes};
use axum::http::{HeaderMap, Request, StatusCode, header};
use http_body_util::BodyExt;
use portfolio_api::content::{Content, ContentHandle};
use portfolio_api::email::{ContactMessage, MailError, Mailer};
use portfolio_api::photos::{PhotoStore, PhotoStoreError};
use portfolio_api::{AppState, app};
use serde_json::{Value, json};
use tower::ServiceExt;

const SITE: &str = r#"
    [profile]
    name = "Test Person"
    headline = "Engineer"
    location = "Somewhere"
    tagline = "Builds things."
    email = "test@example.com"

    [about]
    background = ["Paragraph."]

    [[experience]]
    company = "Now Co"
    title = "Engineer"
    location = "Remote"
    start = "2022"

    [[galleries]]
    folder = "trip"
    title = "Trip"

    [galleries.photos."02.jpg"]
    caption = "Second"
    date = "Jul 2026"
"#;

const ALPHA: &str = "+++\ntitle = \"Alpha\"\ncategory = \"C\"\nsummary = \"S\"\ntags = [\"Rust\", \"AWS\"]\norder = 1\n+++\nAlpha body.\n";
const BETA: &str = "+++\ntitle = \"Beta\"\ncategory = \"C\"\nsummary = \"S\"\ntags = [\"Rust\"]\norder = 2\n+++\nBeta body.\n";
const PDF: &[u8] = b"%PDF-1.4 fake";

#[derive(Default)]
struct RecordingMailer {
    sent: Mutex<Vec<ContactMessage>>,
    fail: bool,
}

#[async_trait]
impl Mailer for RecordingMailer {
    async fn send(&self, message: &ContactMessage) -> Result<(), MailError> {
        if self.fail {
            return Err(MailError("SES is down".into()));
        }
        self.sent.lock().unwrap().push(message.clone());
        Ok(())
    }
}

/// Serves fixed file lists per folder, or fails every call.
#[derive(Default)]
struct FakePhotoStore {
    folders: HashMap<&'static str, Vec<&'static str>>,
    fail: bool,
}

#[async_trait]
impl PhotoStore for FakePhotoStore {
    async fn list(&self, folder: &str) -> Result<Vec<String>, PhotoStoreError> {
        if self.fail {
            return Err(PhotoStoreError("S3 is down".into()));
        }
        let files = self.folders.get(folder).cloned().unwrap_or_default();
        Ok(files.into_iter().map(String::from).collect())
    }
}

struct TestApp {
    router: Router,
    mailer: Arc<RecordingMailer>,
}

impl TestApp {
    fn new(mailer: RecordingMailer, pdf: Option<&'static [u8]>) -> Self {
        let photos = FakePhotoStore {
            folders: HashMap::from([("trip", vec!["01.jpg", "02.jpg"])]),
            fail: false,
        };
        Self::with_photos(mailer, pdf, photos)
    }

    fn with_photos(
        mailer: RecordingMailer,
        pdf: Option<&'static [u8]>,
        photos: FakePhotoStore,
    ) -> Self {
        let projects = [
            ("projects/alpha.md".to_owned(), ALPHA),
            ("projects/beta.md".to_owned(), BETA),
        ];
        let content = Content::from_sources(SITE, &projects, pdf.map(Bytes::from_static)).unwrap();
        let mailer = Arc::new(mailer);
        let router = app(AppState {
            content: Arc::new(ContentHandle::fixed(content)),
            mailer: mailer.clone(),
            photos: Arc::new(photos),
        });
        Self { router, mailer }
    }

    async fn request(&self, request: Request<Body>) -> (StatusCode, HeaderMap, Bytes) {
        let response = self.router.clone().oneshot(request).await.unwrap();
        let (parts, body) = response.into_parts();
        (
            parts.status,
            parts.headers,
            body.collect().await.unwrap().to_bytes(),
        )
    }

    async fn get(&self, uri: &str) -> (StatusCode, HeaderMap, Bytes) {
        self.request(Request::get(uri).body(Body::empty()).unwrap())
            .await
    }

    async fn get_json(&self, uri: &str) -> (StatusCode, Value) {
        let (status, _, body) = self.get(uri).await;
        (status, serde_json::from_slice(&body).unwrap())
    }

    async fn post_contact(&self, body: Value) -> (StatusCode, Value) {
        let request = Request::post("/api/contact")
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(body.to_string()))
            .unwrap();
        let (status, _, body) = self.request(request).await;
        let json = if body.is_empty() {
            Value::Null
        } else {
            serde_json::from_slice(&body).unwrap()
        };
        (status, json)
    }
}

fn default_app() -> TestApp {
    TestApp::new(RecordingMailer::default(), Some(PDF))
}

fn contact(overrides: Value) -> Value {
    let mut body = json!({
        "name": "Visitor",
        "email": "visitor@example.com",
        "message": "Hello, I'd like to chat about a role.",
        "elapsed_ms": 10_000,
    });
    body.as_object_mut()
        .unwrap()
        .extend(overrides.as_object().unwrap().clone());
    body
}

#[tokio::test]
async fn health() {
    let (status, _, body) = default_app().get("/api/health").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, "ok");
}

#[tokio::test]
async fn site_includes_profile_current_role_and_skills() {
    let (status, json) = default_app().get_json("/api/site").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["profile"]["name"], "Test Person");
    assert_eq!(json["current_role"]["company"], "Now Co");
    assert_eq!(json["skills"][0]["name"], "Rust");
    assert_eq!(json["skills"][0]["projects"].as_array().unwrap().len(), 2);
}

#[tokio::test]
async fn projects_list_and_case_insensitive_tag_filter() {
    let app = default_app();

    let (status, json) = app.get_json("/api/projects").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["projects"].as_array().unwrap().len(), 2);
    assert_eq!(json["projects"][0]["slug"], "alpha");
    assert!(json["projects"][0].get("body_html").is_none());

    let (_, json) = app.get_json("/api/projects?tag=aws").await;
    let slugs: Vec<_> = json["projects"]
        .as_array()
        .unwrap()
        .iter()
        .map(|p| p["slug"].as_str().unwrap())
        .collect();
    assert_eq!(slugs, ["alpha"]);
    assert_eq!(json["tags"].as_array().unwrap().len(), 2);
}

#[tokio::test]
async fn project_detail_and_json_404s() {
    let app = default_app();

    let (status, json) = app.get_json("/api/projects/beta").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["title"], "Beta");
    assert_eq!(json["body_html"], "<p>Beta body.</p>\n");

    for uri in ["/api/projects/missing", "/api/nope"] {
        let (status, json) = app.get_json(uri).await;
        assert_eq!(status, StatusCode::NOT_FOUND, "{uri}");
        assert_eq!(json["error"], "Not found.");
    }
}

#[tokio::test]
async fn resume_json_and_pdf() {
    let app = default_app();

    let (status, json) = app.get_json("/api/resume").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["has_pdf"], true);
    assert_eq!(json["experience"][0]["title"], "Engineer");

    let (status, headers, body) = app.get("/api/resume.pdf").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(headers[header::CONTENT_TYPE], "application/pdf");
    assert_eq!(
        headers[header::CONTENT_DISPOSITION],
        "inline; filename=\"Test-Person-Resume.pdf\""
    );
    assert_eq!(body, PDF);

    let (_, headers, _) = app.get("/api/resume.pdf?download=1").await;
    assert!(
        headers[header::CONTENT_DISPOSITION]
            .to_str()
            .unwrap()
            .starts_with("attachment;")
    );
}

#[tokio::test]
async fn resume_pdf_404s_when_missing() {
    let app = TestApp::new(RecordingMailer::default(), None);
    let (_, json) = app.get_json("/api/resume").await;
    assert_eq!(json["has_pdf"], false);
    let (status, _, _) = app.get("/api/resume.pdf").await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn photos_lists_each_gallery_folder_with_optional_details() {
    let (status, json) = default_app().get_json("/api/photos").await;
    assert_eq!(status, StatusCode::OK);
    let gallery = &json["galleries"][0];
    assert_eq!(gallery["title"], "Trip");
    assert_eq!(
        gallery["photos"],
        json!([
            { "src": "/photos/trip/01.jpg", "alt": "Trip, photo 1", "caption": null, "date": null },
            { "src": "/photos/trip/02.jpg", "alt": "Trip, photo 2", "caption": "Second", "date": "Jul 2026" },
        ])
    );
}

#[tokio::test]
async fn photos_store_failure_is_500() {
    let app = TestApp::with_photos(
        RecordingMailer::default(),
        None,
        FakePhotoStore {
            fail: true,
            ..Default::default()
        },
    );
    let (status, json) = app.get_json("/api/photos").await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
    assert_eq!(json["error"], "Couldn't load photos right now.");
}

#[tokio::test]
async fn contact_sends_trimmed_message() {
    let app = default_app();
    let (status, _) = app
        .post_contact(contact(json!({ "name": "  Visitor  " })))
        .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(
        *app.mailer.sent.lock().unwrap(),
        [ContactMessage {
            name: "Visitor".into(),
            email: "visitor@example.com".into(),
            message: "Hello, I'd like to chat about a role.".into(),
        }]
    );
}

#[tokio::test]
async fn contact_reports_field_errors() {
    let app = default_app();
    let (status, json) = app
        .post_contact(contact(
            json!({ "name": "", "email": "nope", "message": "short" }),
        ))
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    let fields: Vec<_> = json["fields"]
        .as_array()
        .unwrap()
        .iter()
        .map(|f| f["field"].as_str().unwrap())
        .collect();
    assert_eq!(fields, ["name", "email", "message"]);
    assert!(app.mailer.sent.lock().unwrap().is_empty());
}

#[tokio::test]
async fn contact_silently_drops_spam() {
    let app = default_app();
    for spam in [
        json!({ "website": "http://spam.example" }),
        json!({ "elapsed_ms": 500 }),
    ] {
        let (status, _) = app.post_contact(contact(spam)).await;
        assert_eq!(status, StatusCode::NO_CONTENT);
    }
    assert!(app.mailer.sent.lock().unwrap().is_empty());
}

#[tokio::test]
async fn contact_mail_failure_is_500() {
    let app = TestApp::new(
        RecordingMailer {
            fail: true,
            ..Default::default()
        },
        None,
    );
    let (status, json) = app.post_contact(contact(json!({}))).await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
    assert!(
        json["error"]
            .as_str()
            .unwrap()
            .contains("email me directly")
    );
}
