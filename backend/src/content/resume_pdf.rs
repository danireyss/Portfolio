//! Reads the resume PDF into the resume page's sections, so the page says what the PDF says.
//!
//! Made for one-column resumes like content/resume.pdf: section headings ("Education", "Work
//! Experience", "Skills", "Awards"), entries whose first lines put the dates and the location at
//! the right margin, and `•` bullets. Of an entry's first lines, the one with the dates names the
//! job title or degree, and the other one the company or school. Sections the resume page doesn't
//! show, like "Projects" (which have pages of their own), are skipped.

use std::collections::{BTreeMap, HashMap};
use std::panic::{AssertUnwindSafe, catch_unwind};

use lopdf::content::Operation;
use lopdf::{Dictionary, Document, Encoding, Object};

use super::{Award, Education, Experience, SiteFile, SkillGroup};

#[derive(Debug, thiserror::Error)]
pub enum ResumePdfError {
    #[error("The PDF couldn't be read ({0}).")]
    Unreadable(String),
    #[error("The PDF has no Experience, Education, Skills, or Awards heading.")]
    NoSections,
}

/// The resume page's sections, as the PDF has them.
#[derive(Debug, Default)]
pub struct ResumeSections {
    pub experience: Vec<Experience>,
    pub education: Vec<Education>,
    pub skill_groups: Vec<SkillGroup>,
    pub awards: Vec<Award>,
}

impl ResumeSections {
    /// Replaces `site`'s resume sections with these. What a PDF doesn't say stays: each job keeps
    /// the company link and "Current Role" summary it had.
    pub fn apply_to(mut self, site: &mut SiteFile) {
        for job in &mut self.experience {
            let same_company = |old: &&Experience| old.company.eq_ignore_ascii_case(&job.company);
            if let Some(old) = site.experience.iter().find(same_company) {
                job.company_url.clone_from(&old.company_url);
                job.summary.clone_from(&old.summary);
            }
        }
        site.experience = self.experience;
        site.education = self.education;
        site.skill_groups = self.skill_groups;
        site.awards = self.awards;
    }
}

/// Reads the resume page's sections from a resume PDF.
pub fn read_resume(pdf: &[u8]) -> Result<ResumeSections, ResumePdfError> {
    parse(&text_lines(pdf)?)
}

/// A character and where it's drawn, in points: from `x` to `end` across the page, and `y` down
/// it (the negated baseline, so lower on the page is larger).
struct Glyph {
    page: u32,
    x: f64,
    end: f64,
    y: f64,
    size: f64,
    text: String,
}

/// Every character drawn on every page, with where it's drawn.
fn glyphs(doc: &Document) -> lopdf::Result<Vec<Glyph>> {
    let mut glyphs = Vec::new();
    for (page, id) in doc.get_pages() {
        // lopdf reads a Type0 font's ToUnicode map only when it has no `Encoding`, which for
        // these is just "Identity-H" (two-byte codes), so the copies here leave it out.
        let dicts: BTreeMap<Vec<u8>, Dictionary> = doc
            .get_page_fonts(id)?
            .into_iter()
            .map(|(name, font)| {
                let mut font = font.clone();
                if is_type0(&font) {
                    font.remove(b"Encoding");
                }
                (name, font)
            })
            .collect();
        let fonts: BTreeMap<Vec<u8>, Font> = dicts
            .iter()
            .map(|(name, dict)| (name.clone(), Font::new(doc, dict)))
            .collect();
        let mut reader = Reader::new(page, &fonts);
        for operation in &doc.get_and_decode_page_content(id)?.operations {
            reader.apply(operation);
        }
        glyphs.append(&mut reader.glyphs);
    }
    Ok(glyphs)
}

fn is_type0(font: &Dictionary) -> bool {
    font.get(b"Subtype")
        .and_then(Object::as_name)
        .is_ok_and(|subtype| subtype == b"Type0")
}

