.PHONY: dev dev-otel backend frontend test build build-frontend build-backend synth deploy deploy-github-role upload-photos

# Run the Axum API (:3000) and the Vite dev server (:5173) together.
dev:
	@trap 'kill 0' EXIT; \
	(cd backend && cargo run) & \
	(cd frontend && npm run dev) & \
	wait

# Like `dev`, but also exporting traces, metrics, and logs over OTLP/HTTP to the local Grafana
# stack in ../telemetry (start it there first with `docker compose up -d`). Grafana takes :3000,
# so the API runs on :3001 and Vite's proxy follows it.
dev-otel:
	@trap 'kill 0' EXIT; \
	(cd backend && PORT=3001 \
		OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 \
		OTEL_SERVICE_NAME=portfolio-api \
		OTEL_RESOURCE_ATTRIBUTES=service.namespace=portfolio,deployment.environment=local \
		cargo run) & \
	(cd frontend && API_PORT=3001 npm run dev) & \
	wait

backend:
	cd backend && cargo run

frontend:
	cd frontend && npm run dev

test:
	cd backend && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
	cd frontend && npm run lint && npm run typecheck && npm test
	cd infra && npx tsc --noEmit && npm test

build: build-frontend build-backend

build-frontend:
	cd frontend && npm ci && npm run build

# Produces backend/target/lambda/portfolio-api/bootstrap (requires cargo-lambda + zig).
build-backend:
	cd backend && cargo lambda build --release --arm64

synth:
	cd infra && npx cdk synth

deploy: build
	cd infra && npx cdk deploy PortfolioStack

# One-time: lets GitHub Actions deploy via OIDC. Save the DeployRoleArn output as the
# repository variable AWS_DEPLOY_ROLE_ARN.
deploy-github-role: build
	cd infra && npx cdk deploy PortfolioGithubOidc

# Gallery photos aren't in git; sync the local copy to the media bucket (created by PortfolioStack).
MEDIA_BUCKET ?= $(shell aws cloudformation describe-stacks --stack-name PortfolioStack \
	--query "Stacks[0].Outputs[?OutputKey=='MediaBucketName'].OutputValue" --output text)

upload-photos:
	@test -n "$(MEDIA_BUCKET)" || (echo "No media bucket found; deploy PortfolioStack first" && exit 1)
	aws s3 sync frontend/public/photos s3://$(MEDIA_BUCKET)/photos \
		--exclude ".DS_Store" --cache-control "public, max-age=86400"
