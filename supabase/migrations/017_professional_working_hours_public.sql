-- Exposes a professional's working_hours to any authenticated or anonymous caller.
-- Needed because the professionals table has RLS (auth.uid() = id) — patients
-- cannot read it directly, but need working hours to compute available slots.

CREATE OR REPLACE FUNCTION public.get_professional_working_hours(p_professional_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT working_hours FROM professionals WHERE id = p_professional_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_professional_working_hours(uuid) TO anon, authenticated;
