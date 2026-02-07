CREATE TABLE jobs (
    job_id BIGSERIAL PRIMARY KEY,
    image_id BIGINT NOT NULL REFERENCES images(image_id) ON DELETE CASCADE,
    status job_status NOT NULL DEFAULT 'pending',
    ai_model_version VARCHAR(50),
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);