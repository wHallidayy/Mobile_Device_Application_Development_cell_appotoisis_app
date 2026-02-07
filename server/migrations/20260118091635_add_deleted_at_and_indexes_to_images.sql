-- Add deleted_at column for soft delete
ALTER TABLE images ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Drop old inefficient indexes if they exist (to be replaced)
DROP INDEX IF EXISTS idx_images_folder_id;
DROP INDEX IF EXISTS idx_jobs_status;

-- Create Optimized Indexes

-- 1. Pagination: Composite index for listing images by folder and date
CREATE INDEX idx_images_folder_listing ON images(folder_id, uploaded_at DESC);

-- 2. Soft Delete: Partial index for garbage collection
CREATE INDEX idx_images_deleted_at ON images(deleted_at) WHERE deleted_at IS NOT NULL;

-- 3. Queue Processing: FIFO queue optimization
CREATE INDEX idx_jobs_queue ON jobs(status, created_at ASC);

-- 4. Result Lookup: Ensure index exists (might not be in original migration)
CREATE INDEX IF NOT EXISTS idx_results_job_id ON analysis_results(job_id);

-- 5. Folders User ID: Ensure index exists
CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id);

-- 6. Integrity: Ensure index exists
CREATE INDEX IF NOT EXISTS idx_jobs_image_id ON jobs(image_id);
