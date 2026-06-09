-- Add record_type to medical_records
ALTER TABLE medical_records
  ADD COLUMN IF NOT EXISTS record_type text DEFAULT 'Free text';

-- Add scheduled_by to appointments
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS scheduled_by text;
