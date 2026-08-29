import type { ReactNode } from "react";

interface TaskpaneProps {
  header: ReactNode;
  tabs?: ReactNode;
  children: ReactNode;
}

export function Taskpane({ header, tabs, children }: TaskpaneProps) {
  return (
    <div className="flex flex-col h-full bg-background text-foreground font-mono">
      {header}
      {tabs}
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
