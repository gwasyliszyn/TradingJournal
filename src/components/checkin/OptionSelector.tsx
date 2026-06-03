import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface OptionSelectorProps {
  name: string;
  label: string;
  options: readonly string[];
  value: string | null;
  onChange: (value: string) => void;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function OptionSelector({ name, label, options, value, onChange }: OptionSelectorProps) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div role="group" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={option}
            type="button"
            variant={value === option ? "default" : "outline"}
            size="sm"
            data-name={name}
            aria-pressed={value === option}
            onClick={() => {
              onChange(option);
            }}
          >
            {capitalize(option)}
          </Button>
        ))}
      </div>
    </div>
  );
}
