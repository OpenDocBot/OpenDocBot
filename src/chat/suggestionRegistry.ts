/**
 * In-memory registry of suggestions (comments created by `add_suggestion`)
 * during the current taskpane session.
 *
 * Office gives the add-in no way to tell its own comments from anyone else's:
 * comments are authored by the signed-in user, so authorName/authorEmail do not
 * distinguish the assistant. Provenance is therefore tracked explicitly: a
 * comment can only be removed via `remove_suggestion` if its id is registered
 * here. The registry lives in memory and is cleared when the conversation is
 * cleared, so after a reload the assistant can no longer remove earlier
 * suggestions (they stay in the document for the user to manage).
 */

export interface SuggestionRef {
  host: "word" | "excel";
  /** Excel: worksheet the comment lives on (comments are per-sheet). */
  sheet?: string;
  /** Excel: single-cell A1 address the comment is attached to. */
  cell?: string;
  /** Word: the passage the comment is anchored to. */
  anchor?: string;
  /** The comment text that was inserted. */
  text: string;
  createdAt: number;
}

const suggestions = new Map<string, SuggestionRef>();

export function registerSuggestion(id: string, ref: SuggestionRef): void {
  if (id) suggestions.set(id, ref);
}

export function getSuggestion(id: string): SuggestionRef | undefined {
  return suggestions.get(id);
}

export function removeSuggestion(id: string): void {
  suggestions.delete(id);
}

export function clearSuggestions(): void {
  suggestions.clear();
}
