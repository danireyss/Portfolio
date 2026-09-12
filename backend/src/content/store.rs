//! Where content comes from at runtime, and how newer content is swapped in without a restart:
//!
//! - [`S3ContentStore`]: `content/` in the media bucket, in production once `CONTENT_BUCKET` is set.
//! - [`LocalContentStore`]: the repo's `content/` folder in development, re-read when files change.
//! - Neither, or a store with nothing in it yet: the copy built into the binary.

use std::fmt::Write as _;
use std::hash::{DefaultHasher, Hash, Hasher};
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard, RwLock};
use std::time::{Duration, Instant, UNIX_EPOCH};

use async_trait::async_trait;
use aws_sdk_s3::error::DisplayErrorContext;
use bytes::Bytes;
use futures::future::try_join_all;

use super::{Content, ContentError};
use crate::aws::Aws;
use crate::sync::{MutexExt, RwLockExt};

#[derive(Debug, thiserror::Error)]
#[error("{0}")]
pub struct ContentStoreError(pub String);

#[derive(Debug, thiserror::Error)]
pub enum LoadError {
    #[error(transparent)]
    Store(#[from] ContentStoreError),
    #[error(transparent)]
    Content(#[from] ContentError),
}

/// Content files as a store holds them, in the same layout as the repo's `content/` folder.
#[derive(Debug, Clone, Default)]
pub struct ContentSources {
    pub site_toml: String,
    /// Each project's path ("projects/<slug>.md") and text.
    pub projects: Vec<(String, String)>,
    pub resume_pdf: Option<Bytes>,
}

impl ContentSources {
    pub fn parse(&self) -> Result<Content, ContentError> {
        let projects: Vec<(String, &str)> = self
            .projects
            .iter()
            .map(|(path, text)| (path.clone(), text.as_str()))
            .collect();
        Content::from_sources(&self.site_toml, &projects, self.resume_pdf.clone())
    }

    /// Every file with its path, in the order to write them: `site.toml`, the projects, and the
    /// resume if there is one.
    pub fn files(&self) -> impl Iterator<Item = (&str, Bytes)> {
        let site = ("site.toml", Bytes::from(self.site_toml.clone()));
        let projects = self
            .projects
            .iter()
            .map(|(path, text)| (path.as_str(), Bytes::from(text.clone())));
        let resume = self.resume_pdf.clone().map(|pdf| ("resume.pdf", pdf));
        std::iter::once(site).chain(projects).chain(resume)
    }
}

#[async_trait]
pub trait ContentStore: Send + Sync {
    /// Changes whenever any content file does; `None` when the store has no content.
    async fn version(&self) -> Result<Option<String>, ContentStoreError>;
    /// All content files, or `None` when the store has no `site.toml` yet.
    async fn load(&self) -> Result<Option<ContentSources>, ContentStoreError>;
    /// Writes a content file, e.g. "site.toml" or "projects/<slug>.md".
    async fn put(&self, path: &str, bytes: Bytes) -> Result<(), ContentStoreError>;
    /// Deletes a content file; one that doesn't exist is fine.
    async fn delete(&self, path: &str) -> Result<(), ContentStoreError>;
    /// Marks the content as changed after writes, so every instance's next check reloads it.
    async fn touch_version(&self) -> Result<(), ContentStoreError>;
}

/// The content being served. Built from a store, it checks at most every `check_every` whether
/// the store has changed and swaps in the new content, so saves made by any instance reach them
/// all. New content that fails to load is logged and the current content stays.
pub struct ContentHandle {
    current: RwLock<Arc<Content>>,
    source: Option<Source>,
}

struct Source {
    store: Arc<dyn ContentStore>,
    check_every: Duration,
    state: Mutex<SourceState>,
}

struct SourceState {
    /// The store's version when `current` was loaded.
    version: Option<String>,
    checked: Instant,
    checking: bool,
}

impl Source {
    fn state(&self) -> MutexGuard<'_, SourceState> {
        self.state.lock_ignoring_poison()
    }
}

impl ContentHandle {
    /// Content that never changes: the embedded fallback, and tests.
    pub fn fixed(content: Content) -> Self {
        Self {
            current: RwLock::new(Arc::new(content)),
            source: None,
        }
    }

