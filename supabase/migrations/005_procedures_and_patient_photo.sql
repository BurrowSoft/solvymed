-- Consultation procedures: pre-configured types with name, duration, and price
CREATE TABLE IF NOT EXISTS procedures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  name text NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 30,
  price numeric,
  payment_type text NOT NULL DEFAULT 'private' CHECK (payment_type IN ('private', 'insurance')),
  active boolean NOT NULL DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE procedures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "professionals_own_procedures" ON procedures
  FOR ALL USING (auth.uid() = professional_id)
  WITH CHECK (auth.uid() = professional_id);

-- Patient photo URL (stored in Supabase Storage bucket "patient-photos")
ALTER TABLE patients ADD COLUMN IF NOT EXISTS photo_url text;

-- ══════════════════════════════════════════════════════════════════════
-- MANUAL STEP REQUIRED: Create the Supabase Storage bucket for patient photos
-- ══════════════════════════════════════════════════════════════════════
-- 1. Go to Supabase Dashboard → Storage
-- 2. Create a new bucket named: patient-photos
-- 3. Set it to PUBLIC (photos are displayed in the app UI)
-- 4. Add RLS policy on storage.objects:
--      Policy name: patient_photos_access
--      Operation: ALL
--      Expression:
--        bucket_id = 'patient-photos'
--        AND auth.uid()::text = (storage.foldername(name))[1]
--
-- Photos are stored as: {professional_id}/{patient_id}.{ext}
-- ══════════════════════════════════════════════════════════════════════
