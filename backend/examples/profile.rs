//! CPU flamegraphs of the API, sampled in-process with pprof (no sudo, unlike DTrace-based
//! cargo-flamegraph on macOS):
//! - `startup.svg`: what a cold start spends CPU on (content parsing, AWS SDK setup)
//! - `requests.svg`: a warm instance's request path, driven through the router in memory (no
//!   network), cycling through the site's endpoints
//!
//! It also prints wall-clock timings for one startup pass and for each endpoint.
//!
//!   cargo run --profile profiling --example profile -- <output dir>
//!
//! `make flamegraph` runs it. Open the SVGs in a browser: each box's width is its share of samples.

use std::fs::File;
use std::hint::black_box;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use aws_sdk_s3::config::{Credentials, Region};
use axum::Router;
use axum::body::Body;
use axum::http::Request;
use http_body_util::BodyExt;
use portfolio_api::content::{Content, ContentHandle};
use portfolio_api::email::LogMailer;
use portfolio_api::photos::{CachedPhotoStore, LocalPhotoStore};
use portfolio_api::telemetry::Telemetry;
use portfolio_api::{AppState, app};
use tower::ServiceExt;

type Error = Box<dyn std::error::Error + Send + Sync>;

// Enough work for a few hundred samples: macOS delivers profiling signals at about 100 Hz, well
// below the requested frequency.
const CONTENT_ROUNDS: usize = 2_000;
const AWS_ROUNDS: usize = 50;
const REQUESTS: usize = 400_000;
const PER_ENDPOINT: u32 = 2_000;
const ENDPOINTS: [&str; 7] = [
    "/api/site",
    "/api/projects",
    "/api/projects/this-website",
    "/api/resume",
    "/api/resume.pdf",
    "/api/photos",
    "/api/health",
];

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<(), Error> {
    let out = PathBuf::from(
        std::env::args()
            .nth(1)
            .unwrap_or_else(|| "../bench/results/flamegraph".into()),
    );
    std::fs::create_dir_all(&out)?;
    // The same subscriber as on Lambda (JSON logs, info level), so request spans cost what they
    // cost in production.
    let _telemetry = Telemetry::init(true)?;

    // --- Startup ---
    let start = Instant::now();
    let content = Content::load_embedded()?;
    let content_time = start.elapsed();
    println!("startup, one pass:");
    println!(
        "  content (TOML + markdown)     {:8.2} ms",
        ms(content_time)
    );
    // The AWS setup, piece by piece. main.rs loads the config once for SES and again for S3, so
    // the second load shows whether sharing one config would help.
    let start = Instant::now();
    let config = sdk_config().await;
    println!(
        "  AWS config, first load         {:8.2} ms",
        ms(start.elapsed())
    );
    let start = Instant::now();
    black_box(sdk_config().await);
    println!(
        "  AWS config, second load        {:8.2} ms",
        ms(start.elapsed())
    );
    let start = Instant::now();
    black_box(aws_sdk_sesv2::Client::new(&config));
    println!(
        "  SES client                     {:8.2} ms",
        ms(start.elapsed())
    );
    let start = Instant::now();
    black_box(aws_sdk_s3::Client::new(&config));
    println!(
        "  S3 client                      {:8.2} ms",
        ms(start.elapsed())
    );

    let guard = profiler()?;
    for _ in 0..CONTENT_ROUNDS {
        black_box(Content::load_embedded()?);
    }
    for _ in 0..AWS_ROUNDS {
        black_box(sdk_clients().await);
    }
    write_flamegraph(&guard, &out.join("startup.svg"))?;
    drop(guard);

    // --- Warm requests ---
    let photos = CachedPhotoStore::new(
        LocalPhotoStore::new("../frontend/public/photos"),
        Duration::from_secs(3600),
    );
    let router = app(AppState {
        content: Arc::new(ContentHandle::fixed(content)),
        mailer: Arc::new(LogMailer),
        photos: Arc::new(photos),
        admin: None,
    });
    // Fill the photo cache and lazy statics first, as on a warm Lambda instance.
    for path in ENDPOINTS {
        request(&router, path).await?;
    }

    println!("warm requests, in-process (no network), mean of {PER_ENDPOINT} each:");
    for path in ENDPOINTS {
        let start = Instant::now();
        for _ in 0..PER_ENDPOINT {
            request(&router, path).await?;
        }
        println!(
            "  {path:<28} {:7.1} µs",
            micros(start.elapsed() / PER_ENDPOINT)
        );
    }

    let guard = profiler()?;
    for i in 0..REQUESTS {
        request(&router, ENDPOINTS[i % ENDPOINTS.len()]).await?;
    }
    write_flamegraph(&guard, &out.join("requests.svg"))?;
    Ok(())
}

