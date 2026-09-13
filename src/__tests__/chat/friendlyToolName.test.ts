import { describe, it, expect } from "vitest";
import { friendlyToolName } from "../../chat/friendlyToolName";

describe("friendlyToolName — PowerPoint", () => {
  it("maps PowerPoint tool names to friendly labels", () => {
    expect(friendlyToolName("get_presentation_structure")).toBe("List slides");
    expect(friendlyToolName("read_slide")).toBe("Read slide");
    expect(friendlyToolName("list_slide_shapes")).toBe("List shapes");
    expect(friendlyToolName("read_slide_text")).toBe("Read slide text");
    expect(friendlyToolName("list_masters")).toBe("List masters");
    expect(friendlyToolName("verify_slides")).toBe("Check slides");
    expect(friendlyToolName("modify_presentation_structure")).toBe("Modify slides");
    expect(friendlyToolName("insert_slide_element")).toBe("Add element");
    expect(friendlyToolName("remove_slide_element")).toBe("Remove element");
    expect(friendlyToolName("edit_slide_text")).toBe("Edit slide text");
    expect(friendlyToolName("edit_slide_xml")).toBe("Edit slide XML");
    expect(friendlyToolName("format_shape")).toBe("Format shape");
  });

  it("falls back to the raw tool name for unknown tools", () => {
    expect(friendlyToolName("unknown_ppt_tool")).toBe("unknown_ppt_tool");
  });
});
