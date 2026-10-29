import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { WelcomePanel } from "../../components/chat/WelcomePanel";

describe("WelcomePanel", () => {
  it("shows the enterprise use link", () => {
    render(<WelcomePanel onConnect={vi.fn()} />);

    const link = screen.getByRole("link", { name: "Enterprise use" }) as HTMLAnchorElement;
    expect(link.href).toBe("https://opendocbot.com/enterprise");
    expect(link.target).toBe("_blank");
  });
});
