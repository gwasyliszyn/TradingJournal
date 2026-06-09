import { useState } from "react";
import { SESSION_GOALS } from "@/types";
import type { SessionPlan } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { GoalSelector } from "@/components/plan/GoalSelector";
import { RValueStepper } from "@/components/shared/RValueStepper";

type Mode = "form" | "result";

interface PlanFormProps {
  existingPlan?: { goal: string; max_trades: number; max_daily_loss_r: number } | null;
}

export default function PlanForm({ existingPlan }: PlanFormProps) {
  const hasExisting = !!existingPlan;

  const [mode, setMode] = useState<Mode>(hasExisting ? "result" : "form");
  const [goal, setGoal] = useState<string | null>(existingPlan?.goal ?? null);
  const [maxTrades, setMaxTrades] = useState<number | null>(existingPlan?.max_trades ?? null);
  const [maxDailyLossR, setMaxDailyLossR] = useState<number | null>(existingPlan?.max_daily_loss_r ?? null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedPlan, setSubmittedPlan] = useState<{
    goal: string;
    max_trades: number;
    max_daily_loss_r: number;
  } | null>(existingPlan ?? null);

  const formComplete = goal !== null && goal.trim().length > 0 && maxTrades !== null && maxDailyLossR !== null;

  async function handleSubmit() {
    if (!formComplete) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal,
          max_trades: maxTrades,
          max_daily_loss_r: maxDailyLossR,
        }),
      });

      const data = (await res.json()) as { plan?: SessionPlan; error?: string };

      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }

      if (data.plan) {
        setSubmittedPlan({
          goal: data.plan.goal,
          max_trades: data.plan.max_trades,
          max_daily_loss_r: data.plan.max_daily_loss_r,
        });
      }
      setMode("result");
    } catch {
      setError("Failed to connect to the server");
    } finally {
      setLoading(false);
    }
  }

  function handleEdit() {
    setMode("form");
  }

  return (
    <Card className="mx-auto w-full max-w-lg">
      <CardHeader>
        <CardTitle className="text-xl">{mode === "form" ? "Plan your session" : "Session Plan"}</CardTitle>
      </CardHeader>
      <CardContent>
        {mode === "form" && (
          <div className="space-y-6">
            <GoalSelector value={goal} onChange={setGoal} predefinedOptions={SESSION_GOALS} />

            <div className="space-y-2">
              <Label>Max trades</Label>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={maxTrades !== null && maxTrades <= 1}
                  onClick={() => {
                    setMaxTrades(Math.max(1, (maxTrades ?? 1) - 1));
                  }}
                >
                  −
                </Button>
                <span className="min-w-[3rem] text-center text-lg font-semibold">{maxTrades ?? "—"}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={maxTrades !== null && maxTrades >= 50}
                  onClick={() => {
                    setMaxTrades(Math.min(50, (maxTrades ?? 0) + 1));
                  }}
                >
                  +
                </Button>
              </div>
              <p className="text-muted-foreground text-sm">Between 1 and 50</p>
            </div>

            <RValueStepper
              name="max_daily_loss_r"
              label="Max daily loss"
              value={maxDailyLossR}
              onChange={setMaxDailyLossR}
              min={0.25}
              max={20}
              description="Maximum loss you're willing to take today"
            />

            {error && <p className="text-destructive text-sm">{error}</p>}

            <Button className="w-full" disabled={!formComplete || loading} onClick={() => void handleSubmit()}>
              {loading ? "Saving..." : "Save plan"}
            </Button>
          </div>
        )}

        {mode === "result" && submittedPlan && (
          <div className="flex flex-col items-center gap-6 py-8">
            <div className="w-full space-y-4">
              <div className="text-center">
                <p className="text-muted-foreground text-sm font-medium">Goal</p>
                <p className="text-lg font-semibold">{submittedPlan.goal}</p>
              </div>
              <div className="flex justify-center gap-8">
                <div className="text-center">
                  <p className="text-muted-foreground text-sm font-medium">Max trades</p>
                  <p className="text-2xl font-bold">{submittedPlan.max_trades}</p>
                </div>
                <div className="text-center">
                  <p className="text-muted-foreground text-sm font-medium">Max daily loss</p>
                  <p className="text-2xl font-bold">{submittedPlan.max_daily_loss_r.toFixed(2)} R</p>
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleEdit}>
                Edit plan
              </Button>
              <Button asChild>
                <a href="/trades">Continue to trades</a>
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
