# ============================================
# Environment Setup
# ============================================

# Load .env file automatically
ifneq (,$(wildcard ./.env))
    include .env
    export
endif

# Default variables if not in .env
PROJECT_NAME ?= Cell_Analysis_Backend

# Map DATABASE__URL (from your .env) to DATABASE_URL (required by sqlx)
export DATABASE_URL ?= $(DATABASE__URL)

# ============================================
# Docker Commands
# ============================================

.PHONY: up down restart logs ps build clean rm help

# Start all containers
up:
	docker compose --env-file .env up -d

# Start all containers with build
up-build:
	docker compose --env-file .env up -d --build

# Start with pgAdmin (tools profile)
up-tools:
	docker compose --env-file .env --profile tools up -d

# Stop all containers
down:
	docker compose down

# Stop all containers and remove volumes (RESET DATA)
down-v:
	docker compose down -v

# Restart all containers
restart: down up

# View logs
logs:
	docker compose logs -f

# View logs for specific service (usage: make logs-postgres)
logs-%:
	docker compose logs -f $*

# Show running containers
ps:
	docker compose ps

# Build containers
build:
	docker compose build

# Clean up everything (containers, volumes, networks, images)
clean: down-v
	docker system prune -f
	@echo "Clean complete. Note: Local docker images were not removed to save bandwidth."

# ============================================
# Rust Backend Commands
# ============================================

# Install necessary cargo tools
install-tools:
	cargo install cargo-watch sqlx-cli cargo-audit cargo-tarpaulin cargo-deny

# Build backend (debug)
rust-build:
	cd server && cargo build

# Build backend (release with optimizations)
rust-release:
	cd server && cargo build --release

# Run backend dev server
# Note: Ensures env vars are loaded for the app
rust-run:
	cd server && cargo run

# Run with cargo-watch for hot reload
rust-watch:
	cd server && cargo watch -x run

# Run tests
rust-test:
	cd server && cargo test

# Run cargo check
rust-check:
	cd server && cargo check

# Format code
rust-fmt:
	cd server && cargo fmt

# Run Clippy linter
rust-clippy:
	cd server && cargo clippy -- -D warnings

# ============================================
# Database Migration Commands (SQLx)
# ============================================

# Create new migration (usage: make sqlx-create msg="add_users_table")
sqlx-create:
	@if [ -z "$(msg)" ]; then echo "Error: msg is required. Usage: make sqlx-create msg='description'"; exit 1; fi
	cd server && sqlx migrate add -r $(msg)

# Run all migrations
# Note: Uses DATABASE_URL mapped from your .env
sqlx-run:
	cd server && sqlx migrate run

# Revert last migration
sqlx-revert:
	cd server && sqlx migrate revert

# Show migration info
sqlx-info:
	cd server && sqlx migrate info

# Prepare offline query data (vital for building in CI/Docker without DB)
sqlx-prepare:
	cd server && cargo sqlx prepare -- --lib

# ============================================
# Security & CI
# ============================================

# Run security audits
rust-security:
	cd server && cargo audit
	cd server && cargo deny check advisories

# Full local CI check
ci: rust-fmt rust-clippy rust-test rust-security
	@echo "All CI checks passed!"

# ============================================
# MinIO/Storage Commands
# ============================================

# Initialize MinIO bucket with proper configuration
init-bucket:
	@echo "Initializing MinIO bucket..."
	@docker exec Cell_Analysis_Backend-minio mc alias set myminio http://localhost:9000 minioadmin minioadmin || true
	@docker exec Cell_Analysis_Backend-minio mc mb myminio/mybucket --ignore-existing || true
	@docker exec Cell_Analysis_Backend-minio mc anonymous set public myminio/mybucket || true
	@echo "Bucket 'mybucket' initialized successfully!"

# Check bucket status
bucket-status:
	@docker exec Cell_Analysis_Backend-minio mc ls myminio/

# Remove all objects from bucket (DANGER: deletes all files)
bucket-clean:
	@echo "WARNING: This will delete all files in the bucket!"
	@docker exec Cell_Analysis_Backend-minio mc rm --recursive --force myminio/mybucket

# ============================================
# Model Worker Commands
# ============================================

# View model worker logs
worker-logs:
	docker compose logs -f model_worker

# Rebuild model worker
worker-rebuild:
	docker compose build model_worker
	docker compose up -d model_worker

# Run model worker locally (requires conda base)
worker-local:
	cd model_worker && python worker.py

# ============================================
# Help
# ============================================

help:
	@echo "Project: $(PROJECT_NAME)"
	@echo ""
	@echo "=== Docker ==="
	@echo "  make up          - Start services"
	@echo "  make up-build    - Start services with rebuild"
	@echo "  make up-tools    - Start services + pgAdmin"
	@echo "  make down        - Stop services"
	@echo "  make down-v      - Stop services & DELETE DATA volumes"
	@echo "  make logs        - Follow all logs"
	@echo "  make logs-<svc>  - Follow specific service logs"
	@echo ""
	@echo "=== MinIO/Storage ==="
	@echo "  make init-bucket    - Initialize MinIO bucket"
	@echo "  make bucket-status  - Check bucket contents"
	@echo "  make bucket-clean   - Remove all files from bucket (DANGER)"
	@echo ""
	@echo "=== Rust & SQLx ==="
	@echo "  make install-tools - Install cargo-watch, sqlx-cli, etc."
	@echo "  make rust-watch    - Run dev server with hot-reload"
	@echo "  make sqlx-run      - Run database migrations"
	@echo "  make sqlx-create msg='name' - Create new migration file"
	@echo "  make sqlx-prepare  - Generate offline SQLx data"
	@echo ""
	@echo "=== Model Worker ==="
	@echo "  make worker-logs    - Follow model worker logs"
	@echo "  make worker-rebuild - Rebuild and restart model worker"
	@echo "  make worker-local   - Run worker locally (needs conda)"