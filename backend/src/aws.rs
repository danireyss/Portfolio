//! One AWS setup for everything that talks to AWS: content, photos, uploads, email, and
//! CloudFront. The configuration is loaded once and every client shares its HTTP client, so TLS
//! is set up once and connections are reused. Nothing loads until something needs it, so local
//! development without AWS settings never touches it.

use std::sync::Arc;

use aws_config::{BehaviorVersion, SdkConfig};
use tokio::sync::OnceCell;

/// Cheap to clone; clones share the same configuration and clients.
#[derive(Clone, Default)]
pub struct Aws(Arc<Inner>);

#[derive(Default)]
struct Inner {
    config: OnceCell<SdkConfig>,
    s3: OnceCell<aws_sdk_s3::Client>,
}

impl Aws {
    pub fn new() -> Self {
        Self::default()
    }

    /// The configuration (region, credentials, HTTP client), loaded on first use.
    pub async fn config(&self) -> &SdkConfig {
        self.0
            .config
            .get_or_init(|| aws_config::load_defaults(BehaviorVersion::latest()))
            .await
    }

    /// The S3 client shared by the content, photo, and upload stores.
    pub async fn s3(&self) -> aws_sdk_s3::Client {
        self.0
            .s3
            .get_or_init(|| async { aws_sdk_s3::Client::new(self.config().await) })
            .await
            .clone()
    }
}
