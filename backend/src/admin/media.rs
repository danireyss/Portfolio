//! Files admin uploads: headshots (`uploads/`), gallery photos (`photos/<folder>/`), and the
//! resume (`content/resume.pdf`). In production the browser uploads straight to the media bucket
//! with a presigned URL; locally it PUTs to `/api/admin/files/<key>`, which writes into the repo.

use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::time::Duration;

use async_trait::async_trait;
use aws_sdk_s3::error::DisplayErrorContext;
use aws_sdk_s3::presigning::PresigningConfig;
use bytes::Bytes;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::aws::Aws;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum UploadKind {
    Headshot,
    Resume,
    Photo,
}

/// Where and how to upload a file, from `POST /api/admin/uploads`.
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct UploadTicket {
    /// PUT the file's bytes here.
    pub url: String,
    /// Headers to send with that PUT, as name/value pairs.
    pub headers: Vec<(String, String)>,
    /// Where the file is served once uploaded, e.g. "/photos/trip/01.jpg".
    pub path: String,
}

/// A URL to PUT a file to, and the headers that must go with it.
#[derive(Debug)]
pub struct PresignedUpload {
    pub url: String,
    pub headers: Vec<(String, String)>,
}

#[derive(Debug, thiserror::Error)]
pub enum MediaError {
    #[error("this store only takes uploads through presigned URLs")]
    Unsupported,
    #[error("`{0}` isn't a place uploads can go")]
    InvalidKey(String),
    #[error("{0}")]
    Failed(String),
}

#[async_trait]
pub trait MediaStore: Send + Sync {
    /// Where to PUT a file for `key`: "uploads/…", "photos/<folder>/<file>", or
    /// "content/resume.pdf".
    async fn upload_url(
        &self,
        key: &str,
        content_type: &str,
    ) -> Result<PresignedUpload, MediaError>;

    async fn delete(&self, key: &str) -> Result<(), MediaError>;

    /// Stores an uploaded file directly; only the local store supports this.
    async fn write(&self, _key: &str, _bytes: Bytes) -> Result<(), MediaError> {
        Err(MediaError::Unsupported)
    }
}

/// How long a presigned upload URL works.
const UPLOAD_EXPIRES: Duration = Duration::from_secs(600);

/// The media bucket. Content (`content/`) lives in the same bucket as photos and uploads.
pub struct S3MediaStore {
    client: aws_sdk_s3::Client,
    bucket: String,
}

impl S3MediaStore {
    pub fn new(client: aws_sdk_s3::Client, bucket: impl Into<String>) -> Self {
        Self {
            client,
            bucket: bucket.into(),
        }
    }

    /// Configured by `MEDIA_BUCKET`; `None` when it's unset.
    pub async fn from_env(aws: &Aws) -> Option<Self> {
        let bucket = std::env::var("MEDIA_BUCKET").ok()?;
        Some(Self::new(aws.s3().await, bucket))
    }
}

fn failed(e: impl std::fmt::Display) -> MediaError {
    MediaError::Failed(e.to_string())
}

#[async_trait]
impl MediaStore for S3MediaStore {
    async fn upload_url(
        &self,
        key: &str,
        content_type: &str,
    ) -> Result<PresignedUpload, MediaError> {
        let mut request = self
            .client
            .put_object()
            .bucket(&self.bucket)
            .key(key)
            .content_type(content_type);
        // Served through CloudFront; the same caching as `make upload-photos`.
        if !key.starts_with("content/") {
            request = request.cache_control("public, max-age=86400");
        }
        let presigned = request
            .presigned(PresigningConfig::expires_in(UPLOAD_EXPIRES).map_err(failed)?)
            .await
            .map_err(|e| failed(DisplayErrorContext(&e)))?;
        Ok(PresignedUpload {
            url: presigned.uri().to_owned(),
            headers: presigned
                .headers()
                .map(|(name, value)| (name.to_owned(), value.to_owned()))
                .collect(),
        })
    }

