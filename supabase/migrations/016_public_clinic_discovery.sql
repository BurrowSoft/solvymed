-- Public discovery function for the patient-facing web search page.
-- Joins clinics → clinic_professionals → professionals safely as a SECURITY DEFINER
-- function so unauthenticated (anon) users can discover clinics without needing
-- explicit read policies on the professionals table.

CREATE OR REPLACE FUNCTION public.get_public_clinics()
RETURNS TABLE(
  clinic_id         uuid,
  clinic_name       text,
  address           text,
  city              text,
  state             text,
  country           text,
  phone             text,
  lat               numeric,
  lng               numeric,
  professional_id   uuid,
  professional_name text,
  specialty         text,
  photo_url         text,
  invite_code       text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    c.id,
    c.name,
    c.address,
    c.city,
    c.state,
    c.country,
    c.phone,
    c.lat,
    c.lng,
    p.id,
    p.full_name,
    p.specialty,
    p.photo_url,
    p.public_invite_code
  FROM clinics c
  JOIN clinic_professionals cp ON cp.clinic_id = c.id
  JOIN professionals p ON p.id = cp.professional_id
  ORDER BY c.name, p.full_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_clinics() TO anon, authenticated;
