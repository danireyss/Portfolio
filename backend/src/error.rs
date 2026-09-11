use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::Serialize;
use ts_rs::TS;

use crate::email::MailError;
use crate::photos::PhotoStoreError;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("not found")]
    NotFound,
    #[error("invalid request")]
    Validation(Vec<FieldError>),
    #[error("failed to send email: {0}")]
    Mail(#[from] MailError),
    #[error("failed to list photos: {0}")]
    Photos(#[from] PhotoStoreError),
}

/// JSON body of every API error response.
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct ErrorBody {
    pub error: String,
    /// Per-field problems; only non-empty for validation errors.
    pub fields: Vec<FieldError>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
pub struct FieldError {
    pub field: &'static str,
    pub message: &'static str,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message, fields) = match self {
            AppError::NotFound => (StatusCode::NOT_FOUND, "Not found.", Vec::new()),
            AppError::Validation(fields) => (
                StatusCode::UNPROCESSABLE_ENTITY,
                "Please fix the highlighted fields.",
                fields,
            ),
            AppError::Mail(err) => {
                tracing::error!(error = %err, "sending contact email failed");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Your message couldn't be sent right now. Please email me directly instead.",
                    Vec::new(),
                )
            }
            AppError::Photos(err) => {
                tracing::error!(error = %err, "listing photos failed");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Couldn't load photos right now.",
                    Vec::new(),
                )
            }
        };
        let body = ErrorBody {
            error: message.into(),
            fields,
        };
        (status, Json(body)).into_response()
    }
}
