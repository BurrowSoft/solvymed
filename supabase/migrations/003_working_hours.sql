-- Add working_hours column to professionals table
ALTER TABLE professionals
  ADD COLUMN IF NOT EXISTS working_hours jsonb DEFAULT '{}';
