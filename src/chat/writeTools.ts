import type { ToolDefinition } from "../providers/types";
import { MCP_TOOL_PREFIX } from "../mcp/toolBridge";

/** Tools that modify the document — these require HITL approval when enabled. */
export const WRITE_TOOLS = new Set([
  // Word
  "edit_doc_text",
  "edit_doc_list",
  "collapse_blank_paragraphs",
  "set_page_break",
  // Excel
  "write_range",
  "format_range",
  "insert_rows_columns",
  "delete_rows_columns",
  "merge_cells",
  "clear_range",
  "sort_range",
  "set_column_width",
  "set_row_height",
  // PowerPoint
  "modify_presentation_structure",
  "insert_slide_element",
  "remove_slide_element",
  "edit_slide_text",
  "edit_slide_xml",
  "format_shape",
  // Both
  "execute_office_js",
]);

/**
 * Whether a tool call requires Human-in-the-Loop approval. Document-modifying
 * tools always do; MCP tools are treated as approval-worthy too (their side
 * effects are not declared reliably), so they are gated whenever HITL is on.
 */
export function toolNeedsApproval(name: string): boolean {
  return WRITE_TOOLS.has(name) || name.startsWith(MCP_TOOL_PREFIX);
}

/**
 * Filter a host tool list for the active mode.
 *
 * - Suggestion mode drops every document-mutating tool and exposes only the
 *   suggestion-only tools (e.g. `add_suggestion`).
 * - Outside suggestion mode, suggestion-only tools are hidden.
 */
export function selectToolsForMode(
  defs: ToolDefinition[],
  suggestionMode: boolean
): ToolDefinition[] {
  return defs.filter((t) => {
    if (t.suggestionOnly) return suggestionMode;
    if (suggestionMode && WRITE_TOOLS.has(t.name)) return false;
    return true;
  });
}
