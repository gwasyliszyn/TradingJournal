import { useState } from "react";
import type { ProcessScoreResult } from "@/types";
import { PLAN_COMPLIANCES, SESSION_GOALS } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { OptionSelector } from "@/components/checkin/OptionSelector";
import { GoalSelector } from "@/components/plan/GoalSelector";
import { ProcessScoreDisplay } from "@/components/review/ProcessScoreDisplay";

type Mode = "form" | "result";

interface ReviewFormProps {
  existingReview?: {
    plan_adherence: string;
    what_went_wrong: string;
    rule_broken: boolean;
    goal_next_session: string;
    process_score: number;
  } | null;
  existingScoreResult?: ProcessScoreResult | null;
}

export default function ReviewForm({ existingReview, existingScoreResult }: ReviewFormProps) {
  const hasExisting = !!existingReview;

  const [mode, setMode] = useState<Mode>(hasExisting ? "result" : "form");
  const [planAdherence, setPlanAdherence] = useState<string | null>(existingReview?.plan_adherence ?? null);
  const [whatWentWrong, setWhatWentWrong] = useState(existingReview?.what_went_wrong ?? "");
  const [ruleBroken, setRuleBroken] = useState<boolean | null>(existingReview?.rule_broken ?? null);
  const [goalNextSession, setGoalNextSession] = useState<string | null>(existingReview?.goal_next_session ?? null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scoreResult, setScoreResult] = useState<ProcessScoreResult | null>(existingScoreResult ?? null);

  const formComplete =
    planAdherence !== null && ruleBroken !== null && goalNextSession !== null && goalNextSession.trim().length > 0;

  async function handleSubmit() {
    if (!formComplete) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_adherence: planAdherence,
          what_went_wrong: whatWentWrong,
          rule_broken: ruleBroken,
          goal_next_session: goalNextSession,
        }),
      });

      const data = (await res.json()) as { process_score_result?: ProcessScoreResult; error?: string };

      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }

      if (data.process_score_result) {
        setScoreResult(data.process_score_result);
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
        <CardTitle className="text-xl">{mode === "form" ? "Review your session" : "Your Process Score"}</CardTitle>
      </CardHeader>
      <CardContent>
        {mode === "form" && (
          <div className="space-y-6">
            <OptionSelector
              name="plan_adherence"
              label="Did you follow your plan?"
              options={PLAN_COMPLIANCES}
              value={planAdherence}
              onChange={setPlanAdherence}
            />

            <div className="space-y-2">
              <Label>What went wrong?</Label>
              <Textarea
                placeholder="Describe any mistakes or issues (optional)"
                value={whatWentWrong}
                onChange={(e) => {
                  setWhatWentWrong(e.target.value);
                }}
              />
            </div>

            <div className="space-y-2">
              <Label>Did you break a critical rule?</Label>
              <div role="group" aria-label="Rule broken" className="flex gap-2">
                <Button
                  type="button"
                  variant={ruleBroken === false ? "default" : "outline"}
                  size="sm"
                  aria-pressed={ruleBroken === false}
                  onClick={() => {
                    setRuleBroken(false);
                  }}
                >
                  No
                </Button>
                <Button
                  type="button"
                  variant={ruleBroken === true ? "default" : "outline"}
                  size="sm"
                  aria-pressed={ruleBroken === true}
                  onClick={() => {
                    setRuleBroken(true);
                  }}
                >
                  Yes
                </Button>
              </div>
            </div>

            <GoalSelector value={goalNextSession} onChange={setGoalNextSession} predefinedOptions={SESSION_GOALS} />

            {error && <p className="text-destructive text-sm">{error}</p>}

            <Button className="w-full" disabled={!formComplete || loading} onClick={() => void handleSubmit()}>
              {loading ? "Submitting..." : "Submit review"}
            </Button>
          </div>
        )}

        {mode === "result" && scoreResult && <ProcessScoreDisplay result={scoreResult} onEdit={handleEdit} />}
      </CardContent>
    </Card>
  );
}
