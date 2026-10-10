import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SkillsMenu } from "../../components/chat/SkillsMenu";
import { useSkillsStore } from "../../store/skillsStore";
import { serializeSkillMd } from "../../chat/skills/transfer";
import type { Skill } from "../../chat/skills/types";

const skill = (id: string, name: string, hosts: Skill["hosts"] = ["word", "excel", "powerpoint"]): Skill => ({
  id,
  name,
  slug: name.toLowerCase(),
  description: `${name} skill`,
  instructions: `do ${id}`,
  hosts,
});

let createObjectURL: ReturnType<typeof vi.fn>;

beforeEach(() => {
  useSkillsStore.setState({ skills: [] });
  createObjectURL = vi.fn(() => "blob:mock");
  Object.defineProperty(URL, "createObjectURL", { value: createObjectURL, configurable: true });
  Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), configurable: true });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SkillsMenu", () => {
  it("shows an empty state when the library is empty", () => {
    render(<SkillsMenu onCloseMenu={vi.fn()} />);
    expect(screen.getByText("No skills yet")).toBeInTheDocument();
  });

  it("omits the back button when onBack is not provided", () => {
    render(<SkillsMenu onCloseMenu={vi.fn()} />);
    expect(screen.queryByRole("menuitem", { name: "Back" })).toBeNull();
  });

  it("shows a back button that calls onBack", async () => {
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(<SkillsMenu onCloseMenu={vi.fn()} onBack={onBack} />);
    await user.click(screen.getByRole("menuitem", { name: "Back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("lists skills with per-app availability badges (no checkbox)", () => {
    useSkillsStore.setState({ skills: [skill("a", "Alpha")] });
    render(<SkillsMenu onCloseMenu={vi.fn()} />);

    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getAllByText("W").length).toBeGreaterThan(0);
    expect(screen.getAllByText("X").length).toBeGreaterThan(0);
    expect(screen.getAllByText("P").length).toBeGreaterThan(0);
  });

  it("creates a skill via the editor", async () => {
    const user = userEvent.setup();
    render(<SkillsMenu onCloseMenu={vi.fn()} />);

    await user.click(screen.getByRole("menuitem", { name: /new skill/i }));
    await user.type(screen.getByLabelText("Name"), "My skill");
    await user.type(screen.getByLabelText("Description"), "Does a thing");
    await user.type(screen.getByLabelText("Instructions"), "Do the thing.");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const skills = useSkillsStore.getState().skills;
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("My skill");
  });

  it("edits an existing skill", async () => {
    useSkillsStore.setState({ skills: [skill("a", "Alpha")] });
    const user = userEvent.setup();
    render(<SkillsMenu onCloseMenu={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Edit Alpha" }));
    const nameInput = screen.getByLabelText("Name");
    await user.clear(nameInput);
    await user.type(nameInput, "Alpha v2");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(useSkillsStore.getState().skills[0].name).toBe("Alpha v2");
  });

  it("exports the library and closes the menu", async () => {
    useSkillsStore.setState({ skills: [skill("a", "Alpha")] });
    const onCloseMenu = vi.fn();
    const user = userEvent.setup();
    render(<SkillsMenu onCloseMenu={onCloseMenu} />);

    await user.click(screen.getByRole("menuitem", { name: /export skills/i }));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    expect(onCloseMenu).toHaveBeenCalledTimes(1);
  });

  it("imports a SKILL.md file", async () => {
    const onCloseMenu = vi.fn();
    const { container } = render(<SkillsMenu onCloseMenu={onCloseMenu} />);
    const text = serializeSkillMd(skill("z", "Zeta"));
    const file = new File([text], "SKILL.md", { type: "text/markdown" });
    Object.defineProperty(file, "text", { value: () => Promise.resolve(text) });

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(useSkillsStore.getState().skills.map((s) => s.slug)).toEqual(["zeta"]),
    );
    expect(onCloseMenu).toHaveBeenCalled();
  });
});
