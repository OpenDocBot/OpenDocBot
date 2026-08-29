import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import QuestionCard from "../../components/chat/QuestionCard";

const baseOptions = [
  { label: "Executive", description: "C-suite summary" },
  { label: "Technical", description: "Deep dive" },
];

const baseProps = {
  question: "Which audience?",
  header: "Audience",
  options: baseOptions,
};

describe("QuestionCard", () => {
  it("reports a single selected option", () => {
    const onSelect = vi.fn();
    render(<QuestionCard {...baseProps} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Executive"));
    expect(onSelect).toHaveBeenLastCalledWith("Executive");
  });

  it("reports Other immediately when clicked (empty text)", () => {
    const onSelect = vi.fn();
    render(<QuestionCard {...baseProps} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Other"));
    expect(onSelect).toHaveBeenLastCalledWith("Other");
  });

  it("reports the typed text instead of Other", () => {
    const onSelect = vi.fn();
    render(<QuestionCard {...baseProps} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Other"));
    const input = screen.getByPlaceholderText("Your answer…");
    fireEvent.change(input, { target: { value: "Both, actually" } });
    expect(onSelect).toHaveBeenLastCalledWith("Both, actually");
  });

  it("switches from Other back to an option in single-select mode", () => {
    const onSelect = vi.fn();
    render(<QuestionCard {...baseProps} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Other"));
    fireEvent.click(screen.getByText("Executive"));
    expect(onSelect).toHaveBeenLastCalledWith("Executive");
  });

  it("reports null when no option and no Other is active", () => {
    const onSelect = vi.fn();
    render(<QuestionCard {...baseProps} onSelect={onSelect} />);
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("coexists with selections in multi-select mode", () => {
    const onSelect = vi.fn();
    render(<QuestionCard {...baseProps} multiSelect onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Executive"));
    fireEvent.click(screen.getByText("Other"));
    fireEvent.change(screen.getByPlaceholderText("Your answer…"), { target: { value: "Legal" } });
    expect(onSelect).toHaveBeenLastCalledWith("Executive, Legal");
  });

  it("appends Other as a bare item in multi-select when text is empty", () => {
    const onSelect = vi.fn();
    render(<QuestionCard {...baseProps} multiSelect onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Executive"));
    fireEvent.click(screen.getByText("Other"));
    expect(onSelect).toHaveBeenLastCalledWith("Executive, Other");
  });

  it("calls onSubmit when Enter is pressed in the Other input", () => {
    const onSubmit = vi.fn();
    render(<QuestionCard {...baseProps} onSelect={() => {}} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByText("Other"));
    const input = screen.getByPlaceholderText("Your answer…");
    fireEvent.change(input, { target: { value: "Both" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("does not call onSubmit when Enter is pressed with Other inactive", () => {
    const onSubmit = vi.fn();
    render(<QuestionCard {...baseProps} onSelect={() => {}} onSubmit={onSubmit} />);
    expect(screen.queryByPlaceholderText("Your answer…")).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
