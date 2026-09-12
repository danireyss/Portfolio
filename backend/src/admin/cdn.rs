//! Clearing CloudFront's cached API responses after admin changes content, so visitors see it
//! right away instead of within the cache's 5 minutes.

use std::time::{SystemTime, UNIX_EPOCH};

use async_trait::async_trait;
use aws_sdk_cloudfront::error::DisplayErrorContext;
use aws_sdk_cloudfront::types::{InvalidationBatch, Paths};

#[derive(Debug, thiserror::Error)]
#[error("{0}")]
pub struct CdnError(pub String);

#[async_trait]
pub trait CacheInvalidator: Send + Sync {
    /// Paths like "/api/*".
    async fn invalidate(&self, paths: &[&str]) -> Result<(), CdnError>;
}

/// Nothing cached in front of the API (local development).
pub struct NoCdn;

#[async_trait]
impl CacheInvalidator for NoCdn {
    async fn invalidate(&self, _paths: &[&str]) -> Result<(), CdnError> {
        Ok(())
    }
}

pub struct CloudFrontInvalidator {
    client: aws_sdk_cloudfront::Client,
    distribution_id: String,
}

impl CloudFrontInvalidator {
    /// Configured by `DISTRIBUTION_ID`; `None` when it's unset.
    pub async fn from_env() -> Option<Self> {
        let distribution_id = std::env::var("DISTRIBUTION_ID").ok()?;
        let config = aws_config::load_defaults(aws_config::BehaviorVersion::latest()).await;
        Some(Self {
            client: aws_sdk_cloudfront::Client::new(&config),
            distribution_id,
        })
    }
}

fn cdn_error(e: impl std::fmt::Display) -> CdnError {
    CdnError(e.to_string())
}

#[async_trait]
impl CacheInvalidator for CloudFrontInvalidator {
    async fn invalidate(&self, paths: &[&str]) -> Result<(), CdnError> {
        let items: Vec<String> = paths.iter().map(|path| (*path).to_owned()).collect();
        // Must be unique per invalidation.
        let reference = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let batch = InvalidationBatch::builder()
            .caller_reference(format!("admin-{reference}"))
            .paths(
                Paths::builder()
                    .quantity(i32::try_from(items.len()).unwrap_or(i32::MAX))
                    .set_items(Some(items))
                    .build()
                    .map_err(cdn_error)?,
            )
            .build()
            .map_err(cdn_error)?;
        self.client
            .create_invalidation()
            .distribution_id(&self.distribution_id)
            .invalidation_batch(batch)
            .send()
            .await
            .map_err(|e| cdn_error(DisplayErrorContext(&e)))?;
        Ok(())
    }
}
