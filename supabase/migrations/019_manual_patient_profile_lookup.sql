-- Lets a patient look up their own data from the professionals' patients table.
-- Needed because `patients` is professionals-only (RLS), but when a previously
-- walk-in patient signs up and books, we want to prefill the booking form and
-- avoid creating a duplicate record on confirmation.
--
-- Security: email is taken from the calling user's JWT, not a parameter, so a
-- patient can only ever retrieve their own data.

CREATE OR REPLACE FUNCTION public.get_manual_patient_profile(p_professional_id uuid)
RETURNS TABLE (full_name text, phone text, birth_date text, cpf text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p.full_name::text,
    p.phone::text,
    p.birth_date::text,
    p.cpf::text
  FROM patients p
  WHERE p.professional_id = p_professional_id
    AND p.email = (auth.jwt() ->> 'email')
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_manual_patient_profile(uuid) TO authenticated;
