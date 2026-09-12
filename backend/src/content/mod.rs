//! Site content: `content/site.toml`, `content/projects/*.md`, and `content/resume.pdf`. At
//! runtime it comes from a [`ContentStore`] (see `store.rs`); the copy embedded into the binary
//! at compile time is the fallback when there's no store or it's still empty.

mod model;
mod store;

pub use model::{
    About, Award, Education, Experience, FocusArea, FrontMatter, Gallery, GalleryConfig, Link,
    Photo, PhotoDetails, Profile, Project, ProjectRef, ProjectSource, ProjectSummary, SiteFile,
    SkillGroup, Social, SocialKind, Tag,
};
pub use store::{
    ContentHandle, ContentSources, ContentStore, ContentStoreError, LoadError, LocalContentStore,
    S3ContentStore,
};

use std::cmp::Reverse;
use std::collections::BTreeMap;
use std::path::Path;

use bytes::Bytes;
use include_dir::{Dir, File, include_dir};
use pulldown_cmark::{Options, Parser, html};

static CONTENT_DIR: Dir<'static> = include_dir!("$CARGO_MANIFEST_DIR/../content");

#[derive(Debug, thiserror::Error)]
pub enum ContentError {
    #[error("missing content file `{0}`")]
    Missing(&'static str),
    #[error("`{file}` is not valid UTF-8")]
    NotUtf8 { file: String },
    #[error("`{file}`: {source}")]
    Toml {
        file: String,
        #[source]
        source: toml::de::Error,
    },
    #[error("`{file}`: expected TOML front matter between `+++` lines at the top of the file")]
    FrontMatter { file: String },
    #[error("`{file}`: project file names may only use lowercase letters, digits and `-`")]
    InvalidSlug { file: String },
    #[error("gallery folder `{folder}` may only use lowercase letters, digits and `-`")]
    InvalidGalleryFolder { folder: String },
}

#[derive(Debug)]
pub struct Content {
    site: SiteFile,
    /// Sorted by front matter `order`, then title.
    projects: Vec<Project>,
    /// The same projects, in the same order, as admin edits them.
    project_sources: Vec<ProjectSource>,
    tags: Vec<Tag>,
    resume_pdf: Option<Bytes>,
    /// The files this was parsed from, so admin can replace one and reuse the rest.
    sources: ContentSources,
}

impl Content {
    /// Parses the content embedded at compile time.
    pub fn load_embedded() -> Result<Self, ContentError> {
        let site = CONTENT_DIR
            .get_file("site.toml")
            .ok_or(ContentError::Missing("site.toml"))?;

        let mut project_files = Vec::new();
        if let Some(dir) = CONTENT_DIR.get_dir("projects") {
            for file in dir.files() {
                if file.path().extension().is_some_and(|ext| ext == "md") {
                    project_files.push((file.path().to_string_lossy().into_owned(), utf8(file)?));
                }
            }
        }

        let resume_pdf = CONTENT_DIR
            .get_file("resume.pdf")
            .map(|file| Bytes::from_static(file.contents()));
        Self::from_sources(utf8(site)?, &project_files, resume_pdf)
    }

    /// Parses content from in-memory sources; `project_files` pairs each file's path with its text.
    pub fn from_sources(
        site_toml: &str,
        project_files: &[(String, &str)],
        resume_pdf: Option<Bytes>,
    ) -> Result<Self, ContentError> {
        let site: SiteFile = toml::from_str(site_toml).map_err(|source| ContentError::Toml {
            file: "site.toml".into(),
            source,
        })?;
        // Folders become S3 prefixes and local paths, so keep them to plain slugs.
        if let Some(gallery) = site.galleries.iter().find(|g| !is_slug(&g.folder)) {
            return Err(ContentError::InvalidGalleryFolder {
                folder: gallery.folder.clone(),
            });
        }

        let mut projects = project_files
            .iter()
            .map(|(path, src)| parse_project(path, src))
            .collect::<Result<Vec<_>, _>>()?;
        projects.sort_by(|(a_order, a, _), (b_order, b, _)| {
            a_order
                .cmp(b_order)
                .then_with(|| a.summary.title.cmp(&b.summary.title))
        });
        let (projects, project_sources): (Vec<Project>, Vec<ProjectSource>) = projects
            .into_iter()
            .map(|(_, project, source)| (project, source))
            .unzip();
        let tags = collect_tags(&projects);
        let sources = ContentSources {
            site_toml: site_toml.to_owned(),
            projects: project_files
                .iter()
                .map(|(path, text)| (path.clone(), (*text).to_owned()))
                .collect(),
            resume_pdf: resume_pdf.clone(),
        };

        Ok(Self {
            site,
            projects,
            project_sources,
            tags,
            resume_pdf,
            sources,
        })
    }

