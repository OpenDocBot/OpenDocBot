import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ApprovalCard from "../../components/chat/ApprovalCard";
import { friendlyToolName } from "../../chat/friendlyToolName";

describe("friendlyToolName", () => {
  it("maps execute_office_js to Execute script", () => {
    expect(friendlyToolName("execute_office_js")).toBe("Execute script");
  });

  it("maps edit_doc_text to Edit text", () => {
    expect(friendlyToolName("edit_doc_text")).toBe("Edit text");
  });

  it("falls back to the raw name for unknown tools", () => {
    expect(friendlyToolName("my_tool")).toBe("my_tool");
  });
});

describe("ApprovalCard", () => {
  const base = {
    toolName: "execute_office_js",
    label: "Changing title and headings to orange",
    args: { code: "const x = 1;" },
  };

  it("shows the friendly tool name", () => {
    render(<ApprovalCard approval={base} onApprove={() => {}} onReject={() => {}} />);
    expect(screen.getByText("Execute script")).toBeDefined();
  });

  it("shows the action description", () => {
    render(<ApprovalCard approval={base} onApprove={() => {}} onReject={() => {}} />);
    expect(screen.getByText("Changing title and headings to orange")).toBeDefined();
  });

  it("hides raw args by default", () => {
    render(<ApprovalCard approval={base} onApprove={() => {}} onReject={() => {}} />);
    expect(screen.queryByText("const x = 1;")).toBeNull();
    expect(screen.getByText("Show technical details")).toBeDefined();
  });

  it("reveals raw args after toggling details", () => {
    render(<ApprovalCard approval={base} onApprove={() => {}} onReject={() => {}} />);
    fireEvent.click(screen.getByText("Show technical details"));
    expect(screen.getByText(/const x = 1;/)).toBeDefined();
    expect(screen.getByText("Hide technical details")).toBeDefined();
  });

  it("calls onApprove when Approve is clicked", () => {
    const onApprove = vi.fn();
    render(<ApprovalCard approval={base} onApprove={onApprove} onReject={() => {}} />);
    fireEvent.click(screen.getByText("Approve"));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it("calls onReject when Reject is clicked", () => {
    const onReject = vi.fn();
    render(<ApprovalCard approval={base} onApprove={() => {}} onReject={onReject} />);
    fireEvent.click(screen.getByText("Reject"));
    expect(onReject).toHaveBeenCalledTimes(1);
  });
});
