import { useState, useEffect, useRef } from "react";

interface QuestionCardProps {
  question: string;
  header: string;
  options: Array<{ label: string; description: string }>;
  multiSelect?: boolean;
  onSelect: (answer: string | null) => void;
  onSubmit?: () => void;
}

function QuestionCard({ question, header, options, multiSelect, onSelect, onSubmit }: QuestionCardProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [otherActive, setOtherActive] = useState(false);
  const [otherText, setOtherText] = useState("");
  const otherInputRef = useRef<HTMLInputElement>(null);

  function toggle(opt: { label: string; description: string }) {
    if (otherActive && !multiSelect) {
      // Single-select: picking an option leaves "Other".
      setOtherActive(false);
      setOtherText("");
    }
    if (multiSelect) {
      setSelected(prev => {
        const next = new Set(prev);
        if (next.has(opt.label)) next.delete(opt.label);
        else next.add(opt.label);
        return next;
      });
    } else {
      setSelected(new Set([opt.label]));
    }
  }

  function toggleOther() {
    if (!otherActive && !multiSelect) {
      // Single-select: choosing "Other" clears the selected option.
      setSelected(new Set());
    }
    setOtherActive(prev => !prev);
  }

  useEffect(() => {
    if (otherActive) {
      otherInputRef.current?.focus();
    }
  }, [otherActive]);

  useEffect(() => {
    const parts = Array.from(selected);
    if (otherActive) {
      const custom = otherText.trim();
      if (multiSelect) {
        if (custom) parts.push(custom);
        else parts.push("Other");
      } else {
        // Single-select "Other" reports the typed text, or "Other" when empty
        // so the answer is never blank once "Other" is active.
        onSelect(custom || "Other");
        return;
      }
    }
    onSelect(parts.length > 0 ? parts.join(", ") : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, otherActive, otherText]);

  return (
    <div className="border border-border bg-card font-mono">
      <div className="px-3 py-2 border-b bg-muted/50 flex items-center gap-2">
        <span className="text-primary select-none">?</span>
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{header}</span>
      </div>
      <div className="px-3 py-2">
        <p className="text-sm text-foreground mb-2">{question}</p>
        <div className="space-y-1">
          {options.map((opt, oi) => {
            const isSelected = selected.has(opt.label);
            return (
              <button
                key={oi}
                onClick={() => toggle(opt)}
                className={`w-full text-left px-2.5 py-2 text-sm transition-colors border ${
                  isSelected
                    ? "border-primary bg-accent text-accent-foreground"
                    : "border-border hover:bg-muted"
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className={`select-none shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground"}`}>
                    {isSelected ? "[x]" : "[ ]"}
                  </span>
                  <div className="min-w-0">
                    <div className="font-medium">{opt.label}</div>
                    <div className="text-xs text-muted-foreground">{opt.description}</div>
                  </div>
                </div>
              </button>
            );
          })}

          <button
            onClick={toggleOther}
            className={`w-full text-left px-2.5 py-2 text-sm transition-colors border ${
              otherActive
                ? "border-primary bg-accent text-accent-foreground"
                : "border-border hover:bg-muted"
            }`}
          >
            <div className="flex items-start gap-2">
              <span className={`select-none shrink-0 ${otherActive ? "text-primary" : "text-muted-foreground"}`}>
                {otherActive ? "[x]" : "[ ]"}
              </span>
              <div className="min-w-0">
                <div className="font-medium">Other</div>
                <div className="text-xs text-muted-foreground">Type a different answer</div>
              </div>
            </div>
          </button>

          {otherActive && (
            <input
              ref={otherInputRef}
              type="text"
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onSubmit?.();
                }
              }}
              placeholder="Your answer…"
              className="w-full px-2.5 py-2 text-sm border border-primary bg-background text-foreground placeholder:text-muted-foreground"
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default QuestionCard;
