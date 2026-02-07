//! Folder Management Integration Tests
//!
//! Tests for folder repository CRUD operations using database fixtures.

use sqlx::PgPool;
use uuid::Uuid;

use cell_analysis_backend::repositories::FolderRepository;

/// Helper to create a test user and return their ID
async fn create_test_user(pool: &PgPool, username: &str) -> Uuid {
    let user_id = Uuid::new_v4();
    sqlx::query(
        r#"
        INSERT INTO users (user_id, username, password_hash, role)
        VALUES ($1, $2, 'test_hash', 'student')
        "#,
    )
    .bind(user_id)
    .bind(username)
    .execute(pool)
    .await
    .expect("Failed to create test user");

    user_id
}

// ============================================================================
// Create Folder Tests
// ============================================================================

#[sqlx::test]
async fn test_create_folder_success(pool: PgPool) {
    let user_id = create_test_user(&pool, "test_create_folder").await;

    let folder = FolderRepository::create(&pool, user_id, "Test Folder")
        .await
        .expect("Failed to create folder");

    assert_eq!(folder.folder_name, "Test Folder");
    assert_eq!(folder.user_id, user_id);
    assert!(folder.folder_id > 0);
    assert!(folder.created_at.is_some());
}

#[sqlx::test]
async fn test_create_multiple_folders(pool: PgPool) {
    let user_id = create_test_user(&pool, "test_multiple_folders").await;

    let folder1 = FolderRepository::create(&pool, user_id, "Folder 1")
        .await
        .expect("Failed to create folder 1");
    let folder2 = FolderRepository::create(&pool, user_id, "Folder 2")
        .await
        .expect("Failed to create folder 2");

    assert_ne!(folder1.folder_id, folder2.folder_id);
    assert_eq!(folder1.folder_name, "Folder 1");
    assert_eq!(folder2.folder_name, "Folder 2");
}

// ============================================================================
// Find Folders Tests
// ============================================================================

#[sqlx::test]
async fn test_find_by_user_id_empty(pool: PgPool) {
    let user_id = create_test_user(&pool, "test_empty_folders").await;

    let folders = FolderRepository::find_by_user_id(&pool, user_id)
        .await
        .expect("Failed to find folders");

    assert!(folders.is_empty());
}

#[sqlx::test]
async fn test_find_by_user_id_with_folders(pool: PgPool) {
    let user_id = create_test_user(&pool, "test_with_folders").await;

    FolderRepository::create(&pool, user_id, "Folder A").await.unwrap();
    FolderRepository::create(&pool, user_id, "Folder B").await.unwrap();

    let folders = FolderRepository::find_by_user_id(&pool, user_id)
        .await
        .expect("Failed to find folders");

    assert_eq!(folders.len(), 2);
    
    // Folders should be ordered by created_at DESC
    let folder_names: Vec<&str> = folders.iter().map(|(f, _)| f.folder_name.as_str()).collect();
    assert!(folder_names.contains(&"Folder A"));
    assert!(folder_names.contains(&"Folder B"));
}

#[sqlx::test]
async fn test_find_by_user_id_isolation(pool: PgPool) {
    // Create two users
    let user1 = create_test_user(&pool, "user1_isolation").await;
    let user2 = create_test_user(&pool, "user2_isolation").await;

    // Each user creates their own folder
    FolderRepository::create(&pool, user1, "User1 Folder").await.unwrap();
    FolderRepository::create(&pool, user2, "User2 Folder").await.unwrap();

    // User1 should only see their own folder
    let user1_folders = FolderRepository::find_by_user_id(&pool, user1).await.unwrap();
    assert_eq!(user1_folders.len(), 1);
    assert_eq!(user1_folders[0].0.folder_name, "User1 Folder");

    // User2 should only see their own folder
    let user2_folders = FolderRepository::find_by_user_id(&pool, user2).await.unwrap();
    assert_eq!(user2_folders.len(), 1);
    assert_eq!(user2_folders[0].0.folder_name, "User2 Folder");
}

