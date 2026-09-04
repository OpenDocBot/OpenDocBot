import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X } from "lucide-react";
import { HEADER_VARIABLES } from "../../lib/customHeaders";

interface CustomHeadersEditorProps {
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
}

function toRecord(rows: Array<{ key: string; value: string }>): Record<string, string> {
  const record: Record<string, string> = {};
  for (const row of rows) {
    record[row.key.trim()] = row.value;
  }
  return record;
}

export function CustomHeadersEditor({ value, onChange }: CustomHeadersEditorProps) {
  const rows = Object.entries(value).map(([key, v]) => ({ key, value: v }));

  function updateRow(index: number, field: "key" | "value", text: string) {
    const next = rows.map((row, i) => (i === index ? { ...row, [field]: text } : row));
    onChange(toRecord(next));
  }

  function addRow() {
    onChange(toRecord([...rows, { key: "", value: "" }]));
  }

  function removeRow(index: number) {
    onChange(toRecord(rows.filter((_, i) => i !== index)));
  }

  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input
            className="flex-1 font-mono"
            placeholder="Header name"
            value={row.key}
            onChange={(e) => updateRow(index, "key", e.target.value)}
          />
          <Input
            className="flex-1 font-mono"
            placeholder="Value (may contain $VAR)"
            value={row.value}
            onChange={(e) => updateRow(index, "value", e.target.value)}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => removeRow(index)}
            aria-label="Remove header"
            type="button"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addRow} type="button">
        <Plus className="w-3.5 h-3.5 mr-1" />
        Add header
      </Button>
      <p className="text-xs text-muted-foreground">
        Values support variables: {HEADER_VARIABLES.map((v) => `$${v}`).join(", ")}.
      </p>
    </div>
  );
}