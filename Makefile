.PHONY: dev dev-otel backend frontend test bench flamegraph build build-frontend build-backend build-auth synth deploy deploy-github-role upload-photos content-push content-pull auth-secrets

# Admin sign-in for `make dev`: the API asks the auth service (:3002) who's signed in, and only
# lets ADMIN_EMAIL in. Both come from auth/.env (copy auth/.env.example); without it the site
# still runs, with admin off.
ADMIN_EMAIL ?= $(shell sed -n 's/^ADMIN_EMAIL=//p' auth/.env 2>/dev/null)
ADMIN_ENV = ADMIN_EMAIL=$(ADMIN_EMAIL) AUTH_URL=http://localhost:3002 ADMIN_ORIGINS=http://localhost:5173

# Run the Axum API (:3000), the auth service (:3002), and the Vite dev server (:5173) together.
dev:
	@trap 'kill 0' EXIT; \
	(cd backend && $(ADMIN_ENV) cargo run) & \
	(cd auth && npm run dev) & \
	(cd frontend && npm run dev) & \
	wait

# Like `dev`, but also exporting traces, metrics, and logs over OTLP/HTTP to the local Grafana
# stack in ../telemetry (start it there first with `docker compose up -d`). Grafana takes :3000,
# so the API runs on :3001 and Vite's proxy follows it.
dev-otel:
	@trap 'kill 0' EXIT; \
	(cd backend && PORT=3001 $(ADMIN_ENV) \
		OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 \
		OTEL_SERVICE_NAME=portfolio-api \
		OTEL_RESOURCE_ATTRIBUTES=service.namespace=portfolio,deployment.environment=local \
		cargo run) & \
	(cd auth && npm run dev) & \
	(cd frontend && API_PORT=3001 npm run dev) & \
	wait

backend:
	cd backend && cargo run

frontend:
	cd frontend && npm run dev

test:
	cd backend && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
	cd frontend && npm run lint && npm run typecheck && npm test
	cd auth && npm run lint && npm run typecheck && npm test
	cd infra && npx tsc --noEmit && npm test

# Request latency with hyperfine (local release build + the live site); see scripts/bench.sh.
# `make bench MODE=local` or `MODE=prod` runs just one half.
bench:
	scripts/bench.sh $(MODE)

# CPU flamegraphs (no sudo) of a cold start and the warm request path; see backend/examples/profile.rs.
flamegraph:
	cd backend && cargo run --profile profiling --example profile -- ../bench/results/flamegraph-$$(date +%Y%m%d-%H%M%S)

build: build-frontend build-backend build-auth

build-frontend:
	cd frontend && npm ci && npm run build

# Produces backend/target/lambda/portfolio-api/bootstrap (requires cargo-lambda + zig).
build-backend:
	cd backend && cargo lambda build --release --arm64

# The auth service's dependencies; CDK bundles it with esbuild during synth.
build-auth:
	cd auth && npm ci

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

DISTRIBUTION_ID ?= $(shell aws cloudformation describe-stacks --stack-name PortfolioStack \
	--query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" --output text)

# The live site reads its content from the media bucket (content/), which admin edits.
# content-push uploads the repo's content/ over it: the first time, or to replace admin's edits
# with git's. content-pull copies the live content into content/ (mirroring deletions) so it
# can be committed.
content-push:
	@test -n "$(MEDIA_BUCKET)" || (echo "No media bucket found; deploy PortfolioStack first" && exit 1)
	aws s3 sync content s3://$(MEDIA_BUCKET)/content --exclude ".DS_Store"
	date +%s | aws s3 cp - s3://$(MEDIA_BUCKET)/content/version
	aws cloudfront create-invalidation --distribution-id $(DISTRIBUTION_ID) --paths '/api/*' > /dev/null

content-pull:
	@test -n "$(MEDIA_BUCKET)" || (echo "No media bucket found; deploy PortfolioStack first" && exit 1)
	aws s3 sync s3://$(MEDIA_BUCKET)/content content --exclude version --delete

# One-time, before the first deploy with admin: saves the auth service's secrets in SSM Parameter
# Store, where the Lambda reads them. The Google client ID and secret come from auth/.env; the
# production session secret is generated fresh. Nothing is printed.
auth-secrets: SHELL := /bin/bash
auth-secrets:
	@set -a; . auth/.env; set +a; \
	if [ -z "$$GOOGLE_CLIENT_ID" ] || [ -z "$$GOOGLE_CLIENT_SECRET" ]; then \
		echo "Fill in GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in auth/.env first"; exit 1; \
	fi; \
	put() { aws ssm put-parameter --name "/portfolio/auth/$$1" --type SecureString --overwrite --value "$$2" > /dev/null; }; \
	put google-client-id "$$GOOGLE_CLIENT_ID" && \
	put google-client-secret "$$GOOGLE_CLIENT_SECRET" && \
	put better-auth-secret "$$(openssl rand -base64 32)" && \
	echo "Saved the auth secrets under /portfolio/auth in SSM Parameter Store"