    /// Loads from `store`, or the embedded content if the store is empty.
    pub async fn from_store(
        store: Arc<dyn ContentStore>,
        check_every: Duration,
    ) -> Result<Self, LoadError> {
        // Read the version first: content saved in between is then seen as newer next time.
        let version = store.version().await?;
        let content = load_from(store.as_ref()).await?;
        Ok(Self {
            current: RwLock::new(Arc::new(content)),
            source: Some(Source {
                store,
                check_every,
                state: Mutex::new(SourceState {
                    version,
                    checked: Instant::now(),
                    checking: false,
                }),
            }),
        })
    }

    /// Where the content comes from; `None` for fixed content.
    pub fn store(&self) -> Option<&Arc<dyn ContentStore>> {
        self.source.as_ref().map(|source| &source.store)
    }

    /// The store's version of the content being served: `None` for fixed content, and while an
    /// empty store has the built-in content standing in.
    pub fn version(&self) -> Option<String> {
        self.source.as_ref()?.state().version.clone()
    }

    /// A short, header- and URL-safe tag for [`ContentHandle::version`]: what admin sends back
    /// as `If-Match`, and what `?v=` asks for.
    pub fn version_tag(&self) -> String {
        let Some(version) = self.version() else {
            return "built-in".into();
        };
        let mut hasher = DefaultHasher::new();
        version.hash(&mut hasher);
        format!("{:016x}", hasher.finish())
    }

    /// Loads the store's content now, whatever its version.
    pub async fn reload(&self) -> Result<(), LoadError> {
        let Some(source) = &self.source else {
            return Ok(());
        };
        let version = source.store.version().await?;
        let content = load_from(source.store.as_ref()).await?;
        self.swap_in(source, content, version);
        source.state().checked = Instant::now();
        Ok(())
    }

    /// The current content. When a check is due it also starts one in the background, whose
    /// result later requests see; this one never waits on the store.
    pub fn get(self: &Arc<Self>) -> Arc<Content> {
        if self.check_due() {
            let this = Arc::clone(self);
            tokio::spawn(async move {
                this.refresh().await;
            });
        }
        Arc::clone(&self.current.read_ignoring_poison())
    }

    /// Reloads if the store's version has changed; returns whether it did.
    pub async fn refresh(&self) -> bool {
        let Some(source) = &self.source else {
            return false;
        };
        let result = self.try_refresh(source).await;
        {
            let mut state = source.state();
            state.checking = false;
            state.checked = Instant::now();
        }
        result.unwrap_or_else(|error| {
            tracing::warn!(%error, "keeping the current content: loading the new version failed");
            false
        })
    }

    fn check_due(&self) -> bool {
        let Some(source) = &self.source else {
            return false;
        };
        let mut state = source.state();
        if state.checking || state.checked.elapsed() < source.check_every {
            return false;
        }
        state.checking = true;
        true
    }

    async fn try_refresh(&self, source: &Source) -> Result<bool, LoadError> {
        let latest = source.store.version().await?;
        if latest == self.version() {
            return Ok(false);
        }
        let content = load_from(source.store.as_ref()).await?;
        self.swap_in(source, content, latest);
        tracing::info!("loaded new content");
        Ok(true)
    }

