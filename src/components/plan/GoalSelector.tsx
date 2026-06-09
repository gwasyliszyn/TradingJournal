import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface GoalSelectorProps {
  value: string | null;
  onChange: (value: string) => void;
  predefinedOptions: readonly string[];
}

export function GoalSelector({ value, onChange, predefinedOptions }: GoalSelectorProps) {
  const isPredefined = value !== null && predefinedOptions.includes(value);
  const isInitiallyCustom = value !== null && !isPredefined && value.length > 0;
  const [isCustom, setIsCustom] = useState(isInitiallyCustom);
  const [customText, setCustomText] = useState(isInitiallyCustom && value ? value : "");

  return (
    <div className="space-y-2">
      <Label>Goal</Label>
      <div role="group" aria-label="Goal" className="flex flex-wrap gap-2">
        {predefinedOptions.map((option) => (
          <Button
            key={option}
            type="button"
            variant={value === option && !isCustom ? "default" : "outline"}
            size="sm"
            aria-pressed={value === option && !isCustom}
            onClick={() => {
              setIsCustom(false);
              setCustomText("");
              onChange(option);
            }}
          >
            {option}
          </Button>
        ))}
        <Button
          type="button"
          variant={isCustom ? "default" : "outline"}
          size="sm"
          aria-pressed={isCustom}
          onClick={() => {
            setIsCustom(true);
            if (customText) {
              onChange(customText);
            }
          }}
        >
          Custom
        </Button>
      </div>
      {isCustom && (
        <Input
          placeholder="Enter your goal..."
          value={customText}
          onChange={(e) => {
            setCustomText(e.target.value);
            if (e.target.value.trim()) {
              onChange(e.target.value.trim());
            }
          }}
        />
      )}
    </div>
  );
}
