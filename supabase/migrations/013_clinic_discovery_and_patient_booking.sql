-- ─── clinics ─────────────────────────────────────────────────────────────────
CREATE TABLE public.clinics (
  id          uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid  NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  name        text      NOT NULL,
  address     text,
  city        text,
  state       text,
  country     text      NOT NULL DEFAULT 'BR',
  phone       text,
  lat         numeric(10,7),
  lng         numeric(10,7),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;

-- Owner can do everything; everyone can read (discovery)
CREATE POLICY "clinics_owner_all" ON public.clinics
  USING (professional_id = auth.uid());

CREATE POLICY "clinics_public_read" ON public.clinics
  FOR SELECT USING (true);

-- ─── clinic_professionals ────────────────────────────────────────────────────
CREATE TABLE public.clinic_professionals (
  id              uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid  NOT NULL REFERENCES public.clinics(id)       ON DELETE CASCADE,
  professional_id uuid  NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, professional_id)
);

ALTER TABLE public.clinic_professionals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinic_prof_owner_all" ON public.clinic_professionals
  USING (professional_id = auth.uid());

CREATE POLICY "clinic_prof_public_read" ON public.clinic_professionals
  FOR SELECT USING (true);

-- ─── professionals: public_invite_code ───────────────────────────────────────
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS public_invite_code text UNIQUE;

-- ─── appointments: extend status + booking columns ───────────────────────────
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_status_check;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_status_check
  CHECK (status IN (
    'scheduled','confirmed','completed','cancelled','blocked',
    'late','absent','tentative','rejected','proposal'
  ));

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS proposed_date       date,
  ADD COLUMN IF NOT EXISTS proposed_start_time time,
  ADD COLUMN IF NOT EXISTS proposed_end_time   time,
  ADD COLUMN IF NOT EXISTS patient_auth_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- RLS: patients can read/cancel their own public bookings
CREATE POLICY "appointments_patient_auth_read" ON public.appointments
  FOR SELECT USING (patient_auth_id = auth.uid());

CREATE POLICY "appointments_patient_auth_cancel" ON public.appointments
  FOR UPDATE USING (
    patient_auth_id = auth.uid()
    AND status IN ('tentative','proposal')
  )
  WITH CHECK (status = 'cancelled');

-- ─── user_roles: invited_by_professional_id ──────────────────────────────────
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS invited_by_professional_id uuid
    REFERENCES public.professionals(id) ON DELETE SET NULL;

-- ─── SECURITY DEFINER: professional_by_invite_code ───────────────────────────
CREATE OR REPLACE FUNCTION public.professional_by_invite_code(code text)
RETURNS TABLE(professional_id uuid, professional_name text, professional_specialty text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT id, full_name, specialty
    FROM professionals
    WHERE public_invite_code = UPPER(TRIM(code))
    LIMIT 1;
END;
$$;

-- ─── SECURITY DEFINER: create_public_booking ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_public_booking(
  p_professional_id    uuid,
  p_patient_auth_id    uuid,
  p_patient_name       text,
  p_date               date,
  p_start_time         time,
  p_end_time           time,
  p_duration_minutes   int,
  p_consultation_type  text,
  p_payment_type       text DEFAULT 'private',
  p_notes              text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_id uuid;
BEGIN
  IF p_patient_auth_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF EXISTS (
    SELECT 1 FROM appointments
    WHERE professional_id = p_professional_id
      AND date            = p_date
      AND status NOT IN  ('cancelled', 'rejected')
      AND start_time      < p_end_time
      AND end_time        > p_start_time
  ) THEN
    RAISE EXCEPTION 'slot_taken';
  END IF;

  INSERT INTO appointments (
    professional_id, patient_auth_id, patient_name,
    date, start_time, end_time, duration_minutes,
    type, consultation_type, payment_type, payment_status, status, notes
  ) VALUES (
    p_professional_id, p_patient_auth_id, p_patient_name,
    p_date, p_start_time, p_end_time, p_duration_minutes,
    'in-person', p_consultation_type, p_payment_type, 'pending', 'tentative',
    p_notes
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

-- ─── SECURITY DEFINER: get_busy_slots ────────────────────────────────────────
-- Returns busy (start,end) pairs for a day without exposing patient names.
CREATE OR REPLACE FUNCTION public.get_busy_slots(
  p_professional_id uuid,
  p_date            date
)
RETURNS TABLE(slot_start time, slot_end time)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT start_time, end_time
    FROM appointments
    WHERE professional_id = p_professional_id
      AND date            = p_date
      AND status NOT IN  ('cancelled', 'rejected');
END;
$$;

-- ─── indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_clinics_professional      ON public.clinics(professional_id);
CREATE INDEX IF NOT EXISTS idx_clinic_prof_clinic        ON public.clinic_professionals(clinic_id);
CREATE INDEX IF NOT EXISTS idx_clinic_prof_professional  ON public.clinic_professionals(professional_id);
CREATE INDEX IF NOT EXISTS idx_appointments_patient_auth ON public.appointments(patient_auth_id);
CREATE INDEX IF NOT EXISTS idx_professionals_pub_invite  ON public.professionals(public_invite_code);
