CREATE TABLE analysis_results (
    result_id BIGSERIAL PRIMARY KEY,
    job_id BIGINT UNIQUE NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
    count_viable INT DEFAULT 0,
    count_apoptosis INT DEFAULT 0,
    count_other INT DEFAULT 0,
    avg_confidence_score FLOAT,
    raw_data JSONB,
    summary_data TEXT,
    analyzed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);