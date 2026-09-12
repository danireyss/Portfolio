//! Clearing CloudFront's cached API responses after admin changes content, so visitors see it
//! right away instead of within the cache's 5 minutes.

use async_trait::async_trait;
use aws_sdk_cloudfront::error::DisplayErrorContext;
use aws_sdk_cloudfront::types::{InvalidationBatch, Paths};
use tokio::sync::OnceCell;

use crate::aws::Aws;

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
    aws: Aws,
    distribution_id: String,
    /// Built on the first invalidation; most instances never make one.
    client: OnceCell<aws_sdk_cloudfront::Client>,
}

impl CloudFrontInvalidator {
    /// Configured by `DISTRIBUTION_ID`; `None` when it's unset.
    pub fn from_env(aws: &Aws) -> Option<Self> {
        let distribution_id = std::env::var("DISTRIBUTION_ID").ok()?;
        Some(Self {
            aws: aws.clone(),
            distribution_id,
            client: OnceCell::new(),
        })
    }

    async fn client(&self) -> &aws_sdk_cloudfront::Client {
        self.client
            .get_or_init(|| async { aws_sdk_cloudfront::Client::new(self.aws.config().await) })
            .await
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
        let reference = crate::since_unix_epoch().as_nanos();
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
        self.client()
            .await
            .create_invalidation()
            .distribution_id(&self.distribution_id)
            .invalidation_batch(batch)
            .send()
            .await
            .map_err(|e| cdn_error(DisplayErrorContext(&e)))?;
        Ok(())
    }
}
