import { ArrowUpRight, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { getProviderDocsUrl } from "../../lib/providerDocs";

interface ProviderDocsLinkProps {
  presetId?: string | null;
  label?: string;
  title?: string;
  className?: string;
}

export function ProviderDocsLink({
  presetId,
  label = "Setup guide",
  title = "Open the provider setup guide",
  className,
}: ProviderDocsLinkProps) {
  return (
    <a
      href={getProviderDocsUrl(presetId)}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className={cn(
        "group inline-flex items-center gap-1 whitespace-nowrap rounded-sm font-mono text-[11px] text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        className
      )}
    >
      <BookOpen className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>{label}</span>
      <ArrowUpRight
        className="h-3 w-3 shrink-0 opacity-60 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </a>
  );
}
