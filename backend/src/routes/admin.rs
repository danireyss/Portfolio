//! `/api/admin/*`: owner-only editing. Every handler takes [`Owner`] first, so anyone else gets
//! the same 404 as an unknown path before a body is even read.

use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use axum::extract::{DefaultBodyLimit, FromRequestParts, Path, State};
use axum::http::header::{COOKIE, IF_MATCH, ORIGIN};
use axum::http::request::Parts;
use axum::http::{HeaderMap, StatusCode};
use axum::routing::{delete, get, post, put};
use axum::{Json, Router};
use bytes::Bytes;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::AppState;
use crate::admin::{Admin, MediaError, UploadKind, UploadTicket};
use crate::content::{
    Content, ContentSources, ContentStore, FrontMatter, ProjectSource, SiteFile, is_slug,
    project_file, site_toml,
};
use crate::error::AppError;

/// Photos straight from a phone can be several megabytes (local uploads only; production uploads
/// go straight to S3).
const MAX_UPLOAD: usize = 25 * 1024 * 1024;

pub(crate) fn router() -> Router<AppState> {
    Router::new()
        .route("/content", get(content))
        .route("/site", put(save_site))
        .route("/projects/{slug}", put(save_project).delete(delete_project))
        .route("/uploads", post(upload))
        .route(
            "/files/{*key}",
            put(write_file).layer(DefaultBodyLimit::max(MAX_UPLOAD)),
        )
        .route("/photos/{folder}/{file}", delete(delete_photo))
        .route("/reload", post(reload))
}

/// The request comes from the site's owner: a Better Auth session for `ADMIN_EMAIL` with a
/// verified address, and for anything but reads, an allowed `Origin` too. Otherwise, 404.
pub(crate) struct Owner;

impl FromRequestParts<AppState> for Owner {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, AppError> {
        let admin = state.admin.as_ref().ok_or(AppError::NotFound)?;
        if !parts.method.is_safe() {
            let origin = parts.headers.get(ORIGIN).and_then(|v| v.to_str().ok());
            if !origin.is_some_and(|origin| admin.origins.iter().any(|allowed| allowed == origin)) {
                return Err(AppError::NotFound);
            }
        }
        // HTTP/2 may split cookies across several headers.
        let cookie = parts
            .headers
            .get_all(COOKIE)
            .iter()
            .filter_map(|v| v.to_str().ok())
            .collect::<Vec<_>>()
            .join("; ");
        if cookie.is_empty() {
            return Err(AppError::NotFound);
        }
        match admin.auth.user(&cookie).await {
            Ok(Some(user))
                if user.email_verified && user.email.eq_ignore_ascii_case(&admin.email) =>
            {
                Ok(Owner)
            }
            Ok(_) => Err(AppError::NotFound),
            Err(error) => {
                tracing::warn!(%error, "couldn't check the admin session");
                Err(AppError::NotFound)
            }
        }
    }
}

/// Everything admin edits, from `GET /api/admin/content` and returned by every save.
#[derive(Serialize, TS)]
#[ts(export)]
pub struct AdminContent {
    /// Send back as `If-Match` when saving; a save based on older content is refused (409).
    pub version: String,
    pub site: SiteFile,
    pub projects: Vec<ProjectSource>,
    pub has_resume: bool,
}

/// A project as admin saves it.
#[derive(Deserialize, TS)]
#[ts(export)]
pub struct ProjectInput {
    pub front: FrontMatter,
    pub markdown: String,
}

#[derive(Deserialize, TS)]
#[ts(export)]
pub struct UploadRequest {
    pub kind: UploadKind,
    /// The gallery folder, for photos.
    pub folder: Option<String>,
    /// The file's name on your computer: its extension picks the type, and photos keep a
    /// cleaned-up version of the name (they're shown in name order).
    pub filename: String,
}

fn admin(state: &AppState) -> Result<&Arc<Admin>, AppError> {
    state.admin.as_ref().ok_or(AppError::NotFound)
}

fn store(state: &AppState) -> Result<Arc<dyn ContentStore>, AppError> {
    state.content.store().cloned().ok_or(AppError::NotFound)
}

fn storage(error: impl std::fmt::Display) -> AppError {
    AppError::Storage(error.to_string())
}

fn invalid(error: impl std::fmt::Display) -> AppError {
    AppError::InvalidContent(error.to_string())
}

fn document(state: &AppState) -> AdminContent {
    let content = state.content.get();
    AdminContent {
        version: state.content.version_tag(),
        site: content.site_file().clone(),
        projects: content.project_sources().to_vec(),
        has_resume: content.resume_pdf().is_some(),
    }
}

async fn content(_: Owner, State(state): State<AppState>) -> Json<AdminContent> {
    // Edit the latest version, not one this instance hasn't noticed yet.
    state.content.refresh().await;
    Json(document(&state))
}

