import type { ScoreBand, Trade, ScoreComponent, ProcessScoreResult } from "@/types";

interface ProcessScoreInput {
  checkinExists: boolean;
  planExists: boolean;
  trades: Trade[];
  maxDailyLossR: number | null;
  ruleBroken: boolean;
}

export function calculateProcessScore(input: ProcessScoreInput): ProcessScoreResult {
  const { checkinExists, planExists, trades, maxDailyLossR, ruleBroken } = input;
  const hasTrades = trades.length > 0;

  const checkinComponent: ScoreComponent = {
    label: "Check-in completed",
    earned: checkinExists,
    points: checkinExists ? 15 : 0,
    maxPoints: 15,
  };

  const planComponent: ScoreComponent = {
    label: "Session plan recorded",
    earned: planExists,
    points: planExists ? 15 : 0,
    maxPoints: 15,
  };

  let dailyLossEarned = false;
  if (planExists && hasTrades && maxDailyLossR !== null) {
    const totalLoss = trades.filter((t) => t.result_r < 0).reduce((sum, t) => sum + Math.abs(t.result_r), 0);
    dailyLossEarned = totalLoss <= maxDailyLossR;
  }
  const dailyLossComponent: ScoreComponent = {
    label: "Daily loss within limit",
    earned: dailyLossEarned,
    points: dailyLossEarned ? 20 : 0,
    maxPoints: 20,
  };

  let complianceEarned = false;
  if (hasTrades) {
    const compliantCount = trades.filter((t) => t.plan_compliance === "yes").length;
    complianceEarned = compliantCount / trades.length > 0.5;
  }
  const complianceComponent: ScoreComponent = {
    label: "Majority of trades plan-compliant",
    earned: complianceEarned,
    points: complianceEarned ? 20 : 0,
    maxPoints: 20,
  };

  const ruleComponent: ScoreComponent = {
    label: "No critical rule broken",
    earned: !ruleBroken,
    points: !ruleBroken ? 20 : 0,
    maxPoints: 20,
  };

  const reviewComponent: ScoreComponent = {
    label: "Post-session review completed",
    earned: true,
    points: 10,
    maxPoints: 10,
  };

  const components = [
    checkinComponent,
    planComponent,
    dailyLossComponent,
    complianceComponent,
    ruleComponent,
    reviewComponent,
  ];

  const score = components.reduce((sum, c) => sum + c.points, 0);

  return { score, components, band: getProcessScoreBand(score) };
}

export function getProcessScoreBand(score: number): ScoreBand {
  if (score >= 80) return { label: "Great process", colorClass: "text-green-600 bg-green-100" };
  if (score >= 60) return { label: "Needs improvement", colorClass: "text-yellow-600 bg-yellow-100" };
  if (score >= 40) return { label: "Poor process", colorClass: "text-orange-600 bg-orange-100" };
  return { label: "Critical", colorClass: "text-red-600 bg-red-100" };
}
