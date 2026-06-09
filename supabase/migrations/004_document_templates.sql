-- Document templates: per-doctor, per-document-type branding (color palette + logo)
CREATE TABLE IF NOT EXISTS document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('prescription', 'medical_record', 'invoice')),
  primary_color text NOT NULL DEFAULT '#208AEF',
  accent_color text NOT NULL DEFAULT '#E8F4FE',
  logo_url text,
  header_text text,
  footer_text text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(professional_id, document_type)
);

ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "professionals_own_templates" ON document_templates
  FOR ALL USING (auth.uid() = professional_id)
  WITH CHECK (auth.uid() = professional_id);

-- ══════════════════════════════════════════════════════════════════════
-- MANUAL STEP REQUIRED: Create the Supabase Storage bucket for logos
-- ══════════════════════════════════════════════════════════════════════
-- 1. Go to Supabase Dashboard → Storage
-- 2. Create a new bucket named: document-logos
-- 3. Set it to PUBLIC (logos must be accessible in generated PDFs)
-- 4. In the bucket's Policies tab, add an RLS policy:
--      Policy name: professional_logos_access
--      Operation: ALL
--      Expression:
--        bucket_id = 'document-logos'
--        AND auth.uid()::text = (storage.foldername(name))[1]
--
-- Logo files are stored at: {professional_id}/{document_type}.{ext}
-- ══════════════════════════════════════════════════════════════════════
