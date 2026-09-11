.PHONY: dev backend frontend test build build-frontend build-backend synth deploy

# Run the Axum API (:3000) and the Vite dev server (:5173) together.
dev:
	@trap 'kill 0' EXIT; \
	(cd backend && cargo run) & \
	(cd frontend && npm run dev) & \
	wait

backend:
	cd backend && cargo run

frontend:
	cd frontend && npm run dev

test:
	cd backend && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
	cd frontend && npm run lint && npm run typecheck && npm test
	cd infra && npx cdk synth --quiet

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
