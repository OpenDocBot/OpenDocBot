import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SkillEditorDialog } from "../../components/chat/SkillEditorDialog";
import { useSkillsStore } from "../../store/skillsStore";
import type { Skill } from "../../chat/skills/types";

const alpha: Skill = {
  id: "a",
  name: "Alpha",
  slug: "alpha",
  description: "Alpha skill",
  instructions: "Do alpha.",
  hosts: ["word", "excel", "powerpoint"],
};

beforeEach(() => {
  useSkillsStore.setState({ skills: [] });
});

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Name"), "My skill");
  await user.type(screen.getByLabelText("Description"), "What it does");
  await user.type(screen.getByLabelText("Instructions"), "Do it.");
}

describe("SkillEditorDialog", () => {
  it("requires a name", async () => {
    const user = userEvent.setup();
    render(<SkillEditorDialog skill={null} onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Name is required.");
    expect(useSkillsStore.getState().skills).toHaveLength(0);
  });

  it("requires a description", async () => {
    const user = userEvent.setup();
    render(<SkillEditorDialog skill={null} onClose={vi.fn()} />);
    await user.type(screen.getByLabelText("Name"), "X");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Description is required");
  });

  it("requires instructions", async () => {
    const user = userEvent.setup();
    render(<SkillEditorDialog skill={null} onClose={vi.fn()} />);
    await user.type(screen.getByLabelText("Name"), "X");
    await user.type(screen.getByLabelText("Description"), "What it does");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Instructions are required.");
  });

  it("requires at least one app", async () => {
    const user = userEvent.setup();
    render(<SkillEditorDialog skill={null} onClose={vi.fn()} />);
    await fillRequired(user);
    await user.click(screen.getByLabelText("Word"));
    await user.click(screen.getByLabelText("Excel"));
    await user.click(screen.getByLabelText("PowerPoint"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("at least one app");
  });

  it("creates a skill with a derived slug and default hosts", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<SkillEditorDialog skill={null} onClose={onClose} />);
    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Save" }));

    const skills = useSkillsStore.getState().skills;
    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      name: "My skill",
      slug: "my-skill",
      description: "What it does",
      instructions: "Do it.",
      hosts: ["word", "excel", "powerpoint"],
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("saves a host-scoped skill", async () => {
    const user = userEvent.setup();
    render(<SkillEditorDialog skill={null} onClose={vi.fn()} />);
    await fillRequired(user);
    await user.click(screen.getByLabelText("PowerPoint"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(useSkillsStore.getState().skills[0].hosts).toEqual(["word", "excel"]);
  });

  it("updates an existing skill", async () => {
    useSkillsStore.setState({ skills: [alpha] });
    const user = userEvent.setup();
    render(<SkillEditorDialog skill={alpha} onClose={vi.fn()} />);
    const nameInput = screen.getByLabelText("Name");
    await user.clear(nameInput);
    await user.type(nameInput, "Renamed");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(useSkillsStore.getState().skills[0].name).toBe("Renamed");
  });

  it("deletes an existing skill", async () => {
    useSkillsStore.setState({ skills: [alpha] });
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<SkillEditorDialog skill={alpha} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: /delete/i }));
    expect(useSkillsStore.getState().skills).toEqual([]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<SkillEditorDialog skill={null} onClose={onClose} />);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
