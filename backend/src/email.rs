//! Delivery of contact-form messages.

use async_trait::async_trait;
use aws_sdk_sesv2::error::DisplayErrorContext;
use aws_sdk_sesv2::types::{Body, Content as EmailText, Destination, EmailContent, Message};

use crate::aws::Aws;

/// A validated contact-form submission.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContactMessage {
    pub name: String,
    pub email: String,
    pub message: String,
}

#[derive(Debug, thiserror::Error)]
#[error("{0}")]
pub struct MailError(pub String);

#[async_trait]
pub trait Mailer: Send + Sync {
    async fn send(&self, message: &ContactMessage) -> Result<(), MailError>;
}

/// For local development: logs messages instead of sending them.
pub struct LogMailer;

#[async_trait]
impl Mailer for LogMailer {
    async fn send(&self, m: &ContactMessage) -> Result<(), MailError> {
        tracing::info!(
            name = %m.name,
            email = %m.email,
            message = %m.message,
            "contact message (LogMailer: not sent)"
        );
        Ok(())
    }
}

/// Sends through Amazon SES from a verified identity to the site owner, with Reply-To set to
/// the visitor. In the SES sandbox this works as long as both addresses are verified.
pub struct SesMailer {
    client: aws_sdk_sesv2::Client,
    from: String,
    to: String,
}

impl SesMailer {
    /// Configured by `CONTACT_TO_EMAIL` and `CONTACT_FROM_EMAIL`; `Ok(None)` when
    /// `CONTACT_TO_EMAIL` is unset.
    pub async fn from_env(aws: &Aws) -> Result<Option<Self>, MailError> {
        let Ok(to) = std::env::var("CONTACT_TO_EMAIL") else {
            return Ok(None);
        };
        let from = std::env::var("CONTACT_FROM_EMAIL").map_err(|_| {
            MailError("CONTACT_FROM_EMAIL must be set when CONTACT_TO_EMAIL is".into())
        })?;
        Ok(Some(Self {
            client: aws_sdk_sesv2::Client::new(aws.config().await),
            from,
            to,
        }))
    }
}

#[async_trait]
impl Mailer for SesMailer {
    // No fields: the message holds the visitor's name and email address.
    #[tracing::instrument(name = "ses.send_email", skip_all, err)]
    async fn send(&self, m: &ContactMessage) -> Result<(), MailError> {
        let text = |data: String| {
            EmailText::builder()
                .data(data)
                .charset("UTF-8")
                .build()
                .map_err(|e| MailError(e.to_string()))
        };
        let message = Message::builder()
            .subject(text(format!("Portfolio contact from {}", m.name))?)
            .body(
                Body::builder()
                    .text(text(format!(
                        "From: {} <{}>\n\n{}",
                        m.name, m.email, m.message
                    ))?)
                    .build(),
            )
            .build();

        self.client
            .send_email()
            .from_email_address(&self.from)
            .destination(Destination::builder().to_addresses(&self.to).build())
            .reply_to_addresses(&m.email)
            .content(EmailContent::builder().simple(message).build())
            .send()
            .await
            .map_err(|e| MailError(DisplayErrorContext(&e).to_string()))?;
        Ok(())
    }
}
