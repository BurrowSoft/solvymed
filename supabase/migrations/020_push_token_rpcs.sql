-- Cross-user push token lookups via SECURITY DEFINER RPCs.
-- The push_tokens table RLS only allows users to read their own token, so
-- cross-user notification (patient → professional, professional → patient)
-- fails silently. These RPCs run as the function owner and enforce a
-- relationship check so tokens are never exposed outside valid appointment pairs.

-- Patient calls this to notify their professional.
-- Also usable by a secretary acting on behalf of a professional.
CREATE OR REPLACE FUNCTION get_professional_push_tokens(p_professional_id uuid)
RETURNS TABLE (token text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pt.token
  FROM push_tokens pt
  WHERE pt.user_id = p_professional_id
    AND (
      -- Caller is a patient with a booking with this professional
      EXISTS (
        SELECT 1 FROM appointments a
        WHERE a.professional_id = p_professional_id
          AND a.patient_auth_id = auth.uid()
      )
      OR
      -- Caller is a secretary for this professional
      EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role = 'secretary'
          AND ur.invited_by_professional_id = p_professional_id
      )
    );
$$;

GRANT EXECUTE ON FUNCTION get_professional_push_tokens(uuid) TO authenticated;

-- Professional calls this to notify a patient.
-- Checks that an appointment exists between them (covers tentative/rejected
-- patients who aren't yet in the linked_patient_id chain).
CREATE OR REPLACE FUNCTION get_patient_push_tokens(p_patient_auth_id uuid)
RETURNS TABLE (token text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pt.token
  FROM push_tokens pt
  WHERE pt.user_id = p_patient_auth_id
    AND EXISTS (
      SELECT 1 FROM appointments a
      WHERE a.patient_auth_id = p_patient_auth_id
        AND a.professional_id = auth.uid()
    );
$$;

GRANT EXECUTE ON FUNCTION get_patient_push_tokens(uuid) TO authenticated;
