use std::net::SocketAddr;
use std::sync::Arc;

use portfolio_api::content::Content;
use portfolio_api::email::{LogMailer, Mailer, SesMailer};
use portfolio_api::photos::{LocalPhotoStore, PhotoStore, S3PhotoStore};
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
    let content = Arc::new(Content::load_embedded()?);
    let mailer: Arc<dyn Mailer> = match SesMailer::from_env().await? {
        Some(ses) => Arc::new(ses),
        None => {
            tracing::warn!(
                "CONTACT_TO_EMAIL is not set; contact messages will be logged, not sent"
            );
            Arc::new(LogMailer)
        }
    };
    let photos: Arc<dyn PhotoStore> = match S3PhotoStore::from_env().await {
        Some(s3) => Arc::new(s3),
        None => {
            // `make dev` runs from backend/, next to the frontend's (gitignored) photos folder.
            let dir =
                std::env::var("PHOTOS_DIR").unwrap_or_else(|_| "../frontend/public/photos".into());
            tracing::info!(%dir, "MEDIA_BUCKET is not set; listing photos from a local folder");
            Arc::new(LocalPhotoStore::new(dir))
        }
    };
    let app = app(AppState {
        content,
        mailer,
        photos,
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
