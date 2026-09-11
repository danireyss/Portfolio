use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use serde::Deserialize;
use ts_rs::TS;

use crate::AppState;
use crate::email::ContactMessage;
use crate::error::{AppError, FieldError};

/// Submissions faster than this are almost certainly bots.
const MIN_FILL_MS: u32 = 3_000;

// Keep these limits in sync with the contact form's zod schema.
const NAME_MAX: usize = 100;
const MESSAGE_MIN: usize = 10;
const MESSAGE_MAX: usize = 5_000;
const EMAIL_MAX: usize = 254;

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct ContactRequest {
    pub name: String,
    pub email: String,
    pub message: String,
    /// Honeypot: a visually hidden field that people leave empty and bots fill in.
    #[serde(default)]
    #[ts(optional)]
    pub website: Option<String>,
    /// How long the form was open before it was submitted, in milliseconds.
    pub elapsed_ms: u32,
}

pub(crate) async fn send(
    State(state): State<AppState>,
    Json(request): Json<ContactRequest>,
) -> Result<StatusCode, AppError> {
    let honeypot_filled = request.website.as_deref().is_some_and(|w| !w.is_empty());
    if honeypot_filled || request.elapsed_ms < MIN_FILL_MS {
        // Report success so bots get no signal to adapt to.
        tracing::info!(
            honeypot_filled,
            elapsed_ms = request.elapsed_ms,
            "dropped likely-spam contact submission"
        );
        return Ok(StatusCode::NO_CONTENT);
    }

    let message = validate(&request)?;
    state.mailer.send(&message).await?;
    Ok(StatusCode::NO_CONTENT)
}

fn validate(request: &ContactRequest) -> Result<ContactMessage, AppError> {
    let name = request.name.trim();
    let email = request.email.trim();
    let message = request.message.trim();
    let mut errors = Vec::new();

    let name_len = name.chars().count();
    if name_len == 0 || name_len > NAME_MAX || name.chars().any(char::is_control) {
        errors.push(FieldError {
            field: "name",
            message: "Enter your name (up to 100 characters).",
        });
    }
    if !is_valid_email(email) {
        errors.push(FieldError {
            field: "email",
            message: "Enter a valid email address.",
        });
    }
    if !(MESSAGE_MIN..=MESSAGE_MAX).contains(&message.chars().count()) {
        errors.push(FieldError {
            field: "message",
            message: "Write between 10 and 5,000 characters.",
        });
    }

    if !errors.is_empty() {
        return Err(AppError::Validation(errors));
    }
    Ok(ContactMessage {
        name: name.into(),
        email: email.into(),
        message: message.into(),
    })
}

/// Deliberately loose: something on both sides of a single `@`, a dotted domain, and no
/// whitespace or control characters, since the address goes into a Reply-To header.
fn is_valid_email(email: &str) -> bool {
    let Some((local, domain)) = email.split_once('@') else {
        return false;
    };
    email.len() <= EMAIL_MAX
        && !local.is_empty()
        && !domain.contains('@')
        && domain.contains('.')
        && !domain.starts_with('.')
        && !domain.ends_with('.')
        && !email.chars().any(|c| c.is_whitespace() || c.is_control())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn email_validation() {
        for ok in ["a@b.co", "first.last+tag@sub.example.com"] {
            assert!(is_valid_email(ok), "{ok}");
        }
        for bad in [
            "",
            "plain",
            "@b.co",
            "a@",
            "a@b",
            "a@.co",
            "a@b.co.",
            "a@b@c.co",
            "a b@c.co",
            "a@b.co\r\nBcc: x@y.co",
        ] {
            assert!(!is_valid_email(bad), "{bad:?}");
        }
    }
}