fn number(object: &Object) -> Option<f64> {
    match *object {
        Object::Integer(n) => Some(n as f64),
        Object::Real(n) => Some(f64::from(n)),
        _ => None,
    }
}

/// What's needed of a font to place its characters and read them.
struct Font<'a> {
    /// Type0 fonts (Identity-H) use two-byte codes; the others, one byte.
    two_byte: bool,
    encoding: Option<Encoding<'a>>,
    /// Per code, in thousandths of the font size.
    widths: HashMap<u32, f64>,
    default_width: f64,
}

impl<'a> Font<'a> {
    fn new(doc: &'a Document, dict: &'a Dictionary) -> Self {
        let two_byte = is_type0(dict);
        let mut widths = HashMap::new();
        let default_width = if two_byte {
            let cid_font = dict
                .get_deref(b"DescendantFonts", doc)
                .and_then(Object::as_array)
                .ok()
                .and_then(|fonts| fonts.first())
                .and_then(|font| doc.dereference(font).ok())
                .and_then(|(_, font)| font.as_dict().ok());
            if let Some(w) = cid_font
                .and_then(|font| font.get_deref(b"W", doc).ok())
                .and_then(|w| w.as_array().ok())
            {
                read_cid_widths(doc, w, &mut widths);
            }
            cid_font
                .and_then(|font| font.get(b"DW").ok())
                .and_then(number)
                .unwrap_or(1000.0)
        } else {
            let first = dict.get(b"FirstChar").ok().and_then(number).unwrap_or(0.0) as u32;
            if let Ok(list) = dict.get_deref(b"Widths", doc).and_then(Object::as_array) {
                for (code, width) in (first..).zip(list) {
                    if let Some(width) = doc.dereference(width).ok().and_then(|(_, w)| number(w)) {
                        widths.insert(code, width);
                    }
                }
            }
            // The standard 14 fonts may list no widths; theirs average about half an em.
            500.0
        };
        Self {
            two_byte,
            encoding: dict.get_font_encoding(doc).ok(),
            widths,
            default_width,
        }
    }

    /// A character's width, as a share of the font size.
    fn width(&self, code: u32) -> f64 {
        self.widths
            .get(&code)
            .copied()
            .unwrap_or(self.default_width)
            / 1000.0
    }

    fn text(&self, code: &[u8]) -> String {
        self.encoding
            .as_ref()
            .and_then(|encoding| encoding.bytes_to_string(code).ok())
            .unwrap_or_default()
    }
}

/// A CIDFont's `W` array, whose entries are `first [w1 w2 …]` or `first last w`.
fn read_cid_widths(doc: &Document, w: &[Object], widths: &mut HashMap<u32, f64>) {
    let mut i = 0;
    while let Some(first) = w.get(i).and_then(number) {
        let first = first as u32;
        match w.get(i + 1).and_then(|next| doc.dereference(next).ok()) {
            Some((_, Object::Array(list))) => {
                for (cid, width) in (first..).zip(list) {
                    if let Some(width) = number(width) {
                        widths.insert(cid, width);
                    }
                }
                i += 2;
            }
            Some((_, last)) => {
                let (Some(last), Some(width)) = (number(last), w.get(i + 2).and_then(number))
                else {
                    return;
                };
                // CIDs are two bytes, which also bounds a malformed range.
                for cid in first..=(last as u32).min(0xFFFF) {
                    widths.insert(cid, width);
                }
                i += 3;
            }
            None => return,
        }
    }
}

/// A PDF transformation matrix `[a b c d e f]`.
#[derive(Debug, Clone, Copy)]
struct Matrix([f64; 6]);

impl Matrix {
    const IDENTITY: Self = Self([1.0, 0.0, 0.0, 1.0, 0.0, 0.0]);

    fn translate(x: f64, y: f64) -> Self {
        Self([1.0, 0.0, 0.0, 1.0, x, y])
    }

