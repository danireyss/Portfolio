pub mod content;
pub mod email;
mod error;
mod routes;

use std::sync::Arc;

use axum::Router;
use tower_http::trace::TraceLayer;

use content::Content;
use email::Mailer;

#[derive(Clone)]
pub struct AppState {
    pub content: Arc<Content>,
    pub mailer: Arc<dyn Mailer>,
}

/// The whole API, served under `/api` both locally and behind CloudFront.
pub fn app(state: AppState) -> Router {
    Router::new()
        .nest("/api", routes::router())
        .with_state(state)
        .layer(TraceLayer::new_for_http())
}
