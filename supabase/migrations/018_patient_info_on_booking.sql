-- ─── Shared patient profile ───────────────────────────────────────────────────
-- One row per patient auth user. Not tied to any specific professional.
-- Collected at booking time; visible to any professional who has an appointment
-- with that patient.
CREATE TABLE IF NOT EXISTS public.patient_profiles (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   text NOT NULL DEFAULT '',
  email       text,
  phone       text,
  birth_date  date,
  cpf         text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.patient_profiles ENABLE ROW LEVEL SECURITY;

-- Patient can read and write their own profile.
CREATE POLICY "patient_profiles_own" ON public.patient_profiles
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Professionals can read profiles for patients who have booked with them.
CREATE POLICY "patient_profiles_professional_read" ON public.patient_profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.appointments
      WHERE appointments.patient_auth_id = patient_profiles.user_id
        AND appointments.professional_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_patient_profiles_user ON public.patient_profiles(user_id);
