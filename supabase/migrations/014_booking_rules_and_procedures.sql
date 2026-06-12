-- ─── booking_blocked on patients ─────────────────────────────────────────────
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS booking_blocked boolean NOT NULL DEFAULT false;

-- ─── max_concurrent_bookings on professionals ─────────────────────────────────
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS max_concurrent_bookings integer DEFAULT null;

-- ─── Trigger: enforce patient booking rules ───────────────────────────────────
-- Fires BEFORE INSERT on appointments.
-- For linked appointments (patient_id set): checks booking_blocked flag.
-- For discovery bookings (patient_auth_id set, patient_id NULL): skips block check
--   since there is no patient record yet, but still enforces max_concurrent_bookings
--   by counting active slots for that auth user.
CREATE OR REPLACE FUNCTION public.check_patient_booking_rules()
RETURNS trigger AS $$
DECLARE
  v_blocked boolean;
  v_max     integer;
  v_count   integer;
BEGIN
  IF NEW.patient_id IS NOT NULL THEN
    SELECT booking_blocked INTO v_blocked FROM patients WHERE id = NEW.patient_id;
    IF v_blocked = true THEN
      RAISE EXCEPTION 'Patient is blocked from scheduling';
    END IF;
  END IF;

  SELECT max_concurrent_bookings INTO v_max FROM professionals WHERE id = NEW.professional_id;
  IF v_max IS NOT NULL THEN
    IF NEW.patient_id IS NOT NULL THEN
      SELECT COUNT(*) INTO v_count FROM appointments
      WHERE professional_id = NEW.professional_id
        AND patient_id      = NEW.patient_id
        AND status IN ('tentative', 'proposal', 'confirmed', 'scheduled')
        AND date >= CURRENT_DATE;
    ELSIF NEW.patient_auth_id IS NOT NULL THEN
      SELECT COUNT(*) INTO v_count FROM appointments
      WHERE professional_id  = NEW.professional_id
        AND patient_auth_id  = NEW.patient_auth_id
        AND status IN ('tentative', 'proposal', 'confirmed', 'scheduled')
        AND date >= CURRENT_DATE;
    END IF;
    IF v_count >= v_max THEN
      RAISE EXCEPTION 'Max concurrent bookings reached for this patient (%)', v_max;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_patient_booking_rules ON appointments;
CREATE TRIGGER enforce_patient_booking_rules
  BEFORE INSERT ON appointments
  FOR EACH ROW EXECUTE FUNCTION public.check_patient_booking_rules();

-- ─── SECURITY DEFINER: get_professional_procedures ───────────────────────────
-- Allows authenticated patients (who cannot query the procedures table directly
-- due to RLS) to fetch the active procedures for any professional.
CREATE OR REPLACE FUNCTION public.get_professional_procedures(p_professional_id uuid)
RETURNS TABLE(id uuid, name text, duration_minutes int, price numeric, payment_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, name, duration_minutes, price, payment_type
  FROM procedures
  WHERE professional_id = p_professional_id AND active = true
  ORDER BY name;
$$;

GRANT EXECUTE ON FUNCTION public.get_professional_procedures(uuid) TO authenticated;
