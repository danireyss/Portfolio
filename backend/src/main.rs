use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};

use portfolio_api::admin::{
    Admin, BetterAuthSessions, CacheInvalidator, CloudFrontInvalidator, LocalMediaStore,
    MediaStore, NoCdn, S3MediaStore,
};
use portfolio_api::aws::Aws;
use portfolio_api::content::{Content, ContentHandle, LocalContentStore, S3ContentStore};
use portfolio_api::email::{LogMailer, Mailer, SesMailer};
use portfolio_api::photos::{CachedPhotoStore, LocalPhotoStore, PhotoStore, S3PhotoStore};
use portfolio_api::telemetry::Telemetry;
use portfolio_api::{AppState, app};

type Error = Box<dyn std::error::Error + Send + Sync>;

fn main() -> Result<(), Error> {
    // Set by the Lambda runtime; absent when running locally.
    let on_lambda = std::env::var_os("AWS_LAMBDA_RUNTIME_API").is_some();
    // Before the async runtime starts: the OTLP exporter's blocking HTTP client can't be created
    // inside it.
    let telemetry = Telemetry::init(on_lambda)?;
    if telemetry.is_exporting() {
        let endpoint = std::env::var("OTEL_EXPORTER_OTLP_ENDPOINT").unwrap_or_default();
        tracing::info!(%endpoint, "exporting OpenTelemetry traces, metrics, and logs");
    }

    let result = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?
        .block_on(run(on_lambda));
    // The runtime has stopped; flush whatever telemetry is still batched.
    telemetry.shutdown();
    result
}

async fn run(on_lambda: bool) -> Result<(), Error> {
    let started = Instant::now();
    // Loaded on first use, and shared by every AWS client.
    let aws = Aws::new();
    // Independent, so they run together: on Lambda, fetching the content from S3 overlaps
    // setting up email and photos.
    let (content, mailer, photos) = tokio::try_join!(
        load_content(on_lambda, &aws),
        load_mailer(&aws),
        load_photos(&aws),
    )?;
    let content = Arc::new(content);
    let admin = admin_from_env(&content, &aws).await;
    tracing::info!(startup_ms = started.elapsed().as_secs_f64() * 1e3, "ready");
    let app = app(AppState {
        content,
        mailer,
        photos,
        admin,
    });

    if on_lambda {
        return lambda_http::run(app).await;
    }

    let port = std::env::var("PORT").map_or(Ok(3000), |port| port.parse())?;
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!("listening on http://{addr}");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

/// `content/` in the S3 bucket named by `CONTENT_BUCKET` when it's set. Otherwise the copy built
/// into the binary on Lambda, and locally the repo's content/ folder, re-read when files change.
async fn load_content(on_lambda: bool, aws: &Aws) -> Result<ContentHandle, Error> {
    if let Some(s3) = S3ContentStore::from_env(aws).await {
        // Other instances' saves show up within this interval.
        return Ok(ContentHandle::from_store(Arc::new(s3), Duration::from_secs(15)).await?);
    }
    if on_lambda {
        return Ok(ContentHandle::fixed(Content::load_embedded()?));
    }
    let local = LocalContentStore::from_env();
    tracing::info!(dir = %local.root().display(), "reading content from a local folder");
    Ok(ContentHandle::from_store(Arc::new(local), Duration::from_secs(1)).await?)
}

/// Contact messages go through SES when `CONTACT_TO_EMAIL` is set, and to the log otherwise.
async fn load_mailer(aws: &Aws) -> Result<Arc<dyn Mailer>, Error> {
    Ok(match SesMailer::from_env(aws).await? {
        Some(ses) => Arc::new(ses),
        None => {
            tracing::warn!(
                "CONTACT_TO_EMAIL is not set; contact messages will be logged, not sent"
            );
            Arc::new(LogMailer)
        }
    })
}

/// Gallery photos are listed from the media bucket when `MEDIA_BUCKET` is set, and from a local
/// folder otherwise.
async fn load_photos(aws: &Aws) -> Result<Arc<dyn PhotoStore>, Error> {
    Ok(match S3PhotoStore::from_env(aws).await {
        // Warm Lambda instances reuse a listing for a minute instead of calling S3 per request.
        Some(s3) => Arc::new(CachedPhotoStore::new(s3, Duration::from_secs(60))),
        None => {
            // `make dev` runs from backend/, next to the frontend's (gitignored) photos folder.
            let dir =
                std::env::var("PHOTOS_DIR").unwrap_or_else(|_| "../frontend/public/photos".into());
            tracing::info!(%dir, "MEDIA_BUCKET is not set; listing photos from a local folder");
            Arc::new(LocalPhotoStore::new(dir))
        }
    })
}

/// Admin is on when `ADMIN_EMAIL` (the only account let in) and `AUTH_URL` (the Better Auth
/// service) are set, and content comes from a store it can save to. Its HTTP and CloudFront
/// clients are built on the first admin request, not here.
async fn admin_from_env(content: &ContentHandle, aws: &Aws) -> Option<Arc<Admin>> {
    let email = std::env::var("ADMIN_EMAIL").ok()?;
    let Some(auth) = BetterAuthSessions::from_env() else {
        tracing::warn!("ADMIN_EMAIL is set but AUTH_URL isn't, so admin is off");
        return None;
    };
    if content.store().is_none() {
        tracing::warn!("admin is off: content is built into the binary, with nowhere to save it");
        return None;
    }
    // Changes must come from the site itself (CSRF protection).
    let origins = std::env::var("ADMIN_ORIGINS")
        .unwrap_or_else(|_| "http://localhost:5173".into())
        .split(',')
        .map(|origin| origin.trim().to_owned())
        .filter(|origin| !origin.is_empty())
        .collect();
    let media: Arc<dyn MediaStore> = match S3MediaStore::from_env(aws).await {
        Some(s3) => Arc::new(s3),
        None => Arc::new(LocalMediaStore::from_env(
            LocalContentStore::from_env().root(),
        )),
    };
    let cdn: Arc<dyn CacheInvalidator> = match CloudFrontInvalidator::from_env(aws) {
        Some(cloudfront) => Arc::new(cloudfront),
        None => Arc::new(NoCdn),
    };
    tracing::info!("admin is on");
    Some(Arc::new(Admin::new(
        Arc::new(auth),
        email,
        origins,
        media,
        cdn,
    )))
}

/// Resolves on Ctrl+C or SIGTERM (`make dev` stops with either), so pending telemetry is
/// flushed instead of lost.
async fn shutdown_signal() {
    let ctrl_c = tokio::signal::ctrl_c();
    #[cfg(unix)]
    let terminate = async {
        use tokio::signal::unix::{SignalKind, signal};
        if let Ok(mut sigterm) = signal(SignalKind::terminate()) {
            sigterm.recv().await;
        }
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {}
        () = terminate => {}
    }
    tracing::info!("shutting down");
}