    fn from_operands(operands: &[Object]) -> Self {
        let n: Vec<f64> = operands.iter().filter_map(number).collect();
        n.try_into().map_or(Self::IDENTITY, Self)
    }

    /// `self`, then `next`: PDF's `self × next`.
    fn then(self, next: Self) -> Self {
        let [a, b, c, d, e, f] = self.0;
        let [a2, b2, c2, d2, e2, f2] = next.0;
        Self([
            a * a2 + b * c2,
            a * b2 + b * d2,
            c * a2 + d * c2,
            c * b2 + d * d2,
            e * a2 + f * c2 + e2,
            e * b2 + f * d2 + f2,
        ])
    }
}

/// The graphics state that `q` saves and `Q` restores, with the text settings it includes.
#[derive(Clone)]
struct State {
    ctm: Matrix,
    font: Option<Vec<u8>>,
    size: f64,
    char_spacing: f64,
    word_spacing: f64,
    /// `Tz`, as a fraction.
    scale: f64,
    leading: f64,
    rise: f64,
}

impl Default for State {
    fn default() -> Self {
        Self {
            ctm: Matrix::IDENTITY,
            font: None,
            size: 0.0,
            char_spacing: 0.0,
            word_spacing: 0.0,
            scale: 1.0,
            leading: 0.0,
            rise: 0.0,
        }
    }
}

/// Follows a page's drawing operations, noting where each character lands.
struct Reader<'a> {
    page: u32,
    fonts: &'a BTreeMap<Vec<u8>, Font<'a>>,
    state: State,
    saved: Vec<State>,
    /// The text matrix, and where the current line started (PDF's Tm and Tlm).
    tm: Matrix,
    line: Matrix,
    glyphs: Vec<Glyph>,
}

impl<'a> Reader<'a> {
    fn new(page: u32, fonts: &'a BTreeMap<Vec<u8>, Font<'a>>) -> Self {
        Self {
            page,
            fonts,
            state: State::default(),
            saved: Vec::new(),
            tm: Matrix::IDENTITY,
            line: Matrix::IDENTITY,
            glyphs: Vec::new(),
        }
    }

    fn apply(&mut self, operation: &Operation) {
        let operands = &operation.operands;
        let n = |i: usize| operands.get(i).and_then(number).unwrap_or(0.0);
        match operation.operator.as_str() {
            "q" => self.saved.push(self.state.clone()),
            "Q" => {
                if let Some(saved) = self.saved.pop() {
                    self.state = saved;
                }
            }
            "cm" => self.state.ctm = Matrix::from_operands(operands).then(self.state.ctm),
            "BT" => {
                self.tm = Matrix::IDENTITY;
                self.line = Matrix::IDENTITY;
            }
            "Tf" => {
                self.state.font = operands
                    .first()
                    .and_then(|name| name.as_name().ok())
                    .map(<[u8]>::to_vec);
                self.state.size = n(1);
            }
            "Tc" => self.state.char_spacing = n(0),
            "Tw" => self.state.word_spacing = n(0),
            "Tz" => self.state.scale = n(0) / 100.0,
            "TL" => self.state.leading = n(0),
            "Ts" => self.state.rise = n(0),
            "Td" => self.next_line(n(0), n(1)),
            "TD" => {
                self.state.leading = -n(1);
                self.next_line(n(0), n(1));
            }
            "Tm" => {
                self.line = Matrix::from_operands(operands);
                self.tm = self.line;
            }
            "T*" => self.next_line(0.0, -self.state.leading),
            "Tj" | "'" | "\"" => {
                if operation.operator == "\"" {
                    self.state.word_spacing = n(0);
                    self.state.char_spacing = n(1);
                }
                if operation.operator != "Tj" {
                    self.next_line(0.0, -self.state.leading);
                }
                if let Some(Ok(text)) = operands.last().map(Object::as_str) {
                    self.show(text);
                }
            }
            "TJ" => {
                let items = operands.first().and_then(|items| items.as_array().ok());
                for item in items.into_iter().flatten() {
                    if let Object::String(text, _) = item {
                        self.show(text);
                    } else if let Some(adjust) = number(item) {
                        let state = &self.state;
                        let back = adjust / 1000.0 * state.size * state.scale;
                        self.tm = Matrix::translate(-back, 0.0).then(self.tm);
                    }
                }
            }
            _ => {}
        }
    }

