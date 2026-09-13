/** User-friendly labels for technical tool names. */
const FRIENDLY_TOOL_NAMES: Record<string, string> = {
  // Word
  edit_doc_text: "Edit text",
  edit_doc_list: "Edit list",
  execute_office_js: "Execute script",
  collapse_blank_paragraphs: "Remove empty lines",
  set_page_break: "Set page break",
  read_doc_section: "Read document",
  search_doc_text: "Search document",
  verify_doc: "Check structure",
  // Excel
  list_worksheets: "List sheets",
  read_range: "Read cells",
  write_range: "Write values",
  format_range: "Format cells",
  insert_rows_columns: "Insert rows/columns",
  delete_rows_columns: "Delete rows/columns",
  set_column_width: "Set column width",
  set_row_height: "Set row height",
  merge_cells: "Merge cells",
  clear_range: "Clear cells",
  sort_range: "Sort cells",
  // PowerPoint
  get_presentation_structure: "List slides",
  read_slide: "Read slide",
  list_slide_shapes: "List shapes",
  read_slide_text: "Read slide text",
  list_masters: "List masters",
  verify_slides: "Check slides",
  modify_presentation_structure: "Modify slides",
  insert_slide_element: "Add element",
  remove_slide_element: "Remove element",
  edit_slide_text: "Edit slide text",
  edit_slide_xml: "Edit slide XML",
  format_shape: "Format shape",
  // Task list
  update_todos: "Update tasks",
};

export function friendlyToolName(toolName: string): string {
  return FRIENDLY_TOOL_NAMES[toolName] ?? toolName;
}