    /// Serves `content`, which the store had at `version`.
    fn swap_in(&self, source: &Source, content: Content, version: Option<String>) {
        *self.current.write_ignoring_poison() = Arc::new(content);
        source.state().version = version;
    }
}

async fn load_from(store: &dyn ContentStore) -> Result<Content, LoadError> {
    match store.load().await? {
        Some(sources) => Ok(sources.parse()?),
        None => {
            tracing::info!("the content store is empty; serving the content built into the binary");
            Ok(Content::load_embedded()?)
        }
    }
}

fn utf8(path: &str, bytes: Vec<u8>) -> Result<String, ContentStoreError> {
    String::from_utf8(bytes).map_err(|_| ContentStoreError(format!("`{path}` is not valid UTF-8")))
}

/// The repo's `content/` folder, or `CONTENT_DIR`, for `make dev`.
pub struct LocalContentStore {
    root: PathBuf,
}

impl LocalContentStore {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    /// `CONTENT_DIR`, or the repo's content/ folder, located from this crate at compile time so
    /// it's found whatever directory the server starts in.
    pub fn from_env() -> Self {
        Self::new(std::env::var_os("CONTENT_DIR").map_or_else(
            || Path::new(env!("CARGO_MANIFEST_DIR")).join("../content"),
            PathBuf::from,
        ))
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    /// `projects/*.md`, sorted by name.
    async fn project_paths(&self) -> Result<Vec<PathBuf>, ContentStoreError> {
        let dir = self.root.join("projects");
        let mut entries = match tokio::fs::read_dir(&dir).await {
            Ok(entries) => entries,
            Err(e) if e.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
            Err(e) => return Err(io_error(&dir, e)),
        };
        let mut paths = Vec::new();
        while let Some(entry) = entries.next_entry().await.map_err(|e| io_error(&dir, e))? {
            let path = entry.path();
            if path.extension().is_some_and(|ext| ext == "md") {
                paths.push(path);
            }
        }
        paths.sort();
        Ok(paths)
    }
}

fn io_error(path: &Path, e: std::io::Error) -> ContentStoreError {
    ContentStoreError(format!("{}: {e}", path.display()))
}

/// A file's bytes, or `None` if it doesn't exist.
async fn read_optional(path: &Path) -> Result<Option<Vec<u8>>, ContentStoreError> {
    match tokio::fs::read(path).await {
        Ok(bytes) => Ok(Some(bytes)),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
        Err(e) => Err(io_error(path, e)),
    }
}

#[async_trait]
impl ContentStore for LocalContentStore {
    /// Every file's size and modification time, so any edit, addition, or removal changes it.
    async fn version(&self) -> Result<Option<String>, ContentStoreError> {
        let site = self.root.join("site.toml");
        let mut paths = vec![site.clone(), self.root.join("resume.pdf")];
        paths.extend(self.project_paths().await?);

        let mut version = String::new();
        for path in paths {
            match tokio::fs::metadata(&path).await {
                Ok(meta) => {
                    let modified = meta
                        .modified()
                        .ok()
                        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                        .unwrap_or_default();
                    let _ = write!(
                        version,
                        "{}:{}:{};",
                        path.display(),
                        meta.len(),
                        modified.as_nanos()
                    );
                }
                Err(e) if e.kind() == ErrorKind::NotFound && path == site => return Ok(None),
                Err(e) if e.kind() == ErrorKind::NotFound => {}
                Err(e) => return Err(io_error(&path, e)),
            }
        }
        Ok(Some(version))
    }

    async fn load(&self) -> Result<Option<ContentSources>, ContentStoreError> {
        let Some(site) = read_optional(&self.root.join("site.toml")).await? else {
            return Ok(None);
        };
        let mut projects = Vec::new();
        for path in self.project_paths().await? {
            let name = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default()
                .to_owned();
            let text = tokio::fs::read(&path)
                .await
                .map_err(|e| io_error(&path, e))?;
            projects.push((format!("projects/{name}"), utf8(&name, text)?));
        }
        let resume_pdf = read_optional(&self.root.join("resume.pdf"))
            .await?
            .map(Bytes::from);
        Ok(Some(ContentSources {
            site_toml: utf8("site.toml", site)?,
            projects,
            resume_pdf,
        }))
    }

    async fn put(&self, path: &str, bytes: Bytes) -> Result<(), ContentStoreError> {
        let target = self.root.join(path);
        if let Some(dir) = target.parent() {
            tokio::fs::create_dir_all(dir)
                .await
                .map_err(|e| io_error(dir, e))?;
        }
        // Write, then rename into place, so the reload check never reads half a file.
        let temp = target.with_extension("saving");
        tokio::fs::write(&temp, &bytes)
            .await
            .map_err(|e| io_error(&temp, e))?;
        tokio::fs::rename(&temp, &target)
            .await
            .map_err(|e| io_error(&target, e))
    }

