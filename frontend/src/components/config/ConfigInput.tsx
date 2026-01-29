import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, RotateCcw } from "lucide-react";
import { useState } from "react";
import type { ConfigEntry } from "@/features/config/api";

interface ConfigInputProps {
  entry: ConfigEntry;
  onChange: (value: string) => void;
  onReset?: () => void;
  disabled?: boolean;
}

export function ConfigInput({ entry, onChange, onReset, disabled }: ConfigInputProps) {
  const [showSecret, setShowSecret] = useState(false);

  const renderInput = () => {
    switch (entry.inputType) {
      case "switch":
        return (
          <Switch
            checked={entry.value === "true"}
            onCheckedChange={(checked) => onChange(checked.toString())}
            disabled={disabled}
          />
        );

      case "select":
        return (
          <Select value={entry.value} onValueChange={onChange} disabled={disabled}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {entry.allowedValues.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "multiselect":
        // For multiselect, value is JSON array string
        const selectedValues: string[] = (() => {
          try {
            return JSON.parse(entry.value || "[]");
          } catch {
            return [];
          }
        })();
        return (
          <div className="space-y-2">
            {entry.allowedValues.map((option) => (
              <label key={option} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedValues.includes(option)}
                  onChange={(e) => {
                    const newValues = e.target.checked
                      ? [...selectedValues, option]
                      : selectedValues.filter((v) => v !== option);
                    onChange(JSON.stringify(newValues));
                  }}
                  disabled={disabled}
                  className="rounded border-input"
                />
                {option}
              </label>
            ))}
          </div>
        );

      case "textarea":
        return (
          <Textarea
            value={entry.value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            rows={4}
            className="font-mono text-sm"
          />
        );

      case "number":
        return (
          <Input
            type="number"
            value={entry.value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
          />
        );

      case "secret":
        return (
          <div className="flex items-center gap-2">
            <Input
              type={showSecret ? "text" : "password"}
              value={entry.value}
              onChange={(e) => onChange(e.target.value)}
              disabled={disabled}
              className="font-mono"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setShowSecret(!showSecret)}
              className="shrink-0"
            >
              {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        );

      case "text":
      default:
        return (
          <Input
            type="text"
            value={entry.value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
          />
        );
    }
  };

  return (
    <div className="flex items-start gap-2">
      <div className="flex-1">{renderInput()}</div>
      {onReset && entry.defaultValue !== undefined && entry.value !== entry.defaultValue && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onReset}
          title="Reset to default"
          className="shrink-0"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
