-- User roles (professional | patient) + patient linking
CREATE TABLE IF NOT EXISTS user_roles (
  user_id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role             text NOT NULL DEFAULT 'professional',
  linked_patient_id uuid REFERENCES patients(id),
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_roles: own read"
  ON user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user_roles: own insert"
  ON user_roles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_roles: own update"
  ON user_roles FOR UPDATE
  USING (auth.uid() = user_id);

-- Push notification tokens
CREATE TABLE IF NOT EXISTS push_tokens (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  token      text NOT NULL,
  platform   text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

-- Users manage their own token
CREATE POLICY "push_tokens: own"
  ON push_tokens FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Doctors can read tokens of their linked patients
CREATE POLICY "push_tokens: doctor reads patient tokens"
  ON push_tokens FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN patients p ON p.id = ur.linked_patient_id
      WHERE ur.user_id = push_tokens.user_id
        AND p.professional_id = auth.uid()
    )
  );