// ============================================================================
// Update Folder Tests
// ============================================================================

#[sqlx::test]
async fn test_update_folder_name_success(pool: PgPool) {
    let user_id = create_test_user(&pool, "test_update_folder").await;
    let folder = FolderRepository::create(&pool, user_id, "Original Name").await.unwrap();

    let updated = FolderRepository::update_name(&pool, folder.folder_id, user_id, "New Name")
        .await
        .expect("Failed to update folder")
        .expect("Folder not found");

    assert_eq!(updated.folder_name, "New Name");
    assert_eq!(updated.folder_id, folder.folder_id);
}

#[sqlx::test]
async fn test_update_folder_not_found(pool: PgPool) {
    let user_id = create_test_user(&pool, "test_update_notfound").await;

    let result = FolderRepository::update_name(&pool, 99999, user_id, "New Name")
        .await
        .expect("Query failed");

    assert!(result.is_none());
}

#[sqlx::test]
async fn test_update_folder_wrong_owner(pool: PgPool) {
    let user1 = create_test_user(&pool, "owner_update").await;
    let user2 = create_test_user(&pool, "other_update").await;

    let folder = FolderRepository::create(&pool, user1, "User1 Folder").await.unwrap();

    // User2 should not be able to update User1's folder
    let result = FolderRepository::update_name(&pool, folder.folder_id, user2, "Hacked")
        .await
        .expect("Query failed");

    assert!(result.is_none());

    // Original folder should be unchanged
    let folders = FolderRepository::find_by_user_id(&pool, user1).await.unwrap();
    assert_eq!(folders[0].0.folder_name, "User1 Folder");
}

// ============================================================================
// Delete Folder Tests
// ============================================================================

#[sqlx::test]
async fn test_delete_folder_success(pool: PgPool) {
    let user_id = create_test_user(&pool, "test_delete_folder").await;
    let folder = FolderRepository::create(&pool, user_id, "To Delete").await.unwrap();

    let deleted_count = FolderRepository::delete(&pool, folder.folder_id, user_id)
        .await
        .expect("Failed to delete folder")
        .expect("Folder not found");

    assert_eq!(deleted_count, 0); // No images in folder

    // Verify folder is gone
    let folders = FolderRepository::find_by_user_id(&pool, user_id).await.unwrap();
    assert!(folders.is_empty());
}

#[sqlx::test]
async fn test_delete_folder_not_found(pool: PgPool) {
    let user_id = create_test_user(&pool, "test_delete_notfound").await;

    let result = FolderRepository::delete(&pool, 99999, user_id)
        .await
        .expect("Query failed");

    assert!(result.is_none());
}

#[sqlx::test]
async fn test_delete_folder_wrong_owner(pool: PgPool) {
    let user1 = create_test_user(&pool, "owner_delete").await;
    let user2 = create_test_user(&pool, "other_delete").await;

    let folder = FolderRepository::create(&pool, user1, "User1 Protected").await.unwrap();

    // User2 should not be able to delete User1's folder
    let result = FolderRepository::delete(&pool, folder.folder_id, user2)
        .await
        .expect("Query failed");

    assert!(result.is_none());

    // Folder should still exist
    let folders = FolderRepository::find_by_user_id(&pool, user1).await.unwrap();
    assert_eq!(folders.len(), 1);
}

// ============================================================================
// Image Count Tests
// ============================================================================

#[sqlx::test]
async fn test_get_image_count_empty(pool: PgPool) {
    let user_id = create_test_user(&pool, "test_image_count").await;
    let folder = FolderRepository::create(&pool, user_id, "Empty Folder").await.unwrap();

    let count = FolderRepository::get_image_count(&pool, folder.folder_id)
        .await
        .expect("Failed to get image count");

    assert_eq!(count, 0);
}
