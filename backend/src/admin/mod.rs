//! Owner-only editing of the site's content (`/api/admin/*`, handled in `routes/admin.rs`).
//!
//! Signing in happens in the Better Auth service (`auth/`); this side only asks it who's signed
//! in. Anyone who isn't the owner gets the same 404 as any unknown path, so the admin API doesn't
//! reveal that it exists.

mod auth;
mod cdn;
mod media;

pub use auth::{AdminAuth, AuthError, BetterAuthSessions, SessionUser};
pub use cdn::{CacheInvalidator, CdnError, CloudFrontInvalidator, NoCdn};
pub use media::{
    LocalMediaStore, MediaError, MediaStore, PresignedUpload, S3MediaStore, UploadKind,
    UploadTicket,
};

use std::sync::Arc;

pub struct Admin {
    pub auth: Arc<dyn AdminAuth>,
    /// The only account let in.
    pub email: String,
    /// Where changes may come from (the `Origin` header), e.g. "https://danireyss.dev".
    pub origins: Vec<String>,
    /// Uploads (headshot, resume, photos) and photo deletions.
    pub media: Arc<dyn MediaStore>,
    /// Clears CloudFront's cached API responses after a change.
    pub cdn: Arc<dyn CacheInvalidator>,
    /// Saves on this instance happen one at a time.
    pub(crate) writes: tokio::sync::Mutex<()>,
}

impl Admin {
    pub fn new(
        auth: Arc<dyn AdminAuth>,
        email: impl Into<String>,
        origins: Vec<String>,
        media: Arc<dyn MediaStore>,
        cdn: Arc<dyn CacheInvalidator>,
    ) -> Self {
        Self {
            auth,
            email: email.into(),
            origins,
            media,
            cdn,
            writes: tokio::sync::Mutex::new(()),
        }
    }
}
