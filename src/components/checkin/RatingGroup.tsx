import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface RatingGroupProps {
  name: string;
  label: string;
  value: number | null;
  onChange: (value: number) => void;
  description?: string;
}

export function RatingGroup({ name, label, value, onChange, description }: RatingGroupProps) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div role="group" aria-label={label} className="flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <Button
            key={n}
            type="button"
            variant={value === n ? "default" : "outline"}
            size="lg"
            className="w-12"
            aria-pressed={value === n}
            data-name={name}
            onClick={() => {
              onChange(n);
            }}
          >
            {n}
          </Button>
        ))}
      </div>
      {description && <p className="text-muted-foreground text-sm">{description}</p>}
    </div>
  );
}
