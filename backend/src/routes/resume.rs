use axum::Json;
use axum::extract::{Query, State};
use axum::http::header;
use axum::response::{IntoResponse, Response};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::AppState;
use crate::content::{Award, Content, Education, Experience, Profile, SkillGroup, Social};
use crate::error::AppError;

#[derive(Serialize, TS)]
#[ts(export)]
pub struct ResumeResponse<'a> {
    pub profile: &'a Profile,
    pub socials: &'a [Social],
    pub experience: &'a [Experience],
    pub education: &'a [Education],
    pub skill_groups: &'a [SkillGroup],
    pub awards: &'a [Award],
    /// Where the PDF is served, e.g. "/api/resume.pdf?v=…"; `None` when there isn't one.
    pub pdf_url: Option<String>,
}

pub(crate) async fn resume(State(state): State<AppState>) -> Response {
    let content = state.content.get();
    Json(ResumeResponse {
        profile: content.profile(),
        socials: content.socials(),
        experience: content.experience(),
        education: content.education(),
        skill_groups: content.skill_groups(),
        awards: content.awards(),
        pdf_url: pdf_url(&state, &content),
    })
    .into_response()
}

/// `/api/resume.pdf` at the content's version, or `None` without a PDF. A new upload gets a new
/// URL, so neither browsers nor CloudFront keep showing the old PDF, and an instance that hasn't
/// loaded it yet checks the store first (see `fresh_content`).
pub(crate) fn pdf_url(state: &AppState, content: &Content) -> Option<String> {
    content
        .resume_pdf()
        .map(|_| format!("/api/resume.pdf?v={}", state.content.version_tag()))
}

#[derive(Deserialize)]
pub(crate) struct PdfQuery {
    /// Present (any value) to download instead of opening in the browser.
    download: Option<String>,
}

pub(crate) async fn pdf(
    State(state): State<AppState>,
    Query(query): Query<PdfQuery>,
) -> Result<Response, AppError> {
    let content = state.content.get();
    let pdf = content.resume_pdf().ok_or(AppError::NotFound)?.clone();

    // "Daniel Reyes" -> "Daniel-Reyes-Resume.pdf"; ASCII-only so it's a valid header value.
    let name: String = content
        .profile()
        .name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let disposition = if query.download.is_some() {
        "attachment"
    } else {
        "inline"
    };
    let headers = [
        (header::CONTENT_TYPE, "application/pdf".to_owned()),
        (
            header::CONTENT_DISPOSITION,
            format!(
                "{disposition}; filename=\"{}-Resume.pdf\"",
                name.trim_matches('-')
            ),
        ),
        (header::CACHE_CONTROL, "public, max-age=3600".to_owned()),
    ];
    Ok((headers, pdf).into_response())
}
