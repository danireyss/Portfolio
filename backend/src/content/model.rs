//! Content types. Every type deriving `TS` is exported to `frontend/src/api/types/`
//! when `cargo test` runs, so the frontend's types always match the API.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// `content/site.toml`, which admin edits as a whole.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export)]
pub struct SiteFile {
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
    #[serde(default)]
    pub awards: Vec<Award>,
    #[serde(default)]
    pub galleries: Vec<GalleryConfig>,
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

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export)]
pub struct Award {
    pub title: String,
    pub issuer: String,
    /// Display date, e.g. "Oct 2025".
    pub date: String,
    #[serde(default)]
    pub details: Vec<String>,
}

/// A `[[galleries]]` entry in site.toml. Its photos aren't listed here: they're whatever images
/// are in `photos/<folder>/` in the media bucket, listed when /api/photos is requested.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export)]
pub struct GalleryConfig {
    /// Folder under `photos/`, e.g. "stealth-startup".
    pub folder: String,
    pub title: String,
    pub description: Option<String>,
    /// Optional details per photo, keyed by file name ("01.jpg").
    #[serde(default)]
    pub photos: BTreeMap<String, PhotoDetails>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export)]
pub struct PhotoDetails {
    pub alt: Option<String>,
    pub caption: Option<String>,
    pub date: Option<String>,
}

/// A gallery as served by /api/photos: its settings plus the photos found in its folder.
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct Gallery {
    pub title: String,
    pub description: Option<String>,
    pub photos: Vec<Photo>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct Photo {
    /// Image URL, e.g. "/photos/stealth-startup/01.jpg" (served from the media bucket).
    pub src: String,
    /// Describes the photo for screen readers.
    pub alt: String,
    pub caption: Option<String>,
    /// Label on the Time Machine scrubber, e.g. "Jun 2026".
    pub date: Option<String>,
}

/// TOML front matter at the top of `content/projects/<slug>.md`.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export)]
pub struct FrontMatter {
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

/// A project file as admin edits it: the front matter and the Markdown below it.
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct ProjectSource {
    /// The file name without `.md`.
    pub slug: String,
    pub front: FrontMatter,
    pub markdown: String,
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
