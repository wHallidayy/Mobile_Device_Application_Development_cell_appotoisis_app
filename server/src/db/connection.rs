use secrecy::ExposeSecret;
use sqlx::postgres::{PgPool, PgPoolOptions};

use crate::config::settings::DatabaseConfig;

pub async fn create_pool(config: &DatabaseConfig) -> Result<PgPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(config.max_connections)
        .min_connections(config.min_connections)
        .connect(config.url.expose_secret())
        .await
}
