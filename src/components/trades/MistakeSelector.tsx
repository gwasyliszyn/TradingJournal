import { useState } from "react";
import { TRADING_MISTAKES } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface MistakeSelectorProps {
  value: string | null;
  onChange: (value: string) => void;
}

export function MistakeSelector({ value, onChange }: MistakeSelectorProps) {
  const isPredefined = value !== null && (TRADING_MISTAKES as readonly string[]).includes(value);
  const isInitiallyCustom = value !== null && !isPredefined && value.length > 0;
  const [isCustom, setIsCustom] = useState(isInitiallyCustom);
  const [customText, setCustomText] = useState(isInitiallyCustom && value ? value : "");

  return (
    <div className="space-y-2">
      <Label>Main mistake</Label>
      <div role="group" aria-label="Main mistake" className="flex flex-wrap gap-2">
        {TRADING_MISTAKES.map((option) => (
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
            onChange(customText || "");
          }}
        >
          Custom
        </Button>
      </div>
      {isCustom && (
        <Input
          placeholder="Describe the mistake..."
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
