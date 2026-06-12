import { useState } from "react";
import type { Trade } from "@/types";
import { PLAN_COMPLIANCES } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OptionSelector } from "@/components/checkin/OptionSelector";
import { RValueStepper } from "@/components/shared/RValueStepper";
import { MistakeSelector } from "@/components/trades/MistakeSelector";

interface TradeFormProps {
  existingTrade?: Trade | null;
  onSubmit: (trade: Trade) => void;
  onCancel: () => void;
  sessionId: string;
}

export function TradeForm({ existingTrade, onSubmit, onCancel }: TradeFormProps) {
  const [instrument, setInstrument] = useState(existingTrade?.instrument ?? "");
  const [setupName, setSetupName] = useState(existingTrade?.setup_name ?? "");
  const [resultR, setResultR] = useState<number | null>(existingTrade?.result_r ?? null);
  const [planCompliance, setPlanCompliance] = useState<string | null>(existingTrade?.plan_compliance ?? null);
  const [mainMistake, setMainMistake] = useState<string | null>(existingTrade?.main_mistake ?? null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formComplete =
    instrument.trim().length > 0 &&
    setupName.trim().length > 0 &&
    resultR !== null &&
    planCompliance !== null &&
    mainMistake !== null;

  async function handleSubmit() {
    if (!formComplete) return;

    setLoading(true);
    setError(null);

    const body = {
      instrument: instrument.trim(),
      setup_name: setupName.trim(),
      result_r: resultR,
      plan_compliance: planCompliance,
      main_mistake: mainMistake,
    };

    try {
      const url = existingTrade ? `/api/trades/${existingTrade.id}` : "/api/trades";
      const method = existingTrade ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as { trade?: Trade; error?: string };

      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }

      if (data.trade) {
        onSubmit(data.trade);
      }
    } catch {
      setError("Failed to connect to the server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{existingTrade ? "Edit trade" : "Add trade"}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="space-y-2">
            <Label>Instrument</Label>
            <Input
              placeholder="e.g. EURUSD, NQ, SPY"
              value={instrument}
              onChange={(e) => {
                setInstrument(e.target.value);
              }}
            />
          </div>

          <div className="space-y-2">
            <Label>Setup name</Label>
            <Input
              placeholder="e.g. Breakout, Mean reversion"
              value={setupName}
              onChange={(e) => {
                setSetupName(e.target.value);
              }}
            />
          </div>

          <RValueStepper
            name="result_r"
            label="Result"
            value={resultR}
            onChange={setResultR}
            min={-10}
            max={10}
            description="Trade result in R-multiples"
          />

          <OptionSelector
            name="plan_compliance"
            label="Plan compliance"
            options={PLAN_COMPLIANCES}
            value={planCompliance}
            onChange={setPlanCompliance}
          />

          <MistakeSelector value={mainMistake} onChange={setMainMistake} />

          {error && <p className="text-destructive text-sm">{error}</p>}

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onCancel}>
              Cancel
            </Button>
            <Button className="flex-1" disabled={!formComplete || loading} onClick={() => void handleSubmit()}>
              {loading ? "Saving..." : existingTrade ? "Update trade" : "Add trade"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
