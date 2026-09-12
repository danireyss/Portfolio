mod admin;
mod contact;
mod content;
mod photos;
mod resume;

use axum::Router;
use axum::extract::{DefaultBodyLimit, Request, State};
use axum::middleware::Next;
use axum::response::Response;
use axum::routing::{get, post};

use crate::AppState;
use crate::error::AppError;

/// A read asking for `?v=<version tag>` (admin sends it right after a save) gets at least that
/// version: an instance that hasn't noticed it yet checks the store before answering. The new
/// query string also keeps CloudFront from answering with a cached copy.
pub(crate) async fn fresh_content(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Response {
    let behind = request
        .uri()
        .query()
        .and_then(|query| query.split('&').find_map(|pair| pair.strip_prefix("v=")))
        .is_some_and(|wanted| wanted != state.content.version_tag());
    if behind {
        state.content.refresh().await;
    }
    next.run(request).await
}

pub(crate) fn router() -> Router<AppState> {
    Router::new()
        .route("/health", get(|| async { "ok" }))
        .route("/site", get(content::site))
        .route("/projects", get(content::projects))
        .route("/projects/{slug}", get(content::project))
        .route("/resume", get(resume::resume))
        .route("/resume.pdf", get(resume::pdf))
        .route("/photos", get(photos::photos))
        .route(
            "/contact",
            post(contact::send).layer(DefaultBodyLimit::max(16 * 1024)),
        )
        .nest("/admin", admin::router())
        .fallback(|| async { AppError::NotFound })
}