    pub fn profile(&self) -> &Profile {
        &self.site.profile
    }

    pub fn about(&self) -> &About {
        &self.site.about
    }

    pub fn socials(&self) -> &[Social] {
        &self.site.socials
    }

    pub fn experience(&self) -> &[Experience] {
        &self.site.experience
    }

    pub fn education(&self) -> &[Education] {
        &self.site.education
    }

    pub fn skill_groups(&self) -> &[SkillGroup] {
        &self.site.skill_groups
    }

    pub fn awards(&self) -> &[Award] {
        &self.site.awards
    }

    /// Gallery settings; the photos themselves are listed from the media folder at request time.
    pub fn galleries(&self) -> &[GalleryConfig] {
        &self.site.galleries
    }

    /// The first experience entry without an end date.
    pub fn current_role(&self) -> Option<&Experience> {
        self.site.experience.iter().find(|e| e.end.is_none())
    }

    pub fn projects(&self) -> &[Project] {
        &self.projects
    }

    pub fn project(&self, slug: &str) -> Option<&Project> {
        self.projects.iter().find(|p| p.summary.slug == slug)
    }

    /// Tags across all projects, most-used first (ties alphabetical).
    pub fn tags(&self) -> &[Tag] {
        &self.tags
    }

    pub fn resume_pdf(&self) -> Option<&Bytes> {
        self.resume_pdf.as_ref()
    }

    /// Everything in site.toml, as admin edits it.
    pub fn site_file(&self) -> &SiteFile {
        &self.site
    }

    /// The projects' front matter and Markdown, in the same order as [`Content::projects`].
    pub fn project_sources(&self) -> &[ProjectSource] {
        &self.project_sources
    }

    /// The files this content was parsed from.
    pub fn sources(&self) -> &ContentSources {
        &self.sources
    }
}

/// The text of `site.toml` for `site`. Comments in the original file aren't kept.
pub fn site_toml(site: &SiteFile) -> Result<String, toml::ser::Error> {
    toml::to_string_pretty(site)
}

/// The text of a project file: TOML front matter between `+++` lines, then the Markdown.
pub fn project_file(front: &FrontMatter, markdown: &str) -> Result<String, toml::ser::Error> {
    Ok(format!("+++\n{}+++\n{markdown}", toml::to_string(front)?))
}

fn utf8(file: &'static File<'static>) -> Result<&'static str, ContentError> {
    file.contents_utf8().ok_or_else(|| ContentError::NotUtf8 {
        file: file.path().to_string_lossy().into_owned(),
    })
}

