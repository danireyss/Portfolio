use std::net::SocketAddr;
use std::sync::Arc;

use portfolio_api::content::Content;
use portfolio_api::email::{LogMailer, Mailer, SesMailer};
use portfolio_api::photos::{LocalPhotoStore, PhotoStore, S3PhotoStore};
use portfolio_api::{AppState, app};
use tracing_subscriber::EnvFilter;

type Error = Box<dyn std::error::Error + Send + Sync>;

#[tokio::main]
async fn main() -> Result<(), Error> {
    // Set by the Lambda runtime; absent when running locally.
    let on_lambda = std::env::var_os("AWS_LAMBDA_RUNTIME_API").is_some();
    init_tracing(on_lambda);

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
    axum::serve(listener, app).await?;
    Ok(())
}

fn init_tracing(on_lambda: bool) {
    let default_filter = if on_lambda {
        "info"
    } else {
        "portfolio_api=debug,tower_http=debug,info"
    };
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| default_filter.into());
    if on_lambda {
        // CloudWatch adds its own timestamps and doesn't render ANSI colors.
        tracing_subscriber::fmt()
            .json()
            .with_env_filter(filter)
            .without_time()
            .with_ansi(false)
            .init();
    } else {
        tracing_subscriber::fmt().with_env_filter(filter).init();
    }
}
