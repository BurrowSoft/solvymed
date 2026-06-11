-- Prevent duplicate patient records per doctor with the same email
CREATE UNIQUE INDEX IF NOT EXISTS patients_professional_email_unique
  ON patients (professional_id, lower(email))
  WHERE email IS NOT NULL AND email <> '';