    async fn delete(&self, path: &str) -> Result<(), ContentStoreError> {
        let target = self.root.join(path);
        match tokio::fs::remove_file(&target).await {
            Err(e) if e.kind() != ErrorKind::NotFound => Err(io_error(&target, e)),
            _ => Ok(()),
        }
    }

    /// The files' modification times already changed, which is what `version` reads.
    async fn touch_version(&self) -> Result<(), ContentStoreError> {
        Ok(())
    }
}

const S3_PREFIX: &str = "content/";

/// The key of a content file in the bucket: "site.toml" -> "content/site.toml".
fn s3_key(path: &str) -> String {
    format!("{S3_PREFIX}{path}")
}

/// `content/` in the media bucket, laid out like the repo's folder, plus a `version` object that
/// every save rewrites so other instances notice.
pub struct S3ContentStore {
    client: aws_sdk_s3::Client,
    bucket: String,
}

impl S3ContentStore {
    pub fn new(client: aws_sdk_s3::Client, bucket: impl Into<String>) -> Self {
        Self {
            client,
            bucket: bucket.into(),
        }
    }

    /// Configured by `CONTENT_BUCKET`; `None` when it's unset.
    pub async fn from_env(aws: &Aws) -> Option<Self> {
        let bucket = std::env::var("CONTENT_BUCKET").ok()?;
        Some(Self::new(aws.s3().await, bucket))
    }

    /// An object's bytes, or `None` if it doesn't exist.
    async fn get(&self, key: &str) -> Result<Option<Bytes>, ContentStoreError> {
        let response = match self
            .client
            .get_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await
        {
            Ok(response) => response,
            Err(e) if e.as_service_error().is_some_and(|e| e.is_no_such_key()) => {
                return Ok(None);
            }
            Err(e) => return Err(s3_error(key, &e)),
        };
        let body = response
            .body
            .collect()
            .await
            .map_err(|e| ContentStoreError(format!("{key}: {e}")))?;
        Ok(Some(body.into_bytes()))
    }

    /// An object's ETag, or `None` if it doesn't exist.
    async fn etag(&self, key: &str) -> Result<Option<String>, ContentStoreError> {
        match self
            .client
            .head_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await
        {
            Ok(head) => Ok(head.e_tag),
            Err(e) if e.as_service_error().is_some_and(|e| e.is_not_found()) => Ok(None),
            Err(e) => Err(s3_error(key, &e)),
        }
    }

    /// `content/projects/*.md`, sorted.
    async fn project_keys(&self) -> Result<Vec<String>, ContentStoreError> {
        let prefix = s3_key("projects/");
        let mut pages = self
            .client
            .list_objects_v2()
            .bucket(&self.bucket)
            .prefix(&prefix)
            .into_paginator()
            .send();
        let mut keys = Vec::new();
        while let Some(page) = pages.next().await {
            let page = page.map_err(|e| s3_error(&prefix, &e))?;
            keys.extend(
                page.contents()
                    .iter()
                    .filter_map(|object| object.key())
                    .filter(|key| {
                        key.strip_prefix(&prefix)
                            .is_some_and(|name| name.ends_with(".md") && !name.contains('/'))
                    })
                    .map(str::to_owned),
            );
        }
        keys.sort();
        Ok(keys)
    }

    /// A project's path relative to `content/` and its text; `None` if it was deleted since the
    /// listing.
    async fn project(&self, key: &str) -> Result<Option<(String, String)>, ContentStoreError> {
        let Some(bytes) = self.get(key).await? else {
            return Ok(None);
        };
        let path = key.strip_prefix(S3_PREFIX).unwrap_or(key).to_owned();
        Ok(Some((path, utf8(key, bytes.to_vec())?)))
    }
}

fn s3_error<E: std::error::Error>(key: &str, e: &E) -> ContentStoreError {
    ContentStoreError(format!("{key}: {}", DisplayErrorContext(e)))
}

#[async_trait]
impl ContentStore for S3ContentStore {
    async fn version(&self) -> Result<Option<String>, ContentStoreError> {
        // Saves rewrite `version`; a bucket seeded by hand may only have site.toml.
        match self.etag(&s3_key("version")).await? {
            Some(etag) => Ok(Some(etag)),
            None => self.etag(&s3_key("site.toml")).await,
        }
    }

