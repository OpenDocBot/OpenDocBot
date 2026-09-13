import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Option {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
}

function Select({ value, onValueChange, options, placeholder, className }: SelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      className={cn(
        "flex h-9 w-full rounded-none border border-input bg-background px-3 py-1 font-mono text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "[&>option]:bg-background [&>option]:text-foreground",
        className
      )}
    >
      {placeholder && <option value="" disabled>{placeholder}</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}


function SelectValue() {
  const value = "";
  return <span className="flex-1 text-left truncate">{value}</span>;
}

function SelectTrigger({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn(
      "flex w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background",
      "focus-within:outline-none focus-within:ring-1 focus-within:ring-ring",
      className
    )}>
      {children}
    </div>
  );
}

function SelectItem({ value, children, onSelect }: { value: string; children: ReactNode; onSelect?: (v: string) => void }) {
  return (
    <button
      type="button"
      className="relative flex w-full cursor-default items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
      onClick={() => onSelect?.(value)}
    >
      {children}
    </button>
  );
}

function SelectLabel({ children }: { children: ReactNode }) {
  return <div className="px-2 py-1.5 text-sm font-semibold">{children}</div>;
}

function SelectSeparator() {
  return <div className="-mx-1 my-1 h-px bg-muted" />;
}

function SelectContent({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn(
      "relative z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md",
      className
    )}>
      {children}
    </div>
  );
}

export {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
