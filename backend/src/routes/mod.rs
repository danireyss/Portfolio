mod contact;
mod content;
mod photos;
mod resume;

use axum::Router;
use axum::extract::DefaultBodyLimit;
use axum::routing::{get, post};

use crate::AppState;
use crate::error::AppError;

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
        .fallback(|| async { AppError::NotFound })
}
