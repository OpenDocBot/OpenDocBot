import { listProviders } from "../../providers/registry";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

interface ProviderSelectProps {
  value: string;
  onChange: (id: string) => void;
}

export function ProviderSelect({ value, onChange }: ProviderSelectProps) {
  const providers = listProviders();
  const options = providers.map((p) => ({
    value: p.id,
    label: p.label,
  }));

  return (
    <div className="space-y-1.5">
      <Label>Provider</Label>
      <Select
        value={value || providers[0]?.id || ""}
        onValueChange={onChange}
        options={options}
      />
    </div>
  );
}
