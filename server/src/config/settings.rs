use config::{Config, Environment};
use secrecy::Secret;
use serde::Deserialize;
 
#[derive(Debug, Deserialize, Clone)]
pub struct AppConfig {
    pub server: ServerConfig,
    pub database: DatabaseConfig,
    pub jwt: JwtConfig,
    
    #[serde(default)] 
    pub storage: StorageConfig,
    
    #[serde(default)]
    pub rabbitmq: RabbitmqConfig,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ServerConfig {
    #[serde(default = "default_host")]
    pub host: String,
    #[serde(default = "default_port")]
    pub port: u16,
}

#[derive(Debug, Deserialize, Clone)]
pub struct DatabaseConfig {
    pub url: Secret<String>,
    #[serde(default = "default_db_max_conn")]
    pub max_connections: u32,
    #[serde(default = "default_db_min_conn")]
    pub min_connections: u32,
}

#[derive(Debug, Deserialize, Clone)]
pub struct JwtConfig {
    pub secret: Secret<String>,
    #[serde(default = "default_jwt_expiration")]
    pub expiration_hours: i64,
    #[serde(default = "default_jwt_refresh_expiration")]
    pub refresh_expiration_days: i64,
}

#[derive(Debug, Deserialize, Clone)]
pub struct StorageConfig {
    #[serde(default = "default_s3_endpoint")]
    pub endpoint: String,
    #[serde(default = "default_s3_bucket")]
    pub bucket: String,
    #[serde(default = "default_s3_region")]
    pub region: String,
    #[serde(default = "default_s3_access_key")]
    pub access_key: Secret<String>,
    #[serde(default = "default_s3_secret_key")]
    pub secret_key: Secret<String>,
    #[serde(default = "default_presign_expiry_secs")]
    pub presign_expiry_secs: u64,
    #[serde(default)]
    pub public_endpoint: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct RabbitmqConfig {
    #[serde(default = "default_rabbitmq_host")]
    pub host: String,
    #[serde(default = "default_rabbitmq_port")]
    pub port: u16,
    #[serde(default = "default_rabbitmq_user")]
    pub user: String,
    #[serde(default = "default_rabbitmq_password")]
    pub password: Secret<String>,
    #[serde(default = "default_analysis_queue")]
    pub analysis_queue: String,
}

fn default_host() -> String { "0.0.0.0".to_string() }
fn default_port() -> u16 { 8080 }
fn default_db_max_conn() -> u32 { 10 }
fn default_db_min_conn() -> u32 { 2 }
fn default_jwt_expiration() -> i64 { 24 }
fn default_jwt_refresh_expiration() -> i64 { 7 }

fn default_s3_endpoint() -> String { "http://localhost:9000".to_string() }
fn default_s3_bucket() -> String { "mybucket".to_string() }
fn default_s3_region() -> String { "us-east-1".to_string() }
fn default_s3_access_key() -> Secret<String> { Secret::new("minioadmin".to_string()) }
fn default_s3_secret_key() -> Secret<String> { Secret::new("minioadmin".to_string()) }
fn default_presign_expiry_secs() -> u64 { 3600 }

fn default_rabbitmq_host() -> String { "localhost".to_string() }
fn default_rabbitmq_port() -> u16 { 5672 }
fn default_rabbitmq_user() -> String { "rabbitmq".to_string() }
fn default_rabbitmq_password() -> Secret<String> { Secret::new("rabbitmq".to_string()) }
fn default_analysis_queue() -> String { "analysis_jobs".to_string() }

impl Default for RabbitmqConfig {
    fn default() -> Self {
        Self {
            host: default_rabbitmq_host(),
            port: default_rabbitmq_port(),
            user: default_rabbitmq_user(),
            password: default_rabbitmq_password(),
            analysis_queue: default_analysis_queue(),
        }
    }
}

impl Default for StorageConfig {
    fn default() -> Self {
        Self {
            endpoint: default_s3_endpoint(),
            bucket: default_s3_bucket(),
            region: default_s3_region(),
            access_key: default_s3_access_key(),
            secret_key: default_s3_secret_key(),
            presign_expiry_secs: default_presign_expiry_secs(),
            public_endpoint: None,
        }
    }
}

impl AppConfig {
    pub fn build() -> Result<Self, config::ConfigError> {
        let builder = Config::builder()
            .add_source(Environment::default().separator("__"));

        builder
            .build()?
            .try_deserialize()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;
    use std::env;

    #[test]
    #[serial]
    fn test_config_defaults() {
        // ต้องใช้ __ (Double Underscore) เพื่อเข้าถึง field ย่อย
        env::set_var("DATABASE__URL", "postgres://test");
        env::set_var("JWT__SECRET", "test-secret");
        
        let config = AppConfig::build().expect("Should load config");
        
        assert_eq!(config.server.host, "0.0.0.0");
        assert_eq!(config.server.port, 8080); // ค่า Default
        
        env::remove_var("DATABASE__URL");
        env::remove_var("JWT__SECRET");
    }

    #[test]
    #[serial]
    fn test_config_override() {
        env::set_var("DATABASE__URL", "postgres://test");
        env::set_var("JWT__SECRET", "test-secret");
        env::set_var("SERVER__PORT", "9090"); // ลองเปลี่ยน Port
        
        let config = AppConfig::build().expect("Should load config");
        
        assert_eq!(config.server.port, 9090);
        
        env::remove_var("DATABASE__URL");
        env::remove_var("JWT__SECRET");
        env::remove_var("SERVER__PORT");
    }

    #[test]
    #[serial]
    fn test_missing_database_url() {
        // ไม่ set DATABASE__URL
        env::set_var("JWT__SECRET", "test-secret");
        
        let result = AppConfig::build();
        
        // Error จะบอกว่า field ไหนหายไป
        assert!(result.is_err());
        
        env::remove_var("JWT__SECRET");
    }
}