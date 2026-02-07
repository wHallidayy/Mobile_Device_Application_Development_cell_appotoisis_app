use actix_cors::Cors;
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;
use crate::routes::ApiDoc;
use std::io::Result;

#[cfg(not(target_env = "msvc"))]
use jemallocator::Jemalloc;

#[cfg(not(target_env = "msvc"))]
#[global_allocator]
static GLOBAL: Jemalloc = Jemalloc;

use actix_web::{web, App, HttpServer, middleware as actix_middleware};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod config;
mod db;
mod domain;
mod dto;
mod handlers;
mod models;
mod middleware;
mod repositories;
mod routes;
mod services;
// mod utils;
// mod workers;

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("Starting Cell Analysis Backend");

    dotenvy::dotenv().ok();
    let config = config::settings::AppConfig::build()
        .expect("Failed to load configuration");

    let bind_address = format!("{}:{}", config.server.host, config.server.port);

    let pool = db::connection::create_pool(&config.database)
        .await
        .expect("Failed to create database pool");

    tracing::info!("Database pool created");

    // Initialize S3 storage service
    let s3_storage = services::S3StorageService::new(&config.storage)
        .expect("Failed to create S3 storage service");
    
    tracing::info!("S3 storage service initialized: endpoint={}", config.storage.endpoint);

    // Initialize RabbitMQ service
    let rabbitmq_service = services::RabbitmqService::new(&config.rabbitmq)
        .await
        .expect("Failed to connect to RabbitMQ");

    tracing::info!(
        "RabbitMQ service initialized: host={}, queue={}",
        config.rabbitmq.host,
        config.rabbitmq.analysis_queue
    );

    // Clone jwt_config for use in app_data
    let jwt_config = config.jwt.clone();

    HttpServer::new(move || {
        // CORS configuration - allow all origins, methods, and headers
        let cors = Cors::permissive();

        let jwt_config_clone = jwt_config.clone();
        App::new()
            .app_data(web::Data::new(pool.clone()))
            .app_data(web::Data::new(jwt_config.clone()))
            .app_data(web::Data::new(s3_storage.clone()))
            .app_data(web::Data::new(rabbitmq_service.clone()))
            .wrap(cors)
            .wrap(middleware::SecurityHeaders::new())
            .wrap(actix_middleware::Logger::default())
            .configure(|cfg| routes::configure_routes(cfg, jwt_config_clone))
            .service(
                SwaggerUi::new("/swagger-ui/{_:.*}")
                    .url("/api-docs/openapi.json", ApiDoc::openapi())
            )
    })
    .bind(&bind_address)?
    .run()
    .await
}
