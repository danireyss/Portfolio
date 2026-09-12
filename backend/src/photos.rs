//! Where gallery photos come from: `photos/<folder>/` in the S3 media bucket in production, or a
//! local folder (frontend/public/photos/, which Vite serves) in development. Only the listing
//! goes through here; the images themselves are served by CloudFront or Vite.

use std::collections::HashMap;
use std::io::ErrorKind;
use std::path::PathBuf;
use std::sync::{Mutex, PoisonError};
use std::time::{Duration, Instant};

use async_trait::async_trait;
use aws_sdk_s3::error::DisplayErrorContext;

const IMAGE_EXTENSIONS: [&str; 6] = ["jpg", "jpeg", "png", "webp", "avif", "gif"];

#[derive(Debug, thiserror::Error)]
#[error("{0}")]
pub struct PhotoStoreError(pub String);

#[async_trait]
pub trait PhotoStore: Send + Sync {
    /// Image file names directly inside `photos/<folder>/`, sorted by name.
    async fn list(&self, folder: &str) -> Result<Vec<String>, PhotoStoreError>;

    /// Forgets any cached listings, after admin adds or removes photos.
    fn invalidate(&self) {}
}

/// Image files only, skipping dotfiles like `.DS_Store` and macOS `._` copies.
fn is_image(name: &str) -> bool {
    !name.starts_with('.')
        && name
            .rsplit_once('.')
            .is_some_and(|(_, ext)| IMAGE_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()))
}

/// Lists `photos/<folder>/` in the media bucket.
pub struct S3PhotoStore {
    client: aws_sdk_s3::Client,
    bucket: String,
}

impl S3PhotoStore {
    /// Configured by `MEDIA_BUCKET`; `None` when it's unset.
    pub async fn from_env() -> Option<Self> {
        let bucket = std::env::var("MEDIA_BUCKET").ok()?;
        let config = aws_config::load_defaults(aws_config::BehaviorVersion::latest()).await;
        Some(Self {
            client: aws_sdk_s3::Client::new(&config),
            bucket,
        })
    }
}

#[async_trait]
impl PhotoStore for S3PhotoStore {
    #[tracing::instrument(name = "photos.list", skip(self), fields(store = "s3"), err)]
    async fn list(&self, folder: &str) -> Result<Vec<String>, PhotoStoreError> {
        let prefix = format!("photos/{folder}/");
        let mut pages = self
            .client
            .list_objects_v2()
            .bucket(&self.bucket)
            .prefix(&prefix)
            .into_paginator()
            .send();

        let mut names = Vec::new();
        while let Some(page) = pages.next().await {
            let page = page.map_err(|e| PhotoStoreError(DisplayErrorContext(&e).to_string()))?;
            for object in page.contents() {
                if let Some(name) = object.key().and_then(|key| key.strip_prefix(&prefix))
                    && !name.contains('/')
                    && is_image(name)
                {
                    names.push(name.to_owned());
                }
            }
        }
        names.sort();
        Ok(names)
    }
}

/// Remembers each folder's listing for `ttl`, so most requests on a warm Lambda instance skip the
/// S3 round trip. Newly uploaded photos appear within `ttl` (plus CloudFront's API cache). Errors
/// aren't cached.
pub struct CachedPhotoStore<S> {
    inner: S,
    ttl: Duration,
    listings: Mutex<HashMap<String, (Instant, Vec<String>)>>,
}

impl<S> CachedPhotoStore<S> {
    pub fn new(inner: S, ttl: Duration) -> Self {
        Self {
            inner,
            ttl,
            listings: Mutex::default(),
        }
    }
}

#[async_trait]
impl<S: PhotoStore> PhotoStore for CachedPhotoStore<S> {
    async fn list(&self, folder: &str) -> Result<Vec<String>, PhotoStoreError> {
        // The lock is released at the end of each statement, never held across an await.
        let cached = self
            .listings
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .get(folder)
            .filter(|(fetched, _)| fetched.elapsed() < self.ttl)
            .map(|(_, names)| names.clone());
        if let Some(names) = cached {
            return Ok(names);
        }

        let names = self.inner.list(folder).await?;
        self.listings
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .insert(folder.to_owned(), (Instant::now(), names.clone()));
        Ok(names)
    }

