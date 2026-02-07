CREATE TABLE folders (
    folder_id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    folder_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ DEFAULT NULL
);

-- Index for soft delete queries (filter non-deleted folders)
CREATE INDEX idx_folders_user_deleted ON folders(user_id, deleted_at) WHERE deleted_at IS NULL;