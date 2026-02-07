use sqlx::PgPool;

#[sqlx::test]
async fn test_database_connection(pool: PgPool) {
    let result = sqlx::query("SELECT 1 as value").fetch_one(&pool).await;
    assert!(result.is_ok());
}
