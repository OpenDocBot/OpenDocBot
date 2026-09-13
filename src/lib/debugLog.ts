type LogLevel = "info" | "warn" | "error" | "tool" | "loop";

interface LogEntry {
  ts: number;
  level: LogLevel;
  msg: string;
}

let _logs: LogEntry[] = [];

export function debugLog(level: LogLevel, msg: string): void {
  _logs.push({ ts: Date.now(), level, msg });
}

export function clearDebugLogs(): void {
  _logs = [];
}

export function getDebugLogs(): LogEntry[] {
  return [..._logs];
}

export function formatDebugLogs(): string {
  if (_logs.length === 0) return "";
  const lines: string[] = [];
  lines.push("## Debug Log");
  lines.push("");
  for (const l of _logs) {
    const time = new Date(l.ts).toISOString().split("T")[1]?.slice(0, 12) ?? "";
    const tag = `[${l.level.toUpperCase()}]`.padEnd(9);
    lines.push(`\`${time}\` ${tag} ${l.msg}`);
  }
  return lines.join("\n");
}
