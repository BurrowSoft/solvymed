-- Clinic details on professionals
ALTER TABLE professionals
  ADD COLUMN IF NOT EXISTS clinic_cnpj    text,
  ADD COLUMN IF NOT EXISTS clinic_address text,
  ADD COLUMN IF NOT EXISTS clinic_city    text,
  ADD COLUMN IF NOT EXISTS clinic_state   text,
  ADD COLUMN IF NOT EXISTS clinic_phone   text,
  ADD COLUMN IF NOT EXISTS clinic_website text;

-- Extra line-items per appointment (additional procedures / ad-hoc charges)
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS extra_items jsonb DEFAULT '[]'::jsonb;
