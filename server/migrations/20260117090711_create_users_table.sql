CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE user_role AS ENUM ('researcher', 'student', 'lecturer');
CREATE TYPE job_status AS ENUM ('pending', 'processing', 'completed', 'failed');

CREATE TABLE users (
user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
username VARCHAR(255) UNIQUE NOT NULL,
password_hash VARCHAR(255) NOT NULL,
role user_role NOT NULL DEFAULT 'student',
created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);