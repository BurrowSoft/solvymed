-- SECURITY DEFINER functions so patients can accept/decline proposals
-- without needing a broad UPDATE policy on the appointments table.

CREATE OR REPLACE FUNCTION accept_appointment_proposal(p_appointment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE appointments
  SET status            = 'confirmed',
      date              = proposed_date,
      start_time        = proposed_start_time,
      end_time          = proposed_end_time,
      proposed_date     = NULL,
      proposed_start_time = NULL,
      proposed_end_time   = NULL
  WHERE id              = p_appointment_id
    AND patient_auth_id = auth.uid()
    AND status          = 'proposal';
END;
$$;
GRANT EXECUTE ON FUNCTION accept_appointment_proposal(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION decline_appointment_proposal(p_appointment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE appointments
  SET status              = 'cancelled',
      proposed_date       = NULL,
      proposed_start_time = NULL,
      proposed_end_time   = NULL
  WHERE id              = p_appointment_id
    AND patient_auth_id = auth.uid()
    AND status          = 'proposal';
END;
$$;
GRANT EXECUTE ON FUNCTION decline_appointment_proposal(uuid) TO authenticated;
