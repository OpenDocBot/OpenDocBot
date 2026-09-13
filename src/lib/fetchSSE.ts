/** Idle time (ms) with no bytes received before the stream is aborted. */
const SSE_IDLE_TIMEOUT_MS = 120_000;
/** Total time (ms) before the stream is aborted, even if data keeps flowing. */
const SSE_TOTAL_TIMEOUT_MS = 600_000;

export function fetchSSE(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string>,
  onData: (data: Record<string, unknown>) => void,
  onDone: () => void,
  onError: (err: Error) => void,
  signal?: AbortSignal
): void {
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let totalTimer: ReturnType<typeof setTimeout> | null = null;
  let settled = false;

  function clearTimers(): void {
    if (idleTimer !== null) clearTimeout(idleTimer);
    if (totalTimer !== null) clearTimeout(totalTimer);
    idleTimer = null;
    totalTimer = null;
  }

  function finishWithError(msg: string): void {
    if (settled) return;
    settled = true;
    clearTimers();
    reader?.cancel().catch(() => {});
    onError(new Error(msg));
  }

  function finishDone(): void {
    if (settled) return;
    settled = true;
    clearTimers();
    onDone();
  }

  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
    signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        const text = await response.text().catch(() => response.statusText);
        throw new Error(`HTTP ${response.status}: ${text}`);
      }
      if (!response.body) throw new Error("No response body");

      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      function armIdleTimer(): void {
        if (idleTimer !== null) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          finishWithError(
            `SSE stream timed out after ${SSE_IDLE_TIMEOUT_MS / 1000}s with no data. ` +
              "The provider connection stalled. Try again, or check the provider for errors."
          );
        }, SSE_IDLE_TIMEOUT_MS);
      }

      totalTimer = setTimeout(() => {
        finishWithError(
          `SSE stream exceeded the total ${SSE_TOTAL_TIMEOUT_MS / 60000}min time limit. ` +
            "The provider response took too long and was aborted."
        );
      }, SSE_TOTAL_TIMEOUT_MS);

      armIdleTimer();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (settled) return;
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          // Any bytes received reset the idle timer.
          armIdleTimer();

          if (processLines(lines, onData)) break;
        }

        if (buffer) {
          processLines([buffer], onData);
        }
      } finally {
        if (!settled) clearTimers();
      }

      finishDone();
    })
    .catch((err) => {
      if (!settled) {
        settled = true;
        clearTimers();
        onError(err);
      }
    });
}

function processLines(
  lines: string[],
  onData: (data: Record<string, unknown>) => void
): boolean {
  for (const line of lines) {
    if (line === "[DONE]" || line === "data: [DONE]") return true;
    if (line.startsWith("data: ")) {
      try {
        const json = JSON.parse(line.slice(6));
        onData(json);
      } catch {
        // skip unparseable lines
      }
    }
  }
  return false;
}
