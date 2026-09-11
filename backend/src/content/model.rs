//! Content types. Every type deriving `TS` is exported to `frontend/src/api/types/`
//! when `cargo test` runs, so the frontend's types always match the API.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// `content/site.toml`.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct SiteFile {
    pub profile: Profile,
    pub about: About,
    #[serde(default)]
    pub socials: Vec<Social>,
    #[serde(default)]
    pub experience: Vec<Experience>,
    #[serde(default)]
    pub education: Vec<Education>,
    #[serde(default)]
    pub skill_groups: Vec<SkillGroup>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export)]
pub struct Profile {
    pub name: String,
    /// Role line under the name, e.g. "Software Engineer".
    pub headline: String,
    pub location: String,
    /// One or two sentences for the hero.
    pub tagline: String,
    pub email: String,
    /// Image path served by the frontend, e.g. "/headshot.jpg" for `frontend/public/headshot.jpg`.
    pub headshot: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export)]
pub struct About {
    /// Paragraphs for the "Background" subsection.
    pub background: Vec<String>,
    #[serde(default)]
    pub focus_areas: Vec<FocusArea>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export)]
pub struct FocusArea {
    pub title: String,
    pub description: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum SocialKind {
    Github,
    Linkedin,
    Email,
    Website,
    X,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export)]
pub struct Social {
    pub kind: SocialKind,
    pub label: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export)]
pub struct Experience {
    pub company: String,
    pub company_url: Option<String>,
    pub title: String,
    pub location: String,
    /// Display dates, e.g. "Jun 2023".
    pub start: String,
    /// `None` means current; the first such entry becomes the home page's "Current Role".
    pub end: Option<String>,
    /// One-line summary for the "Current Role" section.
    pub summary: Option<String>,
    #[serde(default)]
    pub bullets: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export)]
pub struct Education {
    pub school: String,
    pub degree: String,
    pub location: String,
    pub start: String,
    pub end: Option<String>,
    #[serde(default)]
    pub details: Vec<String>,
}

/// A resume "Technical Skills" row, e.g. "Languages: Rust, TypeScript".
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export)]
pub struct SkillGroup {
    pub name: String,
    pub skills: Vec<String>,
}

/// TOML front matter at the top of `content/projects/<slug>.md`.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct FrontMatter {
    pub title: String,
    /// Short label above the title, e.g. "Full-stack" or "Game · Bevy".
    pub category: String,
    pub summary: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub featured: bool,
    /// Sort key for project lists, ascending; ties sort by title.
    #[serde(default)]
    pub order: i32,
    pub date: Option<String>,
    pub image: Option<String>,
    #[serde(default)]
    pub links: Vec<Link>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export)]
pub struct Link {
    pub label: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct ProjectSummary {
    /// The project's file name without `.md`.
    pub slug: String,
    pub title: String,
    pub category: String,
    pub summary: String,
    pub tags: Vec<String>,
    pub featured: bool,
    pub date: Option<String>,
    pub image: Option<String>,
    pub links: Vec<Link>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct Project {
    #[serde(flatten)]
    pub summary: ProjectSummary,
    /// The markdown body rendered to HTML.
    pub body_html: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
pub struct ProjectRef {
    pub slug: String,
    pub title: String,
}

/// A project tag and the projects that use it (the home page's "Skills" list).
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct Tag {
    pub name: String,
    pub projects: Vec<ProjectRef>,
}
