//! Logging for every environment, plus optional OpenTelemetry export: traces, metrics, and logs
//! over OTLP/HTTP to a collector, such as the Grafana Alloy stack in the telemetry repo.
//!
//! Export is off unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set (`make dev-otel` sets it). The
//! exporters and resource also read the other standard `OTEL_*` variables, such as
//! `OTEL_SERVICE_NAME` and `OTEL_RESOURCE_ATTRIBUTES=service.namespace=portfolio`. It stays off on
//! Lambda, where batched telemetry would have to be flushed before each invocation is frozen.

use std::sync::LazyLock;
use std::time::{Duration, Instant};

use axum::extract::{MatchedPath, Request};
use axum::http::HeaderMap;
use axum::middleware::Next;
use axum::response::Response;
use opentelemetry::metrics::{Counter, Histogram};
use opentelemetry::propagation::Extractor;
use opentelemetry::trace::TracerProvider as _;
use opentelemetry::{KeyValue, global};
use opentelemetry_appender_tracing::layer::OpenTelemetryTracingBridge;
use opentelemetry_otlp::{LogExporter, MetricExporter, SpanExporter};
use opentelemetry_sdk::Resource;
use opentelemetry_sdk::logs::SdkLoggerProvider;
use opentelemetry_sdk::metrics::SdkMeterProvider;
use opentelemetry_sdk::propagation::TraceContextPropagator;
use opentelemetry_sdk::trace::SdkTracerProvider;
use tracing::Span;
use tracing_opentelemetry::OpenTelemetrySpanExt;
use tracing_subscriber::filter::filter_fn;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::{EnvFilter, Layer};

type Error = Box<dyn std::error::Error + Send + Sync>;

const SERVICE_NAME: &str = "portfolio-api";

/// Holds the exporters so pending telemetry can be flushed on shutdown.
#[must_use = "call shutdown() to flush pending telemetry"]
pub struct Telemetry {
    providers: Option<Providers>,
}

struct Providers {
    tracer: SdkTracerProvider,
    meter: SdkMeterProvider,
    logger: SdkLoggerProvider,
}

impl Telemetry {
    /// Installs the global `tracing` subscriber: readable logs locally, JSON on Lambda, and OTLP
    /// export when configured. Call it before starting the async runtime, because the HTTP
    /// exporter's blocking client can't be created inside one.
    pub fn init(on_lambda: bool) -> Result<Self, Error> {
        let default_filter = if on_lambda {
            "info"
        } else {
            "portfolio_api=debug,tower_http=debug,info"
        };
        let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| default_filter.into());

        let fmt = if on_lambda {
            // CloudWatch adds its own timestamps and doesn't render ANSI colors.
            tracing_subscriber::fmt::layer()
                .json()
                .without_time()
                .with_ansi(false)
                .boxed()
        } else {
            tracing_subscriber::fmt::layer().boxed()
        };

        let exporting = !on_lambda && std::env::var_os("OTEL_EXPORTER_OTLP_ENDPOINT").is_some();
        let providers = exporting.then(Providers::new).transpose()?;
        let otel = providers.as_ref().map(|providers| {
            let traces =
                tracing_opentelemetry::layer().with_tracer(providers.tracer.tracer(SERVICE_NAME));
            let logs = OpenTelemetryTracingBridge::new(&providers.logger)
                .with_filter(filter_fn(|meta| !is_exporter_internal(meta.target())));
            traces.and_then(logs)
        });

        tracing_subscriber::registry()
            .with(filter)
            .with(fmt)
            .with(otel)
            .try_init()?;
        Ok(Self { providers })
    }

    pub fn is_exporting(&self) -> bool {
        self.providers.is_some()
    }

    /// Flushes pending telemetry and stops the exporters.
    pub fn shutdown(self) {
        let Some(providers) = self.providers else {
            return;
        };
        let results = [
            providers.tracer.shutdown(),
            providers.meter.shutdown(),
            providers.logger.shutdown(),
        ];
        for error in results.into_iter().filter_map(Result::err) {
            // The subscriber may already be gone, so report straight to stderr.
            eprintln!("telemetry shutdown: {error}");
        }
    }
}

impl Providers {
    fn new() -> Result<Self, Error> {
        // OTEL_RESOURCE_ATTRIBUTES (e.g. service.namespace) is merged in by the builder.
        let resource = Resource::builder()
            .with_service_name(
                std::env::var("OTEL_SERVICE_NAME").unwrap_or_else(|_| SERVICE_NAME.into()),
            )
            .with_attribute(KeyValue::new("service.version", env!("CARGO_PKG_VERSION")))
            .build();

        let tracer = SdkTracerProvider::builder()
            .with_resource(resource.clone())
            .with_batch_exporter(SpanExporter::builder().with_http().build()?)
            .build();
        let meter = SdkMeterProvider::builder()
            .with_resource(resource.clone())
            .with_periodic_exporter(MetricExporter::builder().with_http().build()?)
            .build();
        let logger = SdkLoggerProvider::builder()
            .with_resource(resource)
            .with_batch_exporter(LogExporter::builder().with_http().build()?)
            .build();

        global::set_tracer_provider(tracer.clone());
        global::set_meter_provider(meter.clone());
        global::set_text_map_propagator(TraceContextPropagator::new());
        Ok(Self {
            tracer,
            meter,
            logger,
        })
    }
}

