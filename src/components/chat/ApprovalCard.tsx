import { useState } from "react";
import { Button } from "@/components/ui/button";
import { type PendingApproval } from "../../store/chatStore";
import { friendlyToolName } from "../../chat/friendlyToolName";

interface ApprovalCardProps {
  approval: PendingApproval;
  onApprove: () => void;
  onReject: () => void;
}

function formatArgs(args: Record<string, unknown>): string {
  try {
    const str = JSON.stringify(args, null, 2);
    return str.length > 800 ? str.slice(0, 800) + "\n…" : str;
  } catch {
    return String(args);
  }
}

function ApprovalCard({ approval, onApprove, onReject }: ApprovalCardProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="border border-primary/50 bg-card font-mono">
      <div className="px-3 py-2 border-b border-primary/30 bg-primary/10 flex items-center gap-2">
        <span className="text-primary select-none">✓</span>
        <span className="text-xs uppercase tracking-wider text-muted-foreground">
          Action needs your approval
        </span>
      </div>
      <div className="px-3 py-2 space-y-2">
        <div className="text-sm text-foreground font-medium">
          {friendlyToolName(approval.toolName)}
        </div>
        {approval.label && approval.label !== approval.toolName && (
          <div className="text-xs text-muted-foreground">{approval.label}</div>
        )}

        <button
          onClick={() => setShowDetails((v) => !v)}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          {showDetails ? "Hide technical details" : "Show technical details"}
        </button>

        {showDetails && (
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-all bg-black/40 border border-border p-2 max-h-48 overflow-y-auto m-0">
            {formatArgs(approval.args)}
          </pre>
        )}

        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" onClick={onApprove} className="flex-1">
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onReject}
            className="flex-1 border-destructive/40 text-destructive hover:bg-destructive/10"
          >
            Reject
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ApprovalCard;