    async fn delete(&self, key: &str) -> Result<(), MediaError> {
        self.client
            .delete_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await
            .map_err(|e| failed(DisplayErrorContext(&e)))?;
        Ok(())
    }
}

/// Uploads written into the repo for `make dev`: photos and headshots under frontend/public/,
/// which Vite serves, and the resume into content/.
pub struct LocalMediaStore {
    public_dir: PathBuf,
    content_dir: PathBuf,
}

impl LocalMediaStore {
    pub fn new(public_dir: impl Into<PathBuf>, content_dir: impl Into<PathBuf>) -> Self {
        Self {
            public_dir: public_dir.into(),
            content_dir: content_dir.into(),
        }
    }

    /// `PUBLIC_DIR`, or the repo's frontend/public/ (found from this crate at compile time).
    pub fn from_env(content_dir: impl Into<PathBuf>) -> Self {
        let public_dir = std::env::var_os("PUBLIC_DIR").map_or_else(
            || Path::new(env!("CARGO_MANIFEST_DIR")).join("../frontend/public"),
            PathBuf::from,
        );
        Self::new(public_dir, content_dir)
    }

    /// The file for `key`, refusing anything but the three places uploads go.
    fn path(&self, key: &str) -> Result<PathBuf, MediaError> {
        let safe = !key
            .split('/')
            .any(|part| part.is_empty() || part.starts_with('.'));
        let invalid = || MediaError::InvalidKey(key.to_owned());
        if !safe {
            return Err(invalid());
        }
        if key == "content/resume.pdf" {
            Ok(self.content_dir.join("resume.pdf"))
        } else if key.starts_with("photos/") || key.starts_with("uploads/") {
            Ok(self.public_dir.join(key))
        } else {
            Err(invalid())
        }
    }
}

#[async_trait]
impl MediaStore for LocalMediaStore {
    async fn upload_url(
        &self,
        key: &str,
        content_type: &str,
    ) -> Result<PresignedUpload, MediaError> {
        self.path(key)?;
        Ok(PresignedUpload {
            url: format!("/api/admin/files/{key}"),
            headers: vec![("content-type".into(), content_type.into())],
        })
    }

    async fn delete(&self, key: &str) -> Result<(), MediaError> {
        match tokio::fs::remove_file(self.path(key)?).await {
            Err(e) if e.kind() != ErrorKind::NotFound => Err(failed(e)),
            _ => Ok(()),
        }
    }

    async fn write(&self, key: &str, bytes: Bytes) -> Result<(), MediaError> {
        let path = self.path(key)?;
        if let Some(dir) = path.parent() {
            tokio::fs::create_dir_all(dir).await.map_err(failed)?;
        }
        tokio::fs::write(&path, &bytes).await.map_err(failed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn local_store_only_writes_where_uploads_go() {
        let root = std::env::temp_dir().join(format!("portfolio-media-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let store = LocalMediaStore::new(root.join("public"), root.join("content"));
        let bytes = Bytes::from_static(b"x");

        for key in [
            "photos/trip/01.jpg",
            "uploads/headshot-1.png",
            "content/resume.pdf",
        ] {
            store.write(key, bytes.clone()).await.unwrap();
        }
        assert!(root.join("public/photos/trip/01.jpg").is_file());
        assert!(root.join("public/uploads/headshot-1.png").is_file());
        assert!(root.join("content/resume.pdf").is_file());

        for key in [
            "content/site.toml",
            "photos/../../etc/passwd",
            "photos/trip/.hidden",
            "photos//x.jpg",
            ".env",
            "other/file.txt",
        ] {
            assert!(
                matches!(
                    store.write(key, bytes.clone()).await,
                    Err(MediaError::InvalidKey(_))
                ),
                "{key}"
            );
        }

        store.delete("photos/trip/01.jpg").await.unwrap();
        assert!(!root.join("public/photos/trip/01.jpg").exists());
        store.delete("photos/trip/01.jpg").await.unwrap();
        std::fs::remove_dir_all(&root).unwrap();
    }
}
