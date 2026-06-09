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

export interface SessionPlan {
  id: string;
  session_id: string;
  user_id: string;
  goal: string;
  max_trades: number;
  max_daily_loss_r: number;
  created_at: string;
  updated_at: string;
}

export interface Trade {
  id: string;
  session_id: string;
  user_id: string;
  instrument: string;
  setup_name: string;
  result_r: number;
  plan_compliance: string;
  main_mistake: string;
  created_at: string;
  updated_at: string;
}

export interface PlanFormData {
  goal: string;
  max_trades: number;
  max_daily_loss_r: number;
}

export interface TradeFormData {
  instrument: string;
  setup_name: string;
  result_r: number;
  plan_compliance: string;
  main_mistake: string;
}

export const SESSION_GOALS = [
  "Follow the plan",
  "Practice patience",
  "Stick to stop losses",
  "Only A+ setups",
  "Reduce position size",
] as const;

export const TRADING_MISTAKES = [
  "No mistake",
  "Oversized position",
  "Chased entry",
  "Moved stop loss",
  "Revenge trade",
  "Broke risk rules",
  "FOMO entry",
] as const;

export const PLAN_COMPLIANCES = ["yes", "no", "partial"] as const;
