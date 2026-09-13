/**
 * Shared chat-session state.
 *
 * The abort controller, pending-approval resolver, and the "rejected this
 * turn" flag used to live in `useRef` inside `useChat`. That made them
 * component-scoped: clearing the chat from the header couldn't stop the
 * running agent loop, and opening Settings (which unmounts ChatPanel) orphaned
 * a pending approval resolver, leaving the loop stuck forever.
 *
 * Keeping this state module-level means Stop/Clear/approval actions work from
 * any component, regardless of which ones are currently mounted.
 */

let abortController: AbortController | null = null;
let approvalResolver: ((approved: boolean) => void) | null = null;
let rejectedThisTurn = false;

/** Register the AbortController for the in-flight agent loop. */
export function setAbortController(controller: AbortController | null): void {
  abortController = controller;
}

/** Register the resolver for the currently pending HITL approval. */
export function setApprovalResolver(resolver: ((approved: boolean) => void) | null): void {
  approvalResolver = resolver;
}

/**
 * Resolve the pending approval, if any. Returns false when no approval is
 * waiting (e.g. the loop already finished or was cleared).
 */
export function resolvePendingApproval(approved: boolean): boolean {
  const resolver = approvalResolver;
  approvalResolver = null;
  if (resolver) {
    if (!approved) rejectedThisTurn = true;
    resolver(approved);
    return true;
  }
  return false;
}

/**
 * Stop the in-flight generation: reject any pending approval and abort the
 * provider stream. Safe to call at any time (no-op when nothing is running).
 */
export function stopGeneration(): void {
  resolvePendingApproval(false);
  abortController?.abort();
  abortController = null;
}

/** Whether a user rejected a tool call earlier in this turn. */
export function getRejectedThisTurn(): boolean {
  return rejectedThisTurn;
}

export function setRejectedThisTurn(value: boolean): void {
  rejectedThisTurn = value;
}

/** Clear all session state when a turn ends. */
export function resetSession(): void {
  abortController = null;
  approvalResolver = null;
  rejectedThisTurn = false;
}