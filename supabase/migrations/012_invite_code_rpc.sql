-- Allows any authenticated user to resolve a patient by invite_code
-- without exposing all patient data (bypasses RLS safely).
-- Used by patient self-signup on both mobile and web.
CREATE OR REPLACE FUNCTION public.patient_by_invite_code(code text)
RETURNS TABLE(patient_id uuid, patient_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT id, full_name
  FROM patients
  WHERE invite_code = UPPER(TRIM(code))
  LIMIT 1;
END;
$$;
