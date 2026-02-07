-- Remove role column from users table
-- This migration removes the role-based access control system

-- Step 1: Drop the role column from users table
ALTER TABLE users DROP COLUMN IF EXISTS role;

-- Step 2: Drop the user_role enum type
DROP TYPE IF EXISTS user_role;
