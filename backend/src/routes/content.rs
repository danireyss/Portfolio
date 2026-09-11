use axum::Json;
use axum::extract::{Path, Query, State};
use axum::response::{IntoResponse, Response};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::AppState;
use crate::content::{About, Experience, Profile, ProjectSummary, Social, Tag};
use crate::error::AppError;

/// Everything the home page, nav, and footer need.
#[derive(Serialize, TS)]
#[ts(export)]
pub struct SiteResponse<'a> {
    pub profile: &'a Profile,
    pub about: &'a About,
    pub socials: &'a [Social],
    pub current_role: Option<&'a Experience>,
    /// Project tags, most-used first.
    pub skills: &'a [Tag],
}

#[derive(Serialize, TS)]
#[ts(export)]
pub struct ProjectsResponse<'a> {
    pub projects: Vec<&'a ProjectSummary>,
    /// All tags, regardless of the `tag` filter, so the filter UI can list them.
    pub tags: &'a [Tag],
}

#[derive(Deserialize)]
pub(crate) struct ProjectsQuery {
    /// Only projects with this tag (case-insensitive).
    tag: Option<String>,
}

// Handlers return `Response` because the bodies borrow from `state`, so they must be
// serialized before the handler returns.

pub(crate) async fn site(State(state): State<AppState>) -> Response {
    let content = &state.content;
    Json(SiteResponse {
        profile: content.profile(),
        about: content.about(),
        socials: content.socials(),
        current_role: content.current_role(),
        skills: content.tags(),
    })
    .into_response()
}

pub(crate) async fn projects(
    State(state): State<AppState>,
    Query(query): Query<ProjectsQuery>,
) -> Response {
    let projects = state
        .content
        .projects()
        .iter()
        .map(|project| &project.summary)
        .filter(|project| {
            query.tag.as_deref().is_none_or(|wanted| {
                project
                    .tags
                    .iter()
                    .any(|tag| tag.eq_ignore_ascii_case(wanted))
            })
        })
        .collect();
    Json(ProjectsResponse {
        projects,
        tags: state.content.tags(),
    })
    .into_response()
}

pub(crate) async fn project(
    State(state): State<AppState>,
    Path(slug): Path<String>,
) -> Result<Response, AppError> {
    let project = state.content.project(&slug).ok_or(AppError::NotFound)?;
    Ok(Json(project).into_response())
}
