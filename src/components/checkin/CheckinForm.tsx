import { useState } from "react";
import type { CheckInFormData, ScoreBand } from "@/types";
import { EMOTIONS, MARKET_BIASES, RISK_MODES } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RatingGroup } from "@/components/checkin/RatingGroup";
import { OptionSelector } from "@/components/checkin/OptionSelector";
import { ScoreDisplay } from "@/components/checkin/ScoreDisplay";
import { getScoreBand } from "@/lib/services/readiness-score";

type Section = "physical" | "mental" | "result";

type ExistingCheckinData = CheckInFormData & { readiness_score: number };

interface CheckinFormProps {
  existingCheckin?: ExistingCheckinData | null;
}

export default function CheckinForm({ existingCheckin }: CheckinFormProps) {
  const hasExisting = !!existingCheckin;

  const [section, setSection] = useState<Section>(hasExisting ? "result" : "physical");
  const [sleep, setSleep] = useState<number | null>(existingCheckin?.sleep ?? null);
  const [energy, setEnergy] = useState<number | null>(existingCheckin?.energy ?? null);
  const [stress, setStress] = useState<number | null>(existingCheckin?.stress ?? null);
  const [focus, setFocus] = useState<number | null>(existingCheckin?.focus ?? null);
  const [emotion, setEmotion] = useState<string | null>(existingCheckin?.emotion ?? null);
  const [marketBias, setMarketBias] = useState<string | null>(existingCheckin?.market_bias ?? null);
  const [riskMode, setRiskMode] = useState<string | null>(existingCheckin?.risk_mode ?? null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultScore, setResultScore] = useState<number | null>(existingCheckin?.readiness_score ?? null);
  const [resultBand, setResultBand] = useState<ScoreBand | null>(
    existingCheckin ? getScoreBand(existingCheckin.readiness_score) : null,
  );

  const physicalComplete = sleep !== null && energy !== null && stress !== null && focus !== null;
  const mentalComplete = emotion !== null && marketBias !== null && riskMode !== null;

  async function handleSubmit() {
    if (!physicalComplete || !mentalComplete) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sleep,
          energy,
          stress,
          focus,
          emotion,
          market_bias: marketBias,
          risk_mode: riskMode,
        }),
      });

      const data = (await res.json()) as { readiness_score?: number; score_band?: ScoreBand; error?: string };

      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }

      setResultScore(data.readiness_score ?? 0);
      setResultBand(data.score_band ?? null);
      setSection("result");
    } catch {
      setError("Failed to connect to the server");
    } finally {
      setLoading(false);
    }
  }

  function handleEdit() {
    setSection("physical");
  }

  return (
    <Card className="mx-auto w-full max-w-lg">
      <CardHeader>
        <CardTitle className="text-xl">
          {section === "physical" && "Physical State"}
          {section === "mental" && "Mental State"}
          {section === "result" && "Your Readiness"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {section === "physical" && (
          <div className="space-y-6">
            <RatingGroup
              name="sleep"
              label="Sleep quality"
              value={sleep}
              onChange={setSleep}
              description="1 = poor, 5 = excellent"
            />
            <RatingGroup
              name="energy"
              label="Energy level"
              value={energy}
              onChange={setEnergy}
              description="1 = exhausted, 5 = peak"
            />
            <RatingGroup
              name="stress"
              label="Stress level"
              value={stress}
              onChange={setStress}
              description="1 = calm, 5 = overwhelmed"
            />
            <RatingGroup
              name="focus"
              label="Focus"
              value={focus}
              onChange={setFocus}
              description="1 = scattered, 5 = laser-focused"
            />
            <Button
              className="w-full"
              disabled={!physicalComplete}
              onClick={() => {
                setSection("mental");
              }}
            >
              Next
            </Button>
          </div>
        )}

        {section === "mental" && (
          <div className="space-y-6">
            <OptionSelector
              name="emotion"
              label="Current emotion"
              options={EMOTIONS}
              value={emotion}
              onChange={setEmotion}
            />
            <OptionSelector
              name="market_bias"
              label="Market bias"
              options={MARKET_BIASES}
              value={marketBias}
              onChange={setMarketBias}
            />
            <OptionSelector
              name="risk_mode"
              label="Risk mode"
              options={RISK_MODES}
              value={riskMode}
              onChange={setRiskMode}
            />
            {error && <p className="text-destructive text-sm">{error}</p>}
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setSection("physical");
                }}
              >
                Back
              </Button>
              <Button className="flex-1" disabled={!mentalComplete || loading} onClick={() => void handleSubmit()}>
                {loading ? "Submitting..." : "Submit"}
              </Button>
            </div>
          </div>
        )}

        {section === "result" && resultScore !== null && resultBand !== null && (
          <ScoreDisplay score={resultScore} band={resultBand} onEdit={handleEdit} />
        )}
      </CardContent>
    </Card>
  );
}
