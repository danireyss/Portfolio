//! `?v=` on reads: an instance that hasn't noticed the latest content yet checks the store
//! before answering, so admin sees its own save even when another instance answers.

use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use axum::Router;
use axum::body::Body;
use axum::http::Request;
use http_body_util::BodyExt;
use portfolio_api::content::{ContentHandle, LocalContentStore};
use portfolio_api::email::LogMailer;
use portfolio_api::photos::{PhotoStore, PhotoStoreError};
use portfolio_api::{AppState, app};
use serde_json::Value;
use tower::ServiceExt;

struct NoPhotos;

#[async_trait]
impl PhotoStore for NoPhotos {
    async fn list(&self, _folder: &str) -> Result<Vec<String>, PhotoStoreError> {
        Ok(Vec::new())
    }
}

fn site(tagline: &str) -> String {
    format!(
        r#"
[profile]
name = "Test Person"
headline = "Engineer"
location = "Somewhere"
tagline = "{tagline}"
email = "test@example.com"

[about]
background = ["Paragraph."]
"#
    )
}

async fn tagline(router: &Router, uri: &str) -> String {
    let request = Request::get(uri).body(Body::empty()).unwrap();
    let response = router.clone().oneshot(request).await.unwrap();
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    json["profile"]["tagline"].as_str().unwrap().to_owned()
}

#[tokio::test]
async fn reads_asking_for_a_newer_version_check_the_store_first() {
    let dir = std::env::temp_dir().join(format!("portfolio-fresh-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("site.toml"), site("Before.")).unwrap();

    // An instance that wouldn't check the store by itself for an hour.
    let store = Arc::new(LocalContentStore::new(&dir));
    let content = ContentHandle::from_store(store, Duration::from_secs(3600))
        .await
        .unwrap();
    let router = app(AppState {
        content: Arc::new(content),
        mailer: Arc::new(LogMailer),
        photos: Arc::new(NoPhotos),
        admin: None,
    });

    // Another instance saves.
    std::fs::write(dir.join("site.toml"), site("After, and a little longer.")).unwrap();

    let stale = tagline(&router, "/api/site").await;
    let fresh = tagline(&router, "/api/site?v=0123456789abcdef").await;
    std::fs::remove_dir_all(&dir).unwrap();
    assert_eq!(stale, "Before.", "no reason to check yet");
    assert_eq!(fresh, "After, and a little longer.");
}