    fn next_line(&mut self, x: f64, y: f64) {
        self.line = Matrix::translate(x, y).then(self.line);
        self.tm = self.line;
    }

    fn show(&mut self, text: &[u8]) {
        let fonts = self.fonts;
        let Some(font) = self.state.font.as_ref().and_then(|name| fonts.get(name)) else {
            return;
        };
        let state = &self.state;
        for code in text.chunks(if font.two_byte { 2 } else { 1 }) {
            let number = code.iter().fold(0, |n, &byte| n << 8 | u32::from(byte));
            let width = font.width(number);
            let [a, b, c, d, e, f] = self.tm.then(state.ctm).0;
            let x = state.rise * c + e;
            self.glyphs.push(Glyph {
                page: self.page,
                x,
                end: x + width * state.size * state.scale * a,
                y: -(state.rise * d + f),
                size: state.size * (a * d - b * c).abs().sqrt(),
                text: font.text(code),
            });
            let word_spacing = if number == 32 && !font.two_byte {
                state.word_spacing
            } else {
                0.0
            };
            let advance = (width * state.size + state.char_spacing + word_spacing) * state.scale;
            self.tm = Matrix::translate(advance, 0.0).then(self.tm);
        }
    }
}

/// A line of text, as the runs of words that wide gaps separate (like dates at the right margin).
struct Line {
    x: f64,
    size: f64,
    cells: Vec<String>,
}

impl Line {
    fn text(&self) -> String {
        self.cells.join(" ")
    }
}

/// Gaps between characters, as a share of the font size, that separate words, and cells.
const WORD_GAP: f64 = 0.1;
const CELL_GAP: f64 = 2.0;

fn text_lines(pdf: &[u8]) -> Result<Vec<Line>, ResumePdfError> {
    let unreadable = |error: &dyn std::fmt::Display| ResumePdfError::Unreadable(error.to_string());
    let doc = Document::load_mem(pdf).map_err(|e| unreadable(&e))?;
    // A malformed file can make lopdf panic; that shouldn't take the request down with it.
    let glyphs = catch_unwind(AssertUnwindSafe(|| glyphs(&doc)))
        .map_err(|_| unreadable(&"it's malformed"))?
        .map_err(|e| unreadable(&e))?;
    Ok(into_lines(glyphs))
}

