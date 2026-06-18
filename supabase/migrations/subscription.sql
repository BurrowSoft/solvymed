-- ============================================================
-- SolvyMed subscription system migration
-- Run in Supabase SQL editor
-- ============================================================

-- 1. Add subscription columns to professionals
ALTER TABLE professionals
  ADD COLUMN IF NOT EXISTS trial_ends_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_status  TEXT NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS subscription_provider TEXT,
  ADD COLUMN IF NOT EXISTS subscription_id      TEXT,
  ADD COLUMN IF NOT EXISTS current_period_end   TIMESTAMPTZ;

-- 2. Backfill existing professionals with a 30-day grace period
UPDATE professionals
SET trial_ends_at = NOW() + INTERVAL '30 days'
WHERE trial_ends_at IS NULL;

-- 3. Trigger: auto-set 15-day trial for new professionals
CREATE OR REPLACE FUNCTION _set_professional_trial()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.trial_ends_at IS NULL THEN
    NEW.trial_ends_at := NOW() + INTERVAL '15 days';
  END IF;
  IF NEW.subscription_status IS NULL THEN
    NEW.subscription_status := 'trial';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_professional_trial ON professionals;
CREATE TRIGGER trg_professional_trial
  BEFORE INSERT ON professionals
  FOR EACH ROW EXECUTE FUNCTION _set_professional_trial();

-- 4. RPC: get_effective_subscription
--    Doctors → own subscription
--    Secretaries → linked doctor's subscription
CREATE OR REPLACE FUNCTION get_effective_subscription(p_user_id UUID)
RETURNS TABLE (
  subscription_status   TEXT,
  trial_ends_at         TIMESTAMPTZ,
  current_period_end    TIMESTAMPTZ,
  subscription_provider TEXT,
  subscription_id       TEXT
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_role TEXT;
  v_linked_id UUID;
BEGIN
  SELECT role, invited_by_professional_id
    INTO v_role, v_linked_id
  FROM user_roles
  WHERE user_id = p_user_id
  LIMIT 1;

  IF v_role = 'secretary' AND v_linked_id IS NOT NULL THEN
    RETURN QUERY
    SELECT p.subscription_status, p.trial_ends_at, p.current_period_end,
           p.subscription_provider, p.subscription_id
    FROM professionals p WHERE p.id = v_linked_id;
  ELSE
    RETURN QUERY
    SELECT p.subscription_status, p.trial_ends_at, p.current_period_end,
           p.subscription_provider, p.subscription_id
    FROM professionals p WHERE p.id = p_user_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION get_effective_subscription(UUID) TO authenticated;
