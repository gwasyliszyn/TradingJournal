export interface Session {
  id: string;
  user_id: string;
  session_date: string;
  status: "active" | "complete" | "incomplete";
  created_at: string;
  updated_at: string;
}

export interface CheckIn {
  id: string;
  session_id: string;
  user_id: string;
  sleep: number;
  energy: number;
  stress: number;
  focus: number;
  emotion: string;
  market_bias: string;
  risk_mode: string;
  readiness_score: number;
  created_at: string;
  updated_at: string;
}

export interface CheckInFormData {
  sleep: number;
  energy: number;
  stress: number;
  focus: number;
  emotion: string;
  market_bias: string;
  risk_mode: string;
}

export const EMOTIONS = ["confident", "calm", "anxious", "fearful", "excited", "frustrated", "greedy"] as const;

export const MARKET_BIASES = ["bullish", "bearish", "neutral"] as const;

export const RISK_MODES = ["normal", "reduced", "no-trade"] as const;

export interface ScoreBand {
  label: string;
  colorClass: string;
}
