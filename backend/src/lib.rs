pub mod admin;
pub mod aws;
pub mod content;
pub mod email;
mod error;
pub mod photos;
mod routes;
mod sync;
pub mod telemetry;

use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

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
    /// Owner-only editing; `None` turns every /api/admin route into a 404.
    pub admin: Option<Arc<admin::Admin>>,
}

/// The whole API, served under `/api` both locally and behind CloudFront.
pub fn app(state: AppState) -> Router {
    let api = routes::router().layer(axum::middleware::from_fn_with_state(
        state.clone(),
        routes::fresh_content,
    ));
    Router::new()
        .nest("/api", api)
        .with_state(state)
        // Router::layer wraps each route, so both see the matched route template.
        .layer(axum::middleware::from_fn(telemetry::track_request))
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(telemetry::request_span)
                .on_response(telemetry::on_response),
        )
}

/// The time since the Unix epoch, for stamps that only need to be unique and increasing (a clock
/// set before 1970 gives zero).
pub(crate) fn since_unix_epoch() -> Duration {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
}