    async fn load(&self) -> Result<Option<ContentSources>, ContentStoreError> {
        let site_key = s3_key("site.toml");
        let resume_key = s3_key("resume.pdf");
        let (site, keys, resume_pdf) = tokio::try_join!(
            self.get(&site_key),
            self.project_keys(),
            self.get(&resume_key)
        )?;
        let Some(site) = site else {
            return Ok(None);
        };
        let projects = try_join_all(keys.iter().map(|key| self.project(key)))
            .await?
            .into_iter()
            .flatten()
            .collect();
        Ok(Some(ContentSources {
            site_toml: utf8(&site_key, site.to_vec())?,
            projects,
            resume_pdf,
        }))
    }

    async fn put(&self, path: &str, bytes: Bytes) -> Result<(), ContentStoreError> {
        let key = s3_key(path);
        self.client
            .put_object()
            .bucket(&self.bucket)
            .key(&key)
            .body(bytes.into())
            .send()
            .await
            .map_err(|e| s3_error(&key, &e))?;
        Ok(())
    }

    async fn delete(&self, path: &str) -> Result<(), ContentStoreError> {
        let key = s3_key(path);
        self.client
            .delete_object()
            .bucket(&self.bucket)
            .key(&key)
            .send()
            .await
            .map_err(|e| s3_error(&key, &e))?;
        Ok(())
    }

