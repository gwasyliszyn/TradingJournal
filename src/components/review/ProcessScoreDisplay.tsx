import type { ProcessScoreResult } from "@/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ProcessScoreDisplayProps {
  result: ProcessScoreResult;
  onEdit: () => void;
}

export function ProcessScoreDisplay({ result, onEdit }: ProcessScoreDisplayProps) {
  return (
    <div className="flex flex-col items-center gap-6 py-8">
      <div className="text-center">
        <p className="text-muted-foreground text-sm font-medium">Process Score</p>
        <p className="text-6xl font-bold tracking-tight">{result.score}</p>
      </div>
      <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${result.band.colorClass}`}>
        {result.band.label}
      </span>

      <div className="w-full space-y-2">
        {result.components.map((component) => (
          <div key={component.label} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className={cn(component.earned ? "text-green-600" : "text-red-500")}>
                {component.earned ? "✓" : "✗"}
              </span>
              <span>{component.label}</span>
            </div>
            <span className={cn("font-mono text-xs", component.earned ? "text-green-600" : "text-muted-foreground")}>
              +{component.points}/{component.maxPoints}
            </span>
          </div>
        ))}
        <div className="border-t pt-2">
          <div className="flex items-center justify-between text-sm font-semibold">
            <span>Total</span>
            <span className="font-mono">{result.score}/100</span>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onEdit}>
          Edit review
        </Button>
        <Button asChild>
          <a href="/dashboard">Back to dashboard</a>
        </Button>
      </div>
    </div>
  );
}
