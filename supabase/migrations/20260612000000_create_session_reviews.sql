-- Session reviews table: one per session (upsert on session_id)
CREATE TABLE session_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions ON DELETE CASCADE UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  plan_adherence text NOT NULL CHECK (plan_adherence IN ('yes', 'no', 'partial')),
  what_went_wrong text NOT NULL DEFAULT '',
  rule_broken boolean NOT NULL,
  goal_next_session text NOT NULL,
  process_score smallint NOT NULL CHECK (process_score BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE session_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own session_reviews"
  ON session_reviews FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own session_reviews"
  ON session_reviews FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own session_reviews"
  ON session_reviews FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own session_reviews"
  ON session_reviews FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER session_reviews_updated_at
  BEFORE UPDATE ON session_reviews
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
