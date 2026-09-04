import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CustomHeadersEditor } from "../../components/settings/CustomHeadersEditor";

function Harness({ initial }: { initial: Record<string, string> }) {
  const [value, setValue] = useState(initial);
  return <CustomHeadersEditor value={value} onChange={setValue} />;
}

describe("CustomHeadersEditor", () => {
  it("renders existing headers", () => {
    render(<Harness initial={{ "x-a": "1", "x-b": "2" }} />);
    expect(screen.getByDisplayValue("x-a")).toBeDefined();
    expect(screen.getByDisplayValue("1")).toBeDefined();
    expect(screen.getByDisplayValue("x-b")).toBeDefined();
  });

  it("adds an empty header row", async () => {
    const user = userEvent.setup();
    render(<Harness initial={{}} />);
    await user.click(screen.getByText("Add header"));
    expect(screen.getByPlaceholderText("Header name")).toBeDefined();
  });

  it("removes a header row", async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ "x-a": "1", "x-b": "2" }} />);
    expect(screen.getByDisplayValue("x-a")).toBeDefined();

    const remove = screen.getAllByRole("button", { name: "Remove header" });
    await user.click(remove[0]);

    expect(screen.queryByDisplayValue("x-a")).toBeNull();
    expect(screen.getByDisplayValue("x-b")).toBeDefined();
  });

  it("edits a header value", async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ "x-a": "" }} />);
    const valueInput = screen.getByPlaceholderText("Value (may contain $VAR)");
    await user.type(valueInput, "$SESSION_ID");
    expect(valueInput).toHaveValue("$SESSION_ID");
  });

  it("edits a header name", async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ "x-a": "v" }} />);
    const nameInput = screen.getByPlaceholderText("Header name");
    await user.clear(nameInput);
    await user.type(nameInput, "x-b");
    expect(nameInput).toHaveValue("x-b");
    expect(screen.getByDisplayValue("x-b")).toBeDefined();
  });

  it("shows the variables hint", () => {
    render(<Harness initial={{}} />);
    expect(screen.getByText(/values support variables/i)).toBeDefined();
  });
});