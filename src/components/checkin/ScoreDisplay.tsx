import type { ScoreBand } from "@/types";
import { Button } from "@/components/ui/button";

interface ScoreDisplayProps {
  score: number;
  band: ScoreBand;
  onEdit: () => void;
}

const BAND_GUIDANCE: Record<string, string> = {
  Good: "You're ready to trade",
  Cautious: "Trade with extra discipline",
  "Reduced risk": "Consider reducing position sizes",
  "No-trade recommended": "Take a break from trading today",
};

export function ScoreDisplay({ score, band, onEdit }: ScoreDisplayProps) {
  return (
    <div className="flex flex-col items-center gap-6 py-8">
      <div className="text-center">
        <p className="text-muted-foreground text-sm font-medium">Readiness Score</p>
        <p className="text-6xl font-bold tracking-tight">{score}</p>
      </div>
      <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${band.colorClass}`}>
        {band.label}
      </span>
      <p className="text-muted-foreground">{BAND_GUIDANCE[band.label] ?? band.label}</p>
      <div className="flex gap-3">
        <Button variant="outline" onClick={onEdit}>
          Edit check-in
        </Button>
        <Button asChild>
          <a href="/plan">Continue to plan</a>
        </Button>
      </div>
    </div>
  );
}
