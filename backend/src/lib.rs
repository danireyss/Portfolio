pub mod content;
pub mod email;
mod error;
pub mod photos;
mod routes;

use std::sync::Arc;

use axum::Router;
use tower_http::trace::TraceLayer;

use content::Content;
use email::Mailer;
use photos::PhotoStore;

#[derive(Clone)]
pub struct AppState {
    pub content: Arc<Content>,
    pub mailer: Arc<dyn Mailer>,
    pub photos: Arc<dyn PhotoStore>,
}

/// The whole API, served under `/api` both locally and behind CloudFront.
pub fn app(state: AppState) -> Router {
    Router::new()
        .nest("/api", routes::router())
        .with_state(state)
        .layer(TraceLayer::new_for_http())
}
