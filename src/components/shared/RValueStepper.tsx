import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface RValueStepperProps {
  name: string;
  label: string;
  value: number | null;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  description?: string;
}

function round(n: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}

export function RValueStepper({
  name,
  label,
  value,
  onChange,
  min,
  max,
  step = 0.25,
  description,
}: RValueStepperProps) {
  const current = value ?? min;
  const atMin = current <= min;
  const atMax = current >= max;

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div role="group" aria-label={label} className="flex items-center gap-3" data-name={name}>
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={atMin}
          aria-label="Decrease"
          onClick={() => {
            onChange(round(Math.max(min, current - step), 2));
          }}
        >
          −
        </Button>
        <span
          className="min-w-[5rem] text-center text-lg font-semibold"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={current}
        >
          {current.toFixed(2)} R
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={atMax}
          aria-label="Increase"
          onClick={() => {
            onChange(round(Math.min(max, current + step), 2));
          }}
        >
          +
        </Button>
      </div>
      {description && <p className="text-muted-foreground text-sm">{description}</p>}
    </div>
  );
}