async fn save_site(
    _: Owner,
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(site): Json<SiteFile>,
) -> Result<Json<AdminContent>, AppError> {
    let text = site_toml(&site).map_err(invalid)?;
    save(&state, &headers, |_| {
        Ok(vec![Change::Put("site.toml".into(), text)])
    })
    .await
}

async fn save_project(
    _: Owner,
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    Json(input): Json<ProjectInput>,
) -> Result<Json<AdminContent>, AppError> {
    if !is_slug(&slug) {
        return Err(invalid(
            "A project's URL name may only use lowercase letters, digits, and dashes.",
        ));
    }
    let text = project_file(&input.front, &input.markdown).map_err(invalid)?;
    save(&state, &headers, |_| {
        Ok(vec![Change::Put(format!("projects/{slug}.md"), text)])
    })
    .await
}

async fn delete_project(
    _: Owner,
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Json<AdminContent>, AppError> {
    save(&state, &headers, |content| {
        content.project(&slug).ok_or(AppError::NotFound)?;
        Ok(vec![Change::Delete(format!("projects/{slug}.md"))])
    })
    .await
}

/// A change to one content file, by path ("site.toml", "projects/<slug>.md").
enum Change {
    Put(String, String),
    Delete(String),
}

impl Change {
    fn apply(&self, sources: &mut ContentSources) {
        match self {
            Change::Put(path, text) if path == "site.toml" => sources.site_toml.clone_from(text),
            Change::Put(path, text) => match sources.projects.iter_mut().find(|(p, _)| p == path) {
                Some(project) => project.1.clone_from(text),
                None => sources.projects.push((path.clone(), text.clone())),
            },
            Change::Delete(path) => sources.projects.retain(|(p, _)| p != path),
        }
    }
}

/// Makes `edit`'s changes to the latest content, checks the result still loads, then saves and
/// publishes it. Refused with 409 if `If-Match` names an older version.
async fn save(
    state: &AppState,
    headers: &HeaderMap,
    edit: impl FnOnce(&Content) -> Result<Vec<Change>, AppError>,
) -> Result<Json<AdminContent>, AppError> {
    let admin = admin(state)?;
    let store = store(state)?;
    let _one_at_a_time = admin.writes.lock().await;

    state.content.refresh().await;
    if let Some(expected) = headers.get(IF_MATCH).and_then(|v| v.to_str().ok())
        && expected != state.content.version_tag()
    {
        return Err(AppError::Conflict);
    }
    let current = state.content.get();
    let changes = edit(&current)?;
    let mut next = current.sources().clone();
    for change in &changes {
        change.apply(&mut next);
    }
    next.parse().map_err(invalid)?;

    if state.content.version().is_none() {
        seed(store.as_ref(), current.sources()).await?;
    }
    for change in changes {
        match change {
            Change::Put(path, text) => store.put(&path, text.into()).await,
            Change::Delete(path) => store.delete(&path).await,
        }
        .map_err(storage)?;
    }
    publish(state, admin, store.as_ref()).await?;
    Ok(Json(document(state)))
}

/// An empty store is serving the content built into the binary: save all of it before the first
/// change, so the rest isn't lost when the store takes over.
async fn seed(store: &dyn ContentStore, sources: &ContentSources) -> Result<(), AppError> {
    store
        .put("site.toml", sources.site_toml.clone().into())
        .await
        .map_err(storage)?;
    for (path, text) in &sources.projects {
        store
            .put(path, text.clone().into())
            .await
            .map_err(storage)?;
    }
    if let Some(pdf) = &sources.resume_pdf {
        store
            .put("resume.pdf", pdf.clone())
            .await
            .map_err(storage)?;
    }
    Ok(())
}

/// After a change: tells other instances, serves it here, and clears cached copies.
async fn publish(
    state: &AppState,
    admin: &Admin,
    store: &dyn ContentStore,
) -> Result<(), AppError> {
    store.touch_version().await.map_err(storage)?;
    state.content.reload().await.map_err(storage)?;
    state.photos.invalidate();
    clear_cdn(admin).await;
    Ok(())
}

async fn clear_cdn(admin: &Admin) {
    if let Err(error) = admin.cdn.invalidate(&["/api/*"]).await {
        tracing::warn!(%error, "couldn't clear CloudFront's cached API responses; they expire within 5 minutes");
    }
}

/// Where to upload a file. Photos and the resume take effect after `POST /api/admin/reload`; a
/// headshot, once its path is saved as the profile's `headshot`.
async fn upload(
    _: Owner,
    State(state): State<AppState>,
    Json(request): Json<UploadRequest>,
) -> Result<Json<UploadTicket>, AppError> {
    let admin = admin(&state)?;
    let target = upload_target(&request)?;
    if request.kind == UploadKind::Resume && state.content.version().is_none() {
        // Otherwise the built-in content, standing in for an empty store, would hide the upload.
        let store = store(&state)?;
        let _one_at_a_time = admin.writes.lock().await;
        seed(store.as_ref(), state.content.get().sources()).await?;
        publish(&state, admin, store.as_ref()).await?;
    }
    let presigned = admin
        .media
        .upload_url(&target.key, target.content_type)
        .await
        .map_err(storage)?;
    Ok(Json(UploadTicket {
        url: presigned.url,
        headers: presigned.headers,
        path: target.path,
    }))
}

struct UploadTarget {
    key: String,
    content_type: &'static str,
    path: String,
}

fn upload_target(request: &UploadRequest) -> Result<UploadTarget, AppError> {
    let (stem, ext) = split_name(&request.filename);
    let image =
        || image_type(&ext).ok_or_else(|| invalid("Upload a JPEG, PNG, WebP, AVIF, or GIF image."));
    match request.kind {
        UploadKind::Resume => {
            if ext != "pdf" {
                return Err(invalid("The resume must be a PDF."));
            }
            Ok(UploadTarget {
                key: "content/resume.pdf".into(),
                content_type: "application/pdf",
                path: "/api/resume.pdf".into(),
            })
        }
        UploadKind::Headshot => {
            let content_type = image()?;
            // A new name each time, so browsers and CloudFront never show a cached old one.
            let millis = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis();
            let key = format!("uploads/headshot-{millis}.{ext}");
            Ok(UploadTarget {
                path: format!("/{key}"),
                key,
                content_type,
            })
        }
        UploadKind::Photo => {
            let folder = request
                .folder
                .as_deref()
                .filter(|folder| is_slug(folder))
                .ok_or_else(|| invalid("Choose which gallery the photo goes in."))?;
            let content_type = image()?;
            let key = format!("photos/{folder}/{stem}.{ext}");
            Ok(UploadTarget {
                path: format!("/{key}"),
                key,
                content_type,
            })
        }
    }
}

fn image_type(ext: &str) -> Option<&'static str> {
    Some(match ext {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "gif" => "image/gif",
        _ => return None,
    })
}