/// Lowercase letters, digits, and `-`: safe in URLs, S3 keys, and file paths.
pub(crate) fn is_slug(s: &str) -> bool {
    !s.is_empty()
        && s.bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

/// Returns the project's sort key, the project, and its source for admin.
fn parse_project(path: &str, src: &str) -> Result<(i32, Project, ProjectSource), ContentError> {
    let slug = Path::new(path)
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or_default();
    if !is_slug(slug) {
        return Err(ContentError::InvalidSlug { file: path.into() });
    }

    let (front, body) =
        split_front_matter(src).ok_or_else(|| ContentError::FrontMatter { file: path.into() })?;
    let meta: FrontMatter = toml::from_str(front).map_err(|source| ContentError::Toml {
        file: path.into(),
        source,
    })?;

    let source = ProjectSource {
        slug: slug.into(),
        front: meta.clone(),
        markdown: body.to_owned(),
    };
    let order = meta.order;
    let project = Project {
        summary: ProjectSummary {
            slug: slug.into(),
            title: meta.title,
            category: meta.category,
            summary: meta.summary,
            tags: meta.tags,
            featured: meta.featured,
            date: meta.date,
            image: meta.image,
            links: meta.links,
        },
        body_html: markdown_to_html(body),
    };
    Ok((order, project, source))
}

/// Splits `+++\n<toml>\n+++\n<markdown>` into its front matter and body.
fn split_front_matter(src: &str) -> Option<(&str, &str)> {
    let rest = src.strip_prefix("+++")?;
    let rest = rest
        .strip_prefix("\r\n")
        .or_else(|| rest.strip_prefix('\n'))?;
    let end = rest.find("\n+++")?;
    let (front, after) = (&rest[..end], &rest[end + "\n+++".len()..]);
    let body = if after.is_empty() {
        after
    } else {
        after
            .strip_prefix("\r\n")
            .or_else(|| after.strip_prefix('\n'))?
    };
    Some((front, body))
}

fn markdown_to_html(markdown: &str) -> String {
    let options = Options::ENABLE_TABLES
        | Options::ENABLE_STRIKETHROUGH
        | Options::ENABLE_FOOTNOTES
        | Options::ENABLE_TASKLISTS
        | Options::ENABLE_SMART_PUNCTUATION;
    let mut out = String::with_capacity(markdown.len() * 3 / 2);
    html::push_html(&mut out, Parser::new_ext(markdown, options));
    out
}

fn collect_tags(projects: &[Project]) -> Vec<Tag> {
    let mut by_name: BTreeMap<&str, Vec<ProjectRef>> = BTreeMap::new();
    for project in projects {
        for tag in &project.summary.tags {
            by_name.entry(tag).or_default().push(ProjectRef {
                slug: project.summary.slug.clone(),
                title: project.summary.title.clone(),
            });
        }
    }
    let mut tags: Vec<Tag> = by_name
        .into_iter()
        .map(|(name, projects)| Tag {
            name: name.into(),
            projects,
        })
        .collect();
    // Stable sort, so equally-used tags stay alphabetical.
    tags.sort_by_key(|tag| Reverse(tag.projects.len()));
    tags
}

#[cfg(test)]
mod tests {
    use super::*;

    const SITE: &str = r#"
        [profile]
        name = "Test Person"
        headline = "Engineer"
        location = "Somewhere"
        tagline = "Builds things."
        email = "test@example.com"

        [about]
        background = ["Paragraph."]

        [[experience]]
        company = "Old Co"
        title = "Intern"
        location = "Remote"
        start = "2020"
        end = "2021"

        [[experience]]
        company = "Now Co"
        title = "Engineer"
        location = "Remote"
        start = "2022"
    "#;

    fn project(title: &str, order: i32, tags: &[&str]) -> String {
        format!(
            "+++\ntitle = \"{title}\"\ncategory = \"Test\"\nsummary = \"S\"\norder = {order}\ntags = {tags:?}\n+++\n# Heading\n\nBody.\n"
        )
    }

    fn load(projects: &[(&str, &str)]) -> Result<Content, ContentError> {
        let files: Vec<(String, &str)> = projects
            .iter()
            .map(|(path, src)| (path.to_string(), *src))
            .collect();
        Content::from_sources(SITE, &files, None)
    }

    #[test]
    fn local_images_exist_in_frontend_public() {
        let content = Content::load_embedded().unwrap_or_else(|e| panic!("{e}"));
        let public = Path::new(env!("CARGO_MANIFEST_DIR")).join("../frontend/public");
        let project_images = content
            .projects()
            .iter()
            .filter_map(|p| p.summary.image.as_deref());
        // Gallery photos are served from the S3 media bucket and gitignored, so only the
        // headshot and project images have to be in the repo.
        let srcs = content
            .profile()
            .headshot
            .as_deref()
            .into_iter()
            .chain(project_images);
        for src in srcs {
            // Headshots uploaded through admin live in the media bucket (`/uploads/…`), not git.
            if let Some(path) = src.strip_prefix('/')
                && !path.starts_with("uploads/")
            {
                assert!(
                    public.join(path).is_file(),
                    "`{src}` isn't in frontend/public/"
                );
            }
        }
    }

    #[test]
    fn content_survives_being_saved_by_admin() {
        fn json(value: impl serde::Serialize) -> serde_json::Value {
            serde_json::to_value(value).unwrap()
        }

        let content = Content::load_embedded().unwrap();
        let site = site_toml(content.site_file()).unwrap();
        let projects: Vec<(String, String)> = content
            .project_sources()
            .iter()
            .map(|p| {
                let file = project_file(&p.front, &p.markdown).unwrap();
                (format!("projects/{}.md", p.slug), file)
            })
            .collect();
        let files: Vec<(String, &str)> = projects
            .iter()
            .map(|(path, text)| (path.clone(), text.as_str()))
            .collect();
        let saved = Content::from_sources(&site, &files, None).unwrap_or_else(|e| panic!("{e}"));

        assert_eq!(json(saved.site_file()), json(content.site_file()));
        assert_eq!(
            json(saved.project_sources()),
            json(content.project_sources())
        );
        assert_eq!(json(saved.projects()), json(content.projects()));
    }

    #[test]
    fn embedded_content_is_valid() {
        let content = Content::load_embedded().unwrap_or_else(|e| panic!("{e}"));
        assert!(!content.profile().name.is_empty());
    }

    #[test]
    fn projects_sort_by_order_then_title_and_render_markdown() {
        let (a, b, c) = (
            project("B", 1, &[]),
            project("A", 1, &[]),
            project("C", 0, &[]),
        );
        let content = load(&[
            ("projects/b.md", &a),
            ("projects/a.md", &b),
            ("projects/c.md", &c),
        ])
        .unwrap();

        let titles: Vec<_> = content
            .projects()
            .iter()
            .map(|p| p.summary.title.as_str())
            .collect();
        assert_eq!(titles, ["C", "A", "B"]);
        assert_eq!(
            content.project("a").unwrap().body_html,
            "<h1>Heading</h1>\n<p>Body.</p>\n"
        );
        assert!(content.project("missing").is_none());
    }

    #[test]
    fn tags_are_grouped_most_used_first() {
        let (a, b) = (
            project("A", 0, &["Rust", "AWS"]),
            project("B", 0, &["Rust", "React"]),
        );
        let content = load(&[("projects/a.md", &a), ("projects/b.md", &b)]).unwrap();

        let tags: Vec<_> = content
            .tags()
            .iter()
            .map(|t| (t.name.as_str(), t.projects.len()))
            .collect();
        assert_eq!(tags, [("Rust", 2), ("AWS", 1), ("React", 1)]);
    }

    #[test]
    fn current_role_is_first_experience_without_end() {
        let content = load(&[]).unwrap();
        assert_eq!(content.current_role().unwrap().company, "Now Co");
    }

    #[test]
    fn rejects_bad_project_files() {
        let valid = project("A", 0, &[]);
        assert!(matches!(
            load(&[("projects/Bad_Name.md", &valid)]),
            Err(ContentError::InvalidSlug { .. })
        ));
        assert!(matches!(
            load(&[("projects/a.md", "no front matter")]),
            Err(ContentError::FrontMatter { .. })
        ));
        let typo = valid.replace("summary", "sumary");
        assert!(matches!(
            load(&[("projects/a.md", &typo)]),
            Err(ContentError::Toml { .. })
        ));
    }

    #[test]
    fn galleries_parse_and_folders_must_be_slugs() {
        let bad = format!("{SITE}\n[[galleries]]\nfolder = \"../secrets\"\ntitle = \"Bad\"\n");
        assert!(matches!(
            Content::from_sources(&bad, &[], None),
            Err(ContentError::InvalidGalleryFolder { .. })
        ));

        let good = format!(
            "{SITE}\n[[galleries]]\nfolder = \"trip\"\ntitle = \"Trip\"\n\n[galleries.photos.\"01.jpg\"]\ncaption = \"Hi\"\n"
        );
        let content = Content::from_sources(&good, &[], None).unwrap();
        assert_eq!(
            content.galleries()[0].photos["01.jpg"].caption.as_deref(),
            Some("Hi")
        );
    }

    #[test]
    fn splits_front_matter() {
        assert_eq!(
            split_front_matter("+++\na = 1\n+++\nbody"),
            Some(("a = 1", "body"))
        );
        assert_eq!(
            split_front_matter("+++\r\na = 1\r\n+++\r\nbody"),
            Some(("a = 1\r", "body"))
        );
        assert_eq!(split_front_matter("+++\na = 1\n+++"), Some(("a = 1", "")));
        assert_eq!(split_front_matter("a = 1\n+++\nbody"), None);
        assert_eq!(split_front_matter("+++\na = 1\nbody"), None);
    }
}