/// Logs from the exporter's own HTTP stack. Forwarding those back through OTLP would loop.
fn is_exporter_internal(target: &str) -> bool {
    ["opentelemetry", "reqwest", "hyper", "h2", "tower"]
        .iter()
        .any(|prefix| target.starts_with(prefix))
}

// --- Requests ---

/// The server span for a request, named like `GET /api/projects/{slug}`, continuing the caller's
/// trace when a W3C `traceparent` header is present. For tower-http's `TraceLayer`.
pub fn request_span<B>(request: &axum::http::Request<B>) -> Span {
    let method = request.method();
    let route = route_of(request);
    let span = tracing::info_span!(
        "request",
        otel.name = %format!("{method} {route}"),
        otel.kind = "server",
        otel.status_code = tracing::field::Empty,
        http.request.method = %method,
        http.route = route,
        url.path = request.uri().path(),
        http.response.status_code = tracing::field::Empty,
    );
    let parent = global::get_text_map_propagator(|propagator| {
        propagator.extract(&HeaderExtractor(request.headers()))
    });
    // Only fails when the span is disabled (filtered out), in which case there's nothing to link.
    let _ = span.set_parent(parent);
    span
}

/// Completes a request span with its status code, marking 5xx responses as errors.
pub fn on_response<B>(response: &axum::http::Response<B>, latency: Duration, span: &Span) {
    let status = response.status();
    span.record("http.response.status_code", status.as_u16());
    if status.is_server_error() {
        span.record("otel.status_code", "ERROR");
    }
    tracing::debug!(
        parent: span,
        status = status.as_u16(),
        latency_ms = latency.as_millis(),
        "finished processing request"
    );
}

/// Axum middleware recording each request's duration by method, route, and status code.
pub async fn track_request(request: Request, next: Next) -> Response {
    let start = Instant::now();
    let method = request.method().to_string();
    let route = route_of(&request).to_owned();
    let response = next.run(request).await;
    metrics().request_duration.record(
        start.elapsed().as_secs_f64(),
        &[
            KeyValue::new("http.request.method", method),
            KeyValue::new("http.route", route),
            KeyValue::new(
                "http.response.status_code",
                i64::from(response.status().as_u16()),
            ),
        ],
    );
    response
}

/// The route template (`/api/projects/{slug}`) rather than the raw path, so span names and
/// metric labels stay low-cardinality. Unmatched requests (404s) share one name.
fn route_of<B>(request: &axum::http::Request<B>) -> &str {
    request
        .extensions()
        .get::<MatchedPath>()
        .map_or("unmatched", MatchedPath::as_str)
}

/// Reads W3C trace-context headers for the propagator.
struct HeaderExtractor<'a>(&'a HeaderMap);

impl Extractor for HeaderExtractor<'_> {
    fn get(&self, key: &str) -> Option<&str> {
        self.0.get(key).and_then(|value| value.to_str().ok())
    }

    fn keys(&self) -> Vec<&str> {
        self.0.keys().map(|key| key.as_str()).collect()
    }
}

// --- Metrics ---

/// Counts a contact-form submission by outcome: `sent`, `invalid`, `spam`, or `failed`.
pub fn record_contact(outcome: &'static str) {
    metrics()
        .contact_submissions
        .add(1, &[KeyValue::new("outcome", outcome)]);
}

/// Instruments are no-ops until `Telemetry::init` installs an exporter. They're created on first
/// use, which is after init.
struct Metrics {
    request_duration: Histogram<f64>,
    contact_submissions: Counter<u64>,
}

fn metrics() -> &'static Metrics {
    static METRICS: LazyLock<Metrics> = LazyLock::new(|| {
        let meter = global::meter(SERVICE_NAME);
        Metrics {
            // OpenTelemetry's HTTP semantic conventions: seconds, with their recommended buckets.
            request_duration: meter
                .f64_histogram("http.server.request.duration")
                .with_unit("s")
                .with_description("Duration of HTTP server requests.")
                .with_boundaries(vec![
                    0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1.0, 2.5, 5.0, 7.5, 10.0,
                ])
                .build(),
            contact_submissions: meter
                .u64_counter("portfolio.contact.submissions")
                .with_description("Contact-form submissions, by outcome.")
                .build(),
        }
    });
    &METRICS
}

#[cfg(test)]
mod tests {
    use opentelemetry::propagation::TextMapPropagator;
    use opentelemetry::trace::TraceContextExt;

    use super::*;

    #[test]
    fn extracts_the_callers_trace_context() {
        let mut headers = HeaderMap::new();
        headers.insert(
            "traceparent",
            "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
                .parse()
                .unwrap(),
        );
        let extractor = HeaderExtractor(&headers);
        assert_eq!(extractor.keys(), ["traceparent"]);

        let cx = TraceContextPropagator::new().extract(&extractor);
        let span_context = cx.span().span_context().clone();
        assert_eq!(
            span_context.trace_id().to_string(),
            "4bf92f3577b34da6a3ce929d0e0e4736"
        );
        assert!(span_context.is_remote());
    }

    #[test]
    fn keeps_exporter_logs_out_of_the_log_export() {
        for target in [
            "opentelemetry_sdk::trace",
            "reqwest::connect",
            "hyper_util::client",
        ] {
            assert!(is_exporter_internal(target), "{target}");
        }
        assert!(!is_exporter_internal("portfolio_api::routes::contact"));
    }
}