    /// Rewrites `version` with the time; its new ETag is what `version()` reports.
    async fn touch_version(&self) -> Result<(), ContentStoreError> {
        let stamp = crate::since_unix_epoch().as_nanos();
        self.put("version", Bytes::from(stamp.to_string())).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn site(tagline: &str) -> String {
        format!(
            r#"
            [profile]
            name = "Test Person"
            headline = "Engineer"
            location = "Somewhere"
            tagline = "{tagline}"
            email = "test@example.com"

            [about]
            background = ["Paragraph."]
            "#
        )
    }

    const PROJECT: &str = "+++\ntitle = \"A\"\ncategory = \"C\"\nsummary = \"S\"\n+++\nBody.\n";

    /// Holds sources in memory; every `set` is a new version.
    #[derive(Default)]
    struct MemoryStore {
        sources: Mutex<Option<ContentSources>>,
        version: Mutex<u32>,
    }

    impl MemoryStore {
        fn with_site(site_toml: String) -> Arc<Self> {
            let store = Arc::new(Self::default());
            store.set(site_toml);
            store
        }

        fn set(&self, site_toml: String) {
            *self.sources.lock().unwrap() = Some(ContentSources {
                site_toml,
                ..Default::default()
            });
            *self.version.lock().unwrap() += 1;
        }
    }

    #[async_trait]
    impl ContentStore for MemoryStore {
        async fn version(&self) -> Result<Option<String>, ContentStoreError> {
            let has_content = self.sources.lock().unwrap().is_some();
            Ok(has_content.then(|| self.version.lock().unwrap().to_string()))
        }

        async fn load(&self) -> Result<Option<ContentSources>, ContentStoreError> {
            Ok(self.sources.lock().unwrap().clone())
        }

        async fn put(&self, path: &str, bytes: Bytes) -> Result<(), ContentStoreError> {
            let mut sources = self.sources.lock().unwrap();
            let sources = sources.get_or_insert_with(ContentSources::default);
            let text = String::from_utf8_lossy(&bytes).into_owned();
            match path {
                "site.toml" => sources.site_toml = text,
                "resume.pdf" => sources.resume_pdf = Some(bytes),
                _ => {
                    sources.projects.retain(|(p, _)| p != path);
                    sources.projects.push((path.to_owned(), text));
                }
            }
            Ok(())
        }

        async fn delete(&self, path: &str) -> Result<(), ContentStoreError> {
            if let Some(sources) = self.sources.lock().unwrap().as_mut() {
                sources.projects.retain(|(p, _)| p != path);
            }
            Ok(())
        }

        async fn touch_version(&self) -> Result<(), ContentStoreError> {
            *self.version.lock().unwrap() += 1;
            Ok(())
        }
    }

    fn tagline(handle: &Arc<ContentHandle>) -> String {
        handle.get().profile().tagline.clone()
    }

    #[tokio::test]
    async fn empty_store_serves_the_embedded_content() {
        let handle = ContentHandle::from_store(Arc::new(MemoryStore::default()), Duration::MAX)
            .await
            .unwrap();
        let embedded = Content::load_embedded().unwrap();
        assert_eq!(
            Arc::new(handle).get().profile().name,
            embedded.profile().name
        );
    }

    #[tokio::test]
    async fn refresh_swaps_in_new_versions_and_keeps_the_old_content_on_errors() {
        let store = MemoryStore::with_site(site("First"));
        let handle = Arc::new(
            ContentHandle::from_store(store.clone(), Duration::MAX)
                .await
                .unwrap(),
        );
        assert_eq!(tagline(&handle), "First");
        assert!(!handle.refresh().await, "nothing changed");

        store.set(site("Second"));
        assert!(handle.refresh().await);
        assert_eq!(tagline(&handle), "Second");

        store.set("not = [valid".into());
        assert!(!handle.refresh().await);
        assert_eq!(tagline(&handle), "Second", "broken content isn't served");
    }

    #[tokio::test]
    async fn get_checks_in_the_background_without_waiting() {
        let store = MemoryStore::with_site(site("First"));
        let handle = Arc::new(
            ContentHandle::from_store(store.clone(), Duration::ZERO)
                .await
                .unwrap(),
        );
        store.set(site("Second"));
        assert_eq!(tagline(&handle), "First", "this request doesn't wait");
        tokio::time::sleep(Duration::from_millis(20)).await;
        assert_eq!(tagline(&handle), "Second");
    }

    #[test]
    fn files_lists_site_projects_then_resume() {
        let sources = ContentSources {
            site_toml: "site".into(),
            projects: vec![("projects/a.md".into(), "a".into())],
            resume_pdf: Some(Bytes::from_static(b"pdf")),
        };
        let files: Vec<_> = sources.files().collect();
        assert_eq!(
            files,
            [
                ("site.toml", Bytes::from("site")),
                ("projects/a.md", Bytes::from("a")),
                ("resume.pdf", Bytes::from("pdf")),
            ]
        );
        let no_resume = ContentSources::default();
        assert_eq!(no_resume.files().count(), 1, "just site.toml");
    }

    #[tokio::test]
    async fn local_store_reads_the_folder_and_notices_changes() {
        let root = std::env::temp_dir().join(format!("portfolio-content-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let store = LocalContentStore::new(&root);
        assert_eq!(store.version().await.unwrap(), None);
        assert!(store.load().await.unwrap().is_none());

        std::fs::create_dir_all(root.join("projects")).unwrap();
        std::fs::write(root.join("site.toml"), site("First")).unwrap();
        std::fs::write(root.join("projects/a.md"), PROJECT).unwrap();
        std::fs::write(root.join("projects/notes.txt"), "ignored").unwrap();
        let first = store.version().await.unwrap();

        let content = store.load().await.unwrap().unwrap().parse().unwrap();
        assert_eq!(content.profile().tagline, "First");
        assert_eq!(content.project("a").unwrap().summary.title, "A");
        assert!(content.resume_pdf().is_none());

        std::fs::write(root.join("site.toml"), site("Much longer")).unwrap();
        let edited = store.version().await.unwrap();
        std::fs::remove_file(root.join("projects/a.md")).unwrap();
        let removed = store.version().await.unwrap();
        std::fs::remove_dir_all(&root).unwrap();

        assert!(first.is_some());
        assert_ne!(first, edited, "an edited file changes the version");
        assert_ne!(edited, removed, "a removed file changes the version");
    }
}
