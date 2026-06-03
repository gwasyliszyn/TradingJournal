import type { ScoreBand } from "@/types";

export function calculateReadinessScore(sleep: number, energy: number, stress: number, focus: number): number {
  const avg = (sleep + energy + focus + (6 - stress)) / 4;
  return Math.round(((avg - 1) / 4) * 100);
}

export function getScoreBand(score: number): ScoreBand {
  if (score >= 80) return { label: "Good", colorClass: "text-green-600 bg-green-100" };
  if (score >= 60) return { label: "Cautious", colorClass: "text-yellow-600 bg-yellow-100" };
  if (score >= 40) return { label: "Reduced risk", colorClass: "text-orange-600 bg-orange-100" };
  return { label: "No-trade recommended", colorClass: "text-red-600 bg-red-100" };
}
