# Build stage
FROM rust:1.92 as builder

WORKDIR /app

# Copy manifests first for better layer caching
COPY Cargo.toml Cargo.lock ./

# Copy migrations for sqlx compile-time checking
COPY migrations ./migrations

# Copy source code
COPY src ./src

# Build release binary
# Note: If using sqlx compile-time checks, run `cargo sqlx prepare` locally first
# and copy the .sqlx folder, or use SQLX_OFFLINE=true
ENV SQLX_OFFLINE=true
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the compiled binary
COPY --from=builder /app/target/release/cell-analysis-backend .

# Copy migrations for runtime (if running migrations on startup)
COPY --from=builder /app/migrations ./migrations

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/api/v1/health || exit 1

CMD ["./cell-analysis-backend"]