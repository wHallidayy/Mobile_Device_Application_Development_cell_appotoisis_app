CREATE TABLE images (
    image_id BIGSERIAL PRIMARY KEY,
    folder_id INT NOT NULL REFERENCES folders(folder_id) ON DELETE CASCADE,
    file_path VARCHAR(500) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(50) NOT NULL,
    file_size INT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    uploaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);