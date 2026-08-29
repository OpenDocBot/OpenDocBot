import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Markdown } from "../../components/chat/Markdown";

describe("Markdown", () => {
  it("renders plain text", () => {
    render(<Markdown content="Hello world" />);
    expect(screen.getByText("Hello world")).toBeDefined();
  });

  it("renders bold text", () => {
    const { container } = render(<Markdown content="This is **bold** text" />);
    const strong = container.querySelector("strong");
    expect(strong).toBeTruthy();
    expect(strong!.textContent).toBe("bold");
  });

  it("renders italic text", () => {
    const { container } = render(<Markdown content="This is *italic* text" />);
    const em = container.querySelector("em");
    expect(em).toBeTruthy();
    expect(em!.textContent).toBe("italic");
  });

  it("renders headings", () => {
    const { container } = render(<Markdown content={"# Heading 1\n\n## Heading 2"} />);
    expect(container.querySelector("h1")).toBeTruthy();
    expect(container.querySelector("h2")).toBeTruthy();
  });

  it("renders unordered lists", () => {
    const { container } = render(<Markdown content={"- Item one\n- Item two"} />);
    const lis = container.querySelectorAll("li");
    expect(lis.length).toBe(2);
  });

  it("renders ordered lists", () => {
    const { container } = render(<Markdown content={"1. First\n2. Second"} />);
    const ol = container.querySelector("ol");
    expect(ol).toBeTruthy();
    expect(ol!.querySelectorAll("li").length).toBe(2);
  });

  it("renders inline code", () => {
    const { container } = render(<Markdown content="Use `const x = 1` here" />);
    const code = container.querySelector("code");
    expect(code).toBeTruthy();
    expect(code!.textContent).toBe("const x = 1");
  });

  it("renders code blocks with language", () => {
    const { container } = render(
      <Markdown content={"```javascript\nconst x = 1;\n```"} />
    );
    const pre = container.querySelector("pre");
    expect(pre).toBeTruthy();
    const code = pre!.querySelector("code");
    expect(code!.className).toContain("language-javascript");
  });

  it("renders links with target blank", () => {
    render(<Markdown content="[Click here](https://example.com)" />);
    const link = screen.getByText("Click here") as HTMLAnchorElement;
    expect(link.href).toBe("https://example.com/");
    expect(link.target).toBe("_blank");
    expect(link.rel).toContain("noopener");
  });

  it("renders tables (GFM)", () => {
    const { container } = render(
      <Markdown content={"| A | B |\n|---|---|\n| 1 | 2 |"} />
    );
    expect(container.querySelector("table")).toBeTruthy();
  });

  it("renders strikethrough (GFM)", () => {
    const { container } = render(<Markdown content="~~deleted~~" />);
    const del = container.querySelector("del");
    expect(del).toBeTruthy();
  });

  it("renders blockquotes", () => {
    const { container } = render(<Markdown content="> Quoted text" />);
    expect(container.querySelector("blockquote")).toBeTruthy();
  });

  // ===== Streaming / partial markdown =====

  it("handles unclosed bold during streaming", () => {
    const { container } = render(<Markdown content="This is **partial bold" />);
    expect(container.textContent).toContain("partial bold");
  });

  it("handles unclosed code block during streaming", () => {
    const { container } = render(
      <Markdown content={"```javascript\nconst x = 1;"} />
    );
    expect(container.textContent).toContain("const x = 1");
  });

  it("handles partial link syntax during streaming", () => {
    const { container } = render(<Markdown content="[Click her" />);
    expect(container.textContent).toContain("Click her");
  });

  it("handles partial list during streaming", () => {
    const { container } = render(<Markdown content={"- Item one\n- Item"} />);
    expect(container.querySelectorAll("li").length).toBe(2);
  });

  it("handles incomplete heading during streaming", () => {
    const { container } = render(<Markdown content="## Head" />);
    expect(container.querySelector("h2")).toBeTruthy();
  });

  it("does not execute script tags (XSS)", () => {
    const { container } = render(
      <Markdown content={'<script>alert("xss")</script>Safe text'} />
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("Safe text");
  });

  it("does not render raw HTML (XSS via img)", () => {
    const { container } = render(
      <Markdown content={'<img src=x onerror=alert(1)>Safe'} />
    );
    expect(container.querySelector("img")).toBeNull();
  });

  it("handles empty string", () => {
    const { container } = render(<Markdown content="" />);
    expect(container.textContent).toBe("");
  });

  it("handles markdown with special characters", () => {
    render(<Markdown content="Price: $5 & tax: 5% of <total>" />);
    expect(screen.getByText(/Price:/)).toBeDefined();
  });

  it("renders multiple paragraphs", () => {
    const { container } = render(
      <Markdown content={"First paragraph.\n\nSecond paragraph."} />
    );
    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs.length).toBe(2);
  });
});