/// SDK config the way Lambda gets it: static region and credentials, so nothing probes the
/// network for them.
async fn sdk_config() -> aws_config::SdkConfig {
    aws_config::defaults(aws_config::BehaviorVersion::latest())
        .region(Region::new("us-east-1"))
        .credentials_provider(Credentials::new(
            "profile", "profile", None, None, "profile",
        ))
        .load()
        .await
}

/// A config plus the SES and S3 clients, as main.rs builds them.
async fn sdk_clients() -> (aws_sdk_sesv2::Client, aws_sdk_s3::Client) {
    let config = sdk_config().await;
    (
        aws_sdk_sesv2::Client::new(&config),
        aws_sdk_s3::Client::new(&config),
    )
}

async fn request(router: &Router, path: &str) -> Result<(), Error> {
    let response = router
        .clone()
        .oneshot(Request::get(path).body(Body::empty())?)
        .await?;
    assert!(
        response.status().is_success(),
        "{path} returned {}",
        response.status()
    );
    // Include producing the body, not just the headers.
    black_box(response.into_body().collect().await?.to_bytes());
    Ok(())
}

fn profiler() -> Result<pprof::ProfilerGuard<'static>, Error> {
    Ok(pprof::ProfilerGuardBuilder::default()
        .frequency(1000)
        .blocklist(&["libc", "libgcc", "pthread", "vdso"])
        .build()?)
}

fn write_flamegraph(guard: &pprof::ProfilerGuard<'_>, path: &Path) -> Result<(), Error> {
    let report = guard.report().build()?;
    report.flamegraph(File::create(path)?)?;
    println!(
        "wrote {} ({} samples)",
        path.display(),
        report.data.values().sum::<isize>()
    );
    print_hotspots(&report, 12);
    Ok(())
}

/// Top functions by self time (the innermost frame of each sample), and top crates, charging each
/// sample to the innermost frame outside the standard library so e.g. a memcpy inside serde_json
/// counts as serde_json.
fn print_hotspots(report: &pprof::Report, top: usize) {
    use std::collections::HashMap;

    let mut by_function: HashMap<String, isize> = HashMap::new();
    let mut by_crate: HashMap<String, isize> = HashMap::new();
    let mut total = 0;
    for (stack, &count) in &report.data {
        total += count;
        let names: Vec<String> = stack
            .frames
            .iter()
            .filter_map(|inlined| inlined.first())
            .map(|symbol| symbol.name())
            .collect();
        if let Some(leaf) = names.first() {
            *by_function.entry(shorten(leaf)).or_default() += count;
        }
        let owner = names
            .iter()
            .map(|name| crate_of(name))
            .find(|krate| !matches!(krate.as_str(), "core" | "alloc" | "std" | ""))
            .unwrap_or_else(|| "std/core".into());
        *by_crate.entry(owner).or_default() += count;
    }

    for (label, table) in [("functions (self time)", by_function), ("crates", by_crate)] {
        let mut rows: Vec<_> = table.into_iter().collect();
        rows.sort_by_key(|(_, count)| std::cmp::Reverse(*count));
        println!("  top {label}:");
        for (name, count) in rows.into_iter().take(top) {
            println!(
                "    {:5.1}%  {name}",
                100.0 * count as f64 / total.max(1) as f64
            );
        }
    }
}

/// "<serde_json::ser::Serializer<W> as Foo>::bar" -> "serde_json"
fn crate_of(name: &str) -> String {
    let name = name
        .trim_start_matches(['<', '&', ' '])
        .trim_start_matches("mut ");
    name.split("::").next().unwrap_or_default().to_owned()
}

/// Drops generic arguments so the same function isn't split across instantiations.
fn shorten(name: &str) -> String {
    let mut out = String::with_capacity(name.len());
    let mut depth = 0;
    for c in name.chars() {
        match c {
            '<' => depth += 1,
            '>' if depth > 0 => depth -= 1,
            _ if depth == 0 => out.push(c),
            _ => {}
        }
    }
    out.chars().take(110).collect()
}

fn ms(duration: Duration) -> f64 {
    duration.as_secs_f64() * 1e3
}

fn micros(duration: Duration) -> f64 {
    duration.as_secs_f64() * 1e6
}