/// "My Photo (1).JPG" -> ("my-photo-1", "jpg"): safe in URLs, S3 keys, and file names.
fn split_name(filename: &str) -> (String, String) {
    let (stem, ext) = filename.rsplit_once('.').unwrap_or((filename, ""));
    let mut clean = String::with_capacity(stem.len());
    for c in stem.chars() {
        if c.is_ascii_alphanumeric() {
            clean.push(c.to_ascii_lowercase());
        } else if !clean.is_empty() && !clean.ends_with('-') {
            clean.push('-');
        }
    }
    let clean = clean.trim_end_matches('-');
    let stem = if clean.is_empty() { "photo" } else { clean };
    (stem.to_owned(), ext.to_ascii_lowercase())
}

/// Local development only: where the browser PUTs uploads (see `LocalMediaStore`).
async fn write_file(
    _: Owner,
    State(state): State<AppState>,
    Path(key): Path<String>,
    body: Bytes,
) -> Result<StatusCode, AppError> {
    match admin(&state)?.media.write(&key, body).await {
        Ok(()) => Ok(StatusCode::NO_CONTENT),
        Err(MediaError::Unsupported | MediaError::InvalidKey(_)) => Err(AppError::NotFound),
        Err(error) => Err(storage(error)),
    }
}

async fn delete_photo(
    _: Owner,
    State(state): State<AppState>,
    Path((folder, file)): Path<(String, String)>,
) -> Result<StatusCode, AppError> {
    let admin = admin(&state)?;
    if !is_slug(&folder) || file.is_empty() || file.starts_with('.') || file.contains('/') {
        return Err(AppError::NotFound);
    }
    admin
        .media
        .delete(&format!("photos/{folder}/{file}"))
        .await
        .map_err(storage)?;
    state.photos.invalidate();
    clear_cdn(admin).await;
    Ok(StatusCode::NO_CONTENT)
}

/// After uploading photos or a resume: loads what's in the store now and clears cached copies.
async fn reload(_: Owner, State(state): State<AppState>) -> Result<Json<AdminContent>, AppError> {
    let admin = admin(&state)?;
    let store = store(&state)?;
    let _one_at_a_time = admin.writes.lock().await;
    publish(&state, admin, store.as_ref()).await?;
    Ok(Json(document(&state)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cleans_up_uploaded_file_names() {
        let split = |name| {
            let (stem, ext) = split_name(name);
            (stem, ext)
        };
        assert_eq!(
            split("My Photo (1).JPG"),
            ("my-photo-1".into(), "jpg".into())
        );
        assert_eq!(split("résumé.pdf"), ("r-sum".into(), "pdf".into()));
        assert_eq!(split("???.png"), ("photo".into(), "png".into()));
        assert_eq!(
            split("no-extension"),
            ("no-extension".into(), String::new())
        );
    }
}
