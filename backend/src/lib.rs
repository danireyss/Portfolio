pub mod content;
pub mod email;
mod error;
pub mod photos;
mod routes;
pub mod telemetry;

use std::sync::Arc;

use axum::Router;
use tower_http::trace::TraceLayer;

use content::ContentHandle;
use email::Mailer;
use photos::PhotoStore;

#[derive(Clone)]
pub struct AppState {
    /// `content.get()` for the current content, which a newer version can replace at any time.
    pub content: Arc<ContentHandle>,
    pub mailer: Arc<dyn Mailer>,
    pub photos: Arc<dyn PhotoStore>,
}

/// The whole API, served under `/api` both locally and behind CloudFront.
pub fn app(state: AppState) -> Router {
    Router::new()
        .nest("/api", routes::router())
        .with_state(state)
        // Router::layer wraps each route, so both see the matched route template.
        .layer(axum::middleware::from_fn(telemetry::track_request))
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(telemetry::request_span)
                .on_response(telemetry::on_response),
        )
}
