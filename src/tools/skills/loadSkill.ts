import type { ToolDefinition } from "../../providers/types";
import { toolRegistry } from "../registry";
import { useSkillsStore } from "../../store/skillsStore";
import { getHost } from "../../office";

const loadSkill: ToolDefinition = {
  name: "load_skill",
  host: "both",
  description:
    "Load the full instructions of a skill advertised in the <skills> list. Call this with the " +
    "skill's `name` (the identifier from the <skills> list) before applying it. The returned " +
    "instructions then apply to the current task.",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "The skill identifier (the name attribute from the <skills> list).",
      },
      action_description: {
        type: "string",
        description: "Optional user-facing label for the tool bar.",
      },
    },
    required: ["name"],
  },
};

toolRegistry.register(loadSkill, (args) => {
  const name = typeof args.name === "string" ? args.name.trim() : "";
  if (!name) return JSON.stringify({ error: "name is required" });

  const host = getHost();
  const available = useSkillsStore
    .getState()
    .skills.filter((skill) => skill.hosts.includes(host));

  const skill = available.find((s) => s.slug.toLowerCase() === name.toLowerCase());
  if (!skill) {
    const list = available.map((s) => s.slug).join(", ");
    return JSON.stringify({
      error: `Unknown skill: ${name}. Available skills: ${list || "none"}.`,
    });
  }

  return JSON.stringify({ name: skill.slug, instructions: skill.instructions });
});
