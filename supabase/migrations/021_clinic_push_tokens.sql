-- Returns push tokens for a professional AND all secretaries linked to them.
-- Callers must have a booking with that professional, be the professional, or be a linked secretary.
CREATE OR REPLACE FUNCTION get_clinic_push_tokens(p_professional_id uuid)
RETURNS TABLE (token text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT pt.token
  FROM push_tokens pt
  WHERE (
    -- Token belongs to the professional themselves
    pt.user_id = p_professional_id
    OR
    -- Token belongs to a secretary linked to this professional
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = pt.user_id
        AND ur.role = 'secretary'
        AND ur.invited_by_professional_id = p_professional_id
    )
  )
  AND (
    -- Caller is the professional
    auth.uid() = p_professional_id
    OR
    -- Caller is a patient with a booking with this professional
    EXISTS (
      SELECT 1 FROM appointments a
      WHERE a.professional_id = p_professional_id
        AND a.patient_auth_id = auth.uid()
    )
    OR
    -- Caller is a secretary linked to this professional
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'secretary'
        AND ur.invited_by_professional_id = p_professional_id
    )
  );
$$;

GRANT EXECUTE ON FUNCTION get_clinic_push_tokens(uuid) TO authenticated;