fn into_lines(mut glyphs: Vec<Glyph>) -> Vec<Line> {
    // Words are told apart by the gaps between characters, whether or not the PDF draws spaces.
    glyphs.retain(|glyph| !glyph.text.trim().is_empty());
    glyphs.sort_by(|a, b| a.page.cmp(&b.page).then(a.y.total_cmp(&b.y)));

    let mut rows: Vec<Vec<Glyph>> = Vec::new();
    for glyph in glyphs {
        match rows.last_mut() {
            Some(row) if row[0].page == glyph.page && glyph.y - row[0].y < row[0].size * 0.4 => {
                row.push(glyph);
            }
            _ => rows.push(vec![glyph]),
        }
    }

    rows.into_iter()
        .map(|mut row| {
            row.sort_by(|a, b| a.x.total_cmp(&b.x));
            let size = row.iter().map(|glyph| glyph.size).fold(0.0, f64::max);
            let mut cells = Vec::new();
            let mut cell = String::new();
            let mut end = row[0].x;
            for glyph in &row {
                let gap = glyph.x - end;
                if gap > size * CELL_GAP {
                    cells.push(std::mem::take(&mut cell));
                } else if gap > size * WORD_GAP {
                    cell.push(' ');
                }
                cell.push_str(&glyph.text);
                end = end.max(glyph.end);
            }
            cells.push(cell);
            Line {
                x: row[0].x,
                size,
                cells,
            }
        })
        .collect()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Section {
    Experience,
    Education,
    Skills,
    Awards,
    Skipped,
}

/// An entry: its first lines, as cells, then its bullets.
#[derive(Default)]
struct Entry {
    lines: Vec<Vec<String>>,
    bullets: Vec<String>,
}

fn parse(lines: &[Line]) -> Result<ResumeSections, ResumePdfError> {
    let body_size = body_size(lines);
    let mut sections = ResumeSections::default();
    let mut found = false;
    // `None` above the first heading: the name and contact details.
    let mut section = None;
    let mut entries: Vec<Entry> = Vec::new();
    // Where the last bullet's marker is; the lines indented past it continue that bullet.
    let mut bullet_x = None;

    for line in lines {
        if let Some(next) = heading(line, body_size) {
            if let Some(done) = section {
                add(&mut sections, done, std::mem::take(&mut entries));
            }
            found |= next != Section::Skipped;
            section = Some(next);
            bullet_x = None;
            continue;
        }
        if section.is_none() {
            continue;
        }
        let text = line.text();
        if let Some(bullet) = strip_bullet(&text) {
            if entries.is_empty() {
                entries.push(Entry::default());
            }
            if let Some(entry) = entries.last_mut() {
                entry.bullets.push(bullet.to_owned());
            }
            bullet_x = Some(line.x);
        } else if let Some(x) = bullet_x
            && line.x > x + line.size * 0.3
            && let Some(bullet) = entries
                .last_mut()
                .and_then(|entry| entry.bullets.last_mut())
        {
            continue_line(bullet, &text);
        } else {
            if entries.last().is_none_or(|entry| !entry.bullets.is_empty()) {
                entries.push(Entry::default());
            }
            if let Some(entry) = entries.last_mut() {
                entry.lines.push(line.cells.clone());
            }
            bullet_x = None;
        }
    }
    if let Some(done) = section {
        add(&mut sections, done, entries);
    }
    if found {
        Ok(sections)
    } else {
        Err(ResumePdfError::NoSections)
    }
}

/// The size most lines are set in: the body text's.
fn body_size(lines: &[Line]) -> f64 {
    let mut counts: BTreeMap<i64, usize> = BTreeMap::new();
    for line in lines {
        *counts.entry((line.size * 10.0).round() as i64).or_default() += 1;
    }
    counts
        .into_iter()
        .max_by_key(|&(_, count)| count)
        .map_or(0.0, |(size, _)| size as f64 / 10.0)
}

/// The section a heading starts, or `None` if `line` isn't a heading.
fn heading(line: &Line, body_size: f64) -> Option<Section> {
    let [text] = line.cells.as_slice() else {
        return None;
    };
    let name = text.trim().trim_end_matches(':').to_lowercase();
    let section = match name.as_str() {
        "experience"
        | "work experience"
        | "professional experience"
        | "relevant experience"
        | "employment"
        | "work history" => Section::Experience,
        "education" => Section::Education,
        "skills" | "technical skills" | "skills & interests" | "skills and interests" => {
            Section::Skills
        }
        "awards" | "honors" | "honors & awards" | "honors and awards" | "awards & honors"
        | "awards and honors" | "achievements" => Section::Awards,
        "projects"
        | "personal projects"
        | "selected projects"
        | "leadership"
        | "activities"
        | "leadership & activities"
        | "certifications"
        | "publications"
        | "volunteering"
        | "interests"
        | "summary"
        | "objective" => Section::Skipped,
        // Some other heading, set larger than the text under it.
        _ if line.size > body_size * 1.15
            && name.split_whitespace().count() <= 4
            && strip_bullet(text).is_none() =>
        {
            Section::Skipped
        }
        _ => return None,
    };
    Some(section)
}

fn add(sections: &mut ResumeSections, section: Section, entries: Vec<Entry>) {
    for entry in entries {
        let head = Head::of(&entry.lines);
        match section {
            Section::Experience => {
                let (start, end) = date_range(&head.dates);
                sections.experience.push(Experience {
                    company: head.other,
                    company_url: None,
                    title: head.main,
                    location: head.place,
                    start,
                    end,
                    summary: None,
                    bullets: entry.bullets,
                });
            }
            Section::Education => {
                let (start, end) = date_range(&head.dates);
                sections.education.push(Education {
                    school: head.other,
                    degree: head.main,
                    location: head.place,
                    start,
                    end,
                    details: entry.bullets,
                });
            }
            Section::Awards => {
                let (title, issuer) = if head.other.is_empty() {
                    split_title(&head.main)
                } else {
                    (head.main, head.other)
                };
                sections.awards.push(Award {
                    title,
                    issuer,
                    date: head.dates,
                    details: entry.bullets,
                });
            }
            // "Languages: Rust, Python", bulleted or not.
            Section::Skills => {
                let rows = entry.lines.iter().map(|cells| cells.join(" "));
                let rows = rows.chain(entry.bullets);
                sections
                    .skill_groups
                    .extend(rows.map(|row| skill_group(&row)));
            }
            Section::Skipped => {}
        }
    }
}

/// An entry's first lines: the one with the dates (the job title or degree), and the other one
/// (the company or school, and where it is).
struct Head {
    main: String,
    dates: String,
    other: String,
    place: String,
}

impl Head {
    fn of(lines: &[Vec<String>]) -> Self {
        let sides: Vec<(String, String)> = lines
            .iter()
            .map(|cells| match cells.split_last() {
                Some((right, left)) if !left.is_empty() => (left.join(" "), right.clone()),
                _ => (cells.join(" "), String::new()),
            })
            .collect();
        let dated = sides
            .iter()
            .position(|(_, right)| has_year(right))
            .unwrap_or(0);
        let (main, dates) = sides.get(dated).cloned().unwrap_or_default();
        let (other, place) = sides
            .iter()
            .enumerate()
            .find(|&(i, _)| i != dated)
            .map(|(_, side)| side.clone())
            .unwrap_or_default();
        Self {
            main,
            dates,
            other,
            place,
        }
    }
}

/// Whether `text` has a year or "Present" in it, like dates do.
fn has_year(text: &str) -> bool {
    text.to_lowercase().contains("present")
        || text
            .split(|c: char| !c.is_ascii_digit())
            .any(|n| n.len() == 4 && (n.starts_with("19") || n.starts_with("20")))
}

/// "Jun 2023 — Present" -> ("Jun 2023", None). A single date is a start and end in that month.
fn date_range(text: &str) -> (String, Option<String>) {
    let text = text.trim();
    let (start, end) = ["---", "—", "–", "--", " - ", " to "]
        .iter()
        .find_map(|dash| text.split_once(dash))
        .map_or((text, text), |(start, end)| (start.trim(), end.trim()));
    let ongoing = ["present", "current", "now"].contains(&end.to_lowercase().as_str());
    (start.to_owned(), (!ongoing).then(|| end.to_owned()))
}

/// "Summit Impact Award --- FIU" -> ("Summit Impact Award", "FIU").
fn split_title(text: &str) -> (String, String) {
    [" --- ", " — ", " – ", " -- ", " | ", " - "]
        .iter()
        .find_map(|dash| text.split_once(dash))
        .map_or_else(
            || (text.trim().to_owned(), String::new()),
            |(title, rest)| (title.trim().to_owned(), rest.trim().to_owned()),
        )
}

/// "Languages: Rust, AWS (S3, Lambda)" -> "Languages", ["Rust", "AWS (S3, Lambda)"].
fn skill_group(row: &str) -> SkillGroup {
    let (name, list) = row.split_once(':').unwrap_or(("Skills", row));
    let mut skills = Vec::new();
    let mut skill = String::new();
    let mut depth = 0;
    for c in list.chars() {
        match c {
            '(' | '[' => depth += 1,
            ')' | ']' => depth -= 1,
            ',' | ';' if depth <= 0 => {
                skills.push(std::mem::take(&mut skill));
                continue;
            }
            _ => {}
        }
        skill.push(c);
    }
    skills.push(skill);
    SkillGroup {
        name: name.trim().to_owned(),
        skills: skills
            .iter()
            .map(|skill| skill.trim().to_owned())
            .filter(|skill| !skill.is_empty())
            .collect(),
    }
}

/// The text after a bullet's marker, or `None` if `text` isn't a bullet.
fn strip_bullet(text: &str) -> Option<&str> {
    let rest = text.strip_prefix(['•', '◦', '▪', '‣', '●', '○', '■', '–', '-', '*', '·'])?;
    rest.starts_with(' ').then(|| rest.trim_start())
}

/// Adds a bullet's next line, rejoining a word hyphenated across the break ("archi-" + "tected").
/// A word that already has a hyphen broke at it ("build-and-" + "release"), so that one stays.
fn continue_line(text: &mut String, next: &str) {
    let word = text.rsplit(' ').next().unwrap_or_default();
    let hyphenated = word
        .strip_suffix('-')
        .is_some_and(|stem| stem.ends_with(char::is_alphabetic) && !stem.contains('-'))
        && next.starts_with(char::is_lowercase);
    if hyphenated {
        text.pop();
    } else if !word.ends_with('-') {
        text.push(' ');
    }
    text.push_str(next);
}

#[cfg(test)]
mod tests {
    use super::*;

    /// content/resume.pdf as of this parser, so the test doesn't change with the real resume.
    const PDF: &[u8] = include_bytes!("../../tests/fixtures/resume.pdf");

    #[test]
    fn reads_each_section_of_the_resume() {
        let resume = read_resume(PDF).unwrap();

        let jobs: Vec<_> = resume
            .experience
            .iter()
            .map(|job| {
                let when = (job.start.as_str(), job.end.as_deref());
                (
                    job.title.as_str(),
                    job.company.as_str(),
                    job.location.as_str(),
                    when,
                )
            })
            .collect();
        assert_eq!(
            jobs,
            [
                (
                    "Software Engineer Intern",
                    "Stealth Start-Up (AI Company)",
                    "Miami, FL",
                    ("Jun 2026", Some("Aug 2026"))
                ),
                (
                    "Full-Stack Software Engineer Intern",
                    "Global Empowerment Mission",
                    "Miami, FL",
                    ("May 2026", Some("May 2026"))
                ),
            ]
        );
        let bullets = &resume.experience[0].bullets;
        assert_eq!(bullets.len(), 4);
        assert!(bullets[0].starts_with("Migrated an internal build-and-release tool from"));
        assert!(
            bullets[2].ends_with("TypeScript AWS CDK across ECS Fargate, S3, ALB, and PrivateLink, architected for multi-tenant isolation"),
            "{}",
            bullets[2]
        );
        let bullets = &resume.experience[1].bullets;
        assert_eq!(bullets.len(), 3);
        assert!(bullets[1].contains("Google Drive PDF generation with React PDF"));
        assert!(bullets[2].contains("authoring Prisma migrations, implementing a controller"));

        let school = &resume.education[0];
        assert_eq!(school.school, "Florida International University");
        assert_eq!(school.degree, "Bachelor of Arts, Computer Science");
        assert_eq!(school.location, "Miami, FL");
        assert_eq!(
            (school.start.as_str(), school.end.as_deref()),
            ("Aug 2024", Some("Dec 2026"))
        );
        assert_eq!(school.details[0], "Cumulative GPA: 3.77/4.0");
        assert!(school.details[1].ends_with("Management, Computer Architecture, Software Engineering, Operating Systems, Programming I & II"));

        let skills: Vec<_> = resume
            .skill_groups
            .iter()
            .map(|group| (group.name.as_str(), group.skills.len()))
            .collect();
        assert_eq!(
            skills,
            [
                ("Programming Languages", 5),
                ("Frameworks and Libraries", 6),
                ("Databases", 2),
                ("Tools & Platforms", 8),
            ]
        );
        assert_eq!(resume.skill_groups[0].skills[0], "Rust");

        let award = &resume.awards[0];
        assert_eq!(award.title, "Summit Impact Award");
        assert_eq!(
            award.issuer,
            "FIU, Knight Foundation School of Computing and Information Science"
        );
        assert_eq!(award.date, "Oct 2025");
        assert_eq!(
            award.details,
            ["Recognized for delivering measurable impact through open-source contributions"]
        );
        assert_eq!(resume.awards.len(), 1, "the Projects section is skipped");
    }

    #[test]
    fn the_sites_resume_can_be_read() {
        let pdf = include_bytes!("../../../content/resume.pdf");
        let resume = read_resume(pdf).unwrap_or_else(|e| panic!("{e}"));
        assert!(!resume.experience.is_empty());
    }

    #[test]
    fn other_files_are_refused_without_panicking() {
        assert!(matches!(
            read_resume(b"not a pdf"),
            Err(ResumePdfError::Unreadable(_))
        ));
    }

    #[test]
    fn applying_keeps_what_the_pdf_doesnt_say() {
        let mut site = crate::content::Content::load_embedded()
            .unwrap()
            .site_file()
            .clone();
        site.experience[0].company_url = Some("https://example.com".into());
        site.experience[0].summary = Some("Builds things.".into());
        let company = site.experience[0].company.to_uppercase();

        let mut resume = read_resume(PDF).unwrap();
        resume.experience[0].company = company;
        resume.apply_to(&mut site);

        assert_eq!(site.experience.len(), 2);
        assert_eq!(
            site.experience[0].company_url.as_deref(),
            Some("https://example.com")
        );
        assert_eq!(
            site.experience[0].summary.as_deref(),
            Some("Builds things.")
        );
        assert_eq!(site.experience[1].company_url, None);
        assert_eq!(site.awards.len(), 1);
    }

    #[test]
    fn reads_date_ranges() {
        let range = |text| date_range(text);
        assert_eq!(range("Jun 2023 — Present"), ("Jun 2023".into(), None));
        assert_eq!(range("2020 - 2021"), ("2020".into(), Some("2021".into())));
        assert_eq!(
            range("May 2026"),
            ("May 2026".into(), Some("May 2026".into()))
        );
    }

    #[test]
    fn rejoins_words_broken_across_lines() {
        let joined = |line: &str, next: &str| {
            let mut text = line.to_owned();
            continue_line(&mut text, next);
            text
        };
        assert_eq!(joined("PDF gener-", "ation with"), "PDF generation with");
        assert_eq!(
            joined("a build-and-", "release tool"),
            "a build-and-release tool"
        );
        assert_eq!(joined("across all", "employees"), "across all employees");
        assert_eq!(
            joined("a Next.js 16 App", "Router"),
            "a Next.js 16 App Router"
        );
    }

    #[test]
    fn splits_skills_outside_parentheses() {
        let group = skill_group("Cloud: AWS (S3, Lambda), Docker");
        assert_eq!(group.name, "Cloud");
        assert_eq!(group.skills, ["AWS (S3, Lambda)", "Docker"]);
    }
}
