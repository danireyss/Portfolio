//! Site content: `content/site.toml` and `content/projects/*.md`, embedded into the binary at
//! compile time so the Lambda needs no filesystem, bucket, or database to serve it.

mod model;

pub use model::{
    About, Education, Experience, FocusArea, Link, Profile, Project, ProjectRef, ProjectSummary,
    SkillGroup, Social, SocialKind, Tag,
};

use std::cmp::Reverse;
use std::collections::BTreeMap;
use std::path::Path;

use include_dir::{Dir, File, include_dir};
use model::{FrontMatter, SiteFile};
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
}

#[derive(Debug)]
pub struct Content {
    site: SiteFile,
    /// Sorted by front matter `order`, then title.
    projects: Vec<Project>,
    tags: Vec<Tag>,
    resume_pdf: Option<&'static [u8]>,
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

        let resume_pdf = CONTENT_DIR.get_file("resume.pdf").map(File::contents);
        Self::from_sources(utf8(site)?, &project_files, resume_pdf)
    }

    /// Parses content from in-memory sources; `project_files` pairs each file's path with its text.
    pub fn from_sources(
        site_toml: &str,
        project_files: &[(String, &str)],
        resume_pdf: Option<&'static [u8]>,
    ) -> Result<Self, ContentError> {
        let site: SiteFile = toml::from_str(site_toml).map_err(|source| ContentError::Toml {
            file: "site.toml".into(),
            source,
        })?;

        let mut projects = project_files
            .iter()
            .map(|(path, src)| parse_project(path, src))
            .collect::<Result<Vec<_>, _>>()?;
        projects.sort_by(|(a_order, a), (b_order, b)| {
            a_order
                .cmp(b_order)
                .then_with(|| a.summary.title.cmp(&b.summary.title))
        });
        let projects: Vec<Project> = projects.into_iter().map(|(_, project)| project).collect();
        let tags = collect_tags(&projects);

        Ok(Self {
            site,
            projects,
            tags,
            resume_pdf,
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

    pub fn resume_pdf(&self) -> Option<&'static [u8]> {
        self.resume_pdf
    }
}

fn utf8(file: &'static File<'static>) -> Result<&'static str, ContentError> {
    file.contents_utf8().ok_or_else(|| ContentError::NotUtf8 {
        file: file.path().to_string_lossy().into_owned(),
    })
}

/// Returns the project and its sort key.
fn parse_project(path: &str, src: &str) -> Result<(i32, Project), ContentError> {
    let slug = Path::new(path)
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or_default();
    let slug_is_valid = !slug.is_empty()
        && slug
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-');
    if !slug_is_valid {
        return Err(ContentError::InvalidSlug { file: path.into() });
    }

    let (front, body) =
        split_front_matter(src).ok_or_else(|| ContentError::FrontMatter { file: path.into() })?;
    let meta: FrontMatter = toml::from_str(front).map_err(|source| ContentError::Toml {
        file: path.into(),
        source,
    })?;

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
    Ok((meta.order, project))
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