    fn invalidate(&self) {
        self.listings
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clear();
    }
}

/// For local development: lists `<root>/<folder>/`.
pub struct LocalPhotoStore {
    root: PathBuf,
}

impl LocalPhotoStore {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }
}

#[async_trait]
impl PhotoStore for LocalPhotoStore {
    #[tracing::instrument(name = "photos.list", skip(self), fields(store = "local"), err)]
    async fn list(&self, folder: &str) -> Result<Vec<String>, PhotoStoreError> {
        let dir = self.root.join(folder);
        let error = |e: std::io::Error| PhotoStoreError(format!("{}: {e}", dir.display()));
        let mut entries = match tokio::fs::read_dir(&dir).await {
            Ok(entries) => entries,
            // A gallery whose folder doesn't exist yet just has no photos.
            Err(e) if e.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
            Err(e) => return Err(error(e)),
        };

        let mut names = Vec::new();
        while let Some(entry) = entries.next_entry().await.map_err(error)? {
            let name = entry.file_name();
            if let Some(name) = name.to_str()
                && is_image(name)
                && entry.file_type().await.map_err(error)?.is_file()
            {
                names.push(name.to_owned());
            }
        }
        names.sort();
        Ok(names)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_image_files() {
        for name in ["01.jpg", "a.JPEG", "b.png", "c.webp"] {
            assert!(is_image(name), "{name}");
        }
        for name in [".DS_Store", "._01.jpg", "notes.txt", "jpg", "README"] {
            assert!(!is_image(name), "{name}");
        }
    }

    /// Counts how often it's asked to list.
    struct CountingStore(std::sync::atomic::AtomicUsize);

    #[async_trait]
    impl PhotoStore for CountingStore {
        async fn list(&self, _folder: &str) -> Result<Vec<String>, PhotoStoreError> {
            self.0.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            Ok(vec!["01.jpg".into()])
        }
    }

    fn calls(store: &CachedPhotoStore<CountingStore>) -> usize {
        store.inner.0.load(std::sync::atomic::Ordering::SeqCst)
    }

    #[tokio::test]
    async fn cached_store_reuses_listings_until_they_expire() {
        let cached = CachedPhotoStore::new(CountingStore(0.into()), Duration::from_secs(60));
        assert_eq!(cached.list("trip").await.unwrap(), ["01.jpg"]);
        assert_eq!(cached.list("trip").await.unwrap(), ["01.jpg"]);
        assert_eq!(
            calls(&cached),
            1,
            "second listing should come from the cache"
        );
        cached.list("other").await.unwrap();
        assert_eq!(calls(&cached), 2, "each folder is cached separately");

        let expiring = CachedPhotoStore::new(CountingStore(0.into()), Duration::ZERO);
        expiring.list("trip").await.unwrap();
        expiring.list("trip").await.unwrap();
        assert_eq!(calls(&expiring), 2, "expired listings are fetched again");

        cached.invalidate();
        cached.list("trip").await.unwrap();
        assert_eq!(calls(&cached), 3, "invalidate forgets cached listings");
    }

    #[tokio::test]
    async fn local_store_lists_images_sorted() {
        let root = std::env::temp_dir().join(format!("portfolio-photos-{}", std::process::id()));
        let dir = root.join("trip");
        std::fs::create_dir_all(dir.join("nested")).unwrap();
        for name in ["02.jpg", "01.png", "notes.txt", ".DS_Store"] {
            std::fs::write(dir.join(name), b"x").unwrap();
        }

        let store = LocalPhotoStore::new(&root);
        let listed = store.list("trip").await;
        let missing = store.list("missing").await;
        std::fs::remove_dir_all(&root).unwrap();

        assert_eq!(listed.unwrap(), ["01.png", "02.jpg"]);
        assert!(missing.unwrap().is_empty());
    }
}
