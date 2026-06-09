-- Session plans table: one per session (upsert on session_id)
CREATE TABLE session_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions ON DELETE CASCADE UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  goal text NOT NULL,
  max_trades smallint NOT NULL CHECK (max_trades BETWEEN 1 AND 50),
  max_daily_loss_r numeric(5,2) NOT NULL CHECK (max_daily_loss_r > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE session_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own session_plans"
  ON session_plans FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own session_plans"
  ON session_plans FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own session_plans"
  ON session_plans FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own session_plans"
  ON session_plans FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER session_plans_updated_at
  BEFORE UPDATE ON session_plans
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Trades table: many per session
CREATE TABLE trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  instrument text NOT NULL,
  setup_name text NOT NULL,
  result_r numeric(5,2) NOT NULL,
  plan_compliance text NOT NULL CHECK (plan_compliance IN ('yes', 'no', 'partial')),
  main_mistake text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own trades"
  ON trades FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trades"
  ON trades FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own trades"
  ON trades FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own trades"
  ON trades FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER trades_updated_at
  BEFORE UPDATE ON trades
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE INDEX trades_session_id_idx ON trades (session_id);
