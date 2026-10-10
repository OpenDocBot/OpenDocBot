import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddMenu } from "../../components/chat/AddMenu";
import { useSkillsStore } from "../../store/skillsStore";
import type { Skill } from "../../chat/skills/types";

const alpha: Skill = {
  id: "a",
  name: "Alpha",
  slug: "alpha",
  description: "Alpha skill",
  instructions: "do a",
  hosts: ["word", "excel", "powerpoint"],
};

beforeEach(() => {
  useSkillsStore.setState({ skills: [] });
});

function open(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole("button", { name: "Add" }));
}

describe("AddMenu", () => {
  it("shows Attach file and Skills in the root menu", async () => {
    const user = userEvent.setup();
    render(<AddMenu onAttachFile={vi.fn()} />);
    await open(user);
    expect(screen.getByRole("menuitem", { name: /attach file/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /skills/i })).toBeInTheDocument();
  });

  it("calls onAttachFile and closes", async () => {
    const onAttachFile = vi.fn();
    const user = userEvent.setup();
    render(<AddMenu onAttachFile={onAttachFile} />);
    await open(user);
    await user.click(screen.getByRole("menuitem", { name: /attach file/i }));
    expect(onAttachFile).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("drills into the skills panel and back to the root", async () => {
    useSkillsStore.setState({ skills: [alpha] });
    const user = userEvent.setup();
    render(<AddMenu onAttachFile={vi.fn()} />);
    await open(user);

    await user.click(screen.getByRole("menuitem", { name: /skills/i }));
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /attach file/i })).toBeNull();

    await user.click(screen.getByRole("menuitem", { name: "Back" }));
    expect(screen.getByRole("menuitem", { name: /attach file/i })).toBeInTheDocument();
    expect(screen.queryByText("Alpha")).toBeNull();
  });

  it("shows the available skill count on the Skills item", async () => {
    useSkillsStore.setState({ skills: [alpha] });
    const user = userEvent.setup();
    render(<AddMenu onAttachFile={vi.fn()} />);
    await open(user);
    expect(screen.getByRole("menuitem", { name: /skills/i })).toHaveTextContent("(1)");
  });

  it("closes on Escape and reopens on the root view", async () => {
    const user = userEvent.setup();
    render(<AddMenu onAttachFile={vi.fn()} />);
    await open(user);
    await user.click(screen.getByRole("menuitem", { name: /skills/i }));
    expect(screen.getByRole("menuitem", { name: "Back" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();

    await open(user);
    expect(screen.getByRole("menuitem", { name: /attach file/i })).toBeInTheDocument();
  });

  it("disables the trigger when disabled", () => {
    render(<AddMenu disabled onAttachFile={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
  });
});
