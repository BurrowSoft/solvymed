-- Guard handle_new_user so patients never get a professionals row.
-- Patients use the mobile app; they don't need (and shouldn't see) the clinic dashboard.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  -- Only create a professionals row for professional/secretary roles (or unspecified).
  -- Explicit patients are skipped — the mobile discovery flow doesn't need it,
  -- and it prevents patients from landing on the professional dashboard.
  IF COALESCE(new.raw_user_meta_data->>'role', 'professional') != 'patient' THEN
    INSERT INTO public.professionals (id, email, full_name)
    VALUES (
      new.id,
      new.email,
      COALESCE(
        new.raw_user_meta_data->>'full_name',
        split_part(new.email, '@', 1)
      )
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Backfill user_roles for patients whose signup callback failed ─────────────
-- These users signed up as patients but the callback route previously redirected
-- to root, so their user_roles row was never created. We detect them by their
-- raw_user_meta_data and create the missing records now.
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'patient'
FROM auth.users
WHERE raw_user_meta_data->>'role' = 'patient'
ON CONFLICT (user_id) DO NOTHING;

-- ─── Remove stray professionals rows for patient users ────────────────────────
-- Covers two cases:
--   1. Users who now have a user_roles record (either pre-existing or from the
--      backfill above).
--   2. Users tagged as patients in auth.users metadata but with no user_roles row
--      (i.e. the backfill hit a conflict because the row already existed for
--      some other reason). We use the auth.users metadata as the source of truth.
--
-- We do NOT remove rows for users who also hold a non-patient role (e.g. a doctor
-- who is also a patient of another clinic on the platform).
DELETE FROM public.professionals
WHERE id IN (
  SELECT id FROM auth.users WHERE raw_user_meta_data->>'role' = 'patient'
)
AND id NOT IN (
  SELECT user_id FROM public.user_roles WHERE role != 'patient'
);
