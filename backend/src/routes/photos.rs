use axum::Json;
use axum::extract::State;
use futures::future::try_join_all;
use serde::Serialize;
use ts_rs::TS;

use crate::AppState;
use crate::content::{Gallery, GalleryConfig, Photo};
use crate::error::AppError;

#[derive(Serialize, TS)]
#[ts(export)]
pub struct PhotosResponse {
    /// Galleries from site.toml, each with the photos currently in its media folder.
    pub galleries: Vec<Gallery>,
}

pub(crate) async fn photos(
    State(state): State<AppState>,
) -> Result<Json<PhotosResponse>, AppError> {
    // List every gallery folder at once rather than one after another.
    let configs = state.content.galleries();
    let listings = try_join_all(
        configs
            .iter()
            .map(|config| state.photos.list(&config.folder)),
    )
    .await?;
    let galleries = configs
        .iter()
        .zip(&listings)
        .map(|(config, files)| build_gallery(config, files))
        .collect();
    Ok(Json(PhotosResponse { galleries }))
}

/// Photos appear in file-name order; site.toml can add alt text, a caption, and a timeline
/// label per file.
fn build_gallery(config: &GalleryConfig, files: &[String]) -> Gallery {
    let photos = files
        .iter()
        .enumerate()
        .map(|(index, file)| {
            let details = config.photos.get(file).cloned().unwrap_or_default();
            Photo {
                src: format!("/photos/{}/{}", config.folder, encode_path_segment(file)),
                alt: details
                    .alt
                    .unwrap_or_else(|| format!("{}, photo {}", config.title, index + 1)),
                caption: details.caption,
                date: details.date,
            }
        })
        .collect();
    Gallery {
        title: config.title.clone(),
        description: config.description.clone(),
        photos,
    }
}

/// Percent-encodes everything but unreserved characters, so names with spaces make valid URLs.
fn encode_path_segment(segment: &str) -> String {
    segment
        .bytes()
        .map(|b| {
            if b.is_ascii_alphanumeric() || b"-._~".contains(&b) {
                char::from(b).to_string()
            } else {
                format!("%{b:02X}")
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_file_names_for_urls() {
        assert_eq!(encode_path_segment("01.jpg"), "01.jpg");
        assert_eq!(
            encode_path_segment("My Photo #1.jpg"),
            "My%20Photo%20%231.jpg"
        );
    }
}
