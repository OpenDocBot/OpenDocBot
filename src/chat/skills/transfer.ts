import JSZip from "jszip";
import {
  MAX_SKILLS,
  MAX_SKILL_DESCRIPTION,
  MAX_SKILL_INSTRUCTIONS,
  MAX_SKILL_NAME,
} from "./config";
import { normalizeHosts } from "./availability";
import { slugify, uniqueSlug } from "./slug";
import type { Skill } from "./types";

export const SKILL_MD_FILE_NAME = "SKILL.md";
export const SKILLS_PACK_FILE_NAME = "opendocbot-skills.zip";

/** Legacy JSON bundle format (still accepted on import for migration). */
export const SKILLS_FORMAT = "opendocbot-skills";
export const SKILLS_FORMAT_VERSION = 1;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Quote a YAML scalar when it could be misparsed, else return it as-is. */
function yamlScalar(value: string): string {
  const needsQuoting =
    value === "" || value !== value.trim() || /[\n\r:#"'{}[\],&*!|>%@]/.test(value);
  return needsQuoting ? JSON.stringify(value) : value;
}

function unquote(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value) as string;
    } catch {
      return value.slice(1, -1);
    }
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

/** Serialize a skill to a spec-compliant `SKILL.md` (frontmatter + body). */
export function serializeSkillMd(skill: Skill): string {
  const lines = [
    "---",
    `name: ${yamlScalar(skill.slug)}`,
    `description: ${yamlScalar(skill.description)}`,
    "metadata:",
    `  display-name: ${yamlScalar(skill.name)}`,
  ];
  lines.push(`  hosts: ${normalizeHosts(skill.hosts).join(",")}`);
  lines.push("---", "");
  return `${lines.join("\n")}${skill.instructions.trim()}\n`;
}

interface Frontmatter {
  fields: Map<string, string>;
  metadata: Map<string, string>;
  body: string;
}

/** Minimal YAML-frontmatter parser for the fields skills use. */
function parseFrontmatter(text: string): Frontmatter | null {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return null;

  const fields = new Map<string, string>();
  const metadata = new Map<string, string>();
  let inMetadata = false;
  let i = 1;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "---") {
      i++;
      break;
    }
    if (line.trim() === "") continue;
    const match = /^(\s*)([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!match) continue;
    const indent = match[1].length;
    const key = match[2];
    const value = unquote(match[3].trim());

    if (key === "metadata" && value === "") {
      inMetadata = true;
      continue;
    }
    if (inMetadata && indent > 0) {
      metadata.set(key, value);
      continue;
    }
    inMetadata = false;
    fields.set(key, value);
  }
  return { fields, metadata, body: lines.slice(i).join("\n") };
}

/** Parse a `SKILL.md` file. Returns null when it is not a usable skill. */
export function parseSkillMd(text: string): Skill | null {
  const fm = parseFrontmatter(text);
  if (!fm) return null;

  const slugRaw = (fm.fields.get("name") ?? "").trim();
  const description = (fm.fields.get("description") ?? "").trim();
  const display = (fm.metadata.get("display-name") ?? "").trim() || slugRaw;
  const instructions = fm.body.replace(/^\n+/, "").replace(/\s+$/, "");
  if (!slugRaw || !instructions.trim()) return null;
  if (instructions.length > MAX_SKILL_INSTRUCTIONS) return null;

  return {
    id: crypto.randomUUID(),
    name: display.slice(0, MAX_SKILL_NAME),
    slug: slugify(slugRaw),
    description: (description || display).slice(0, MAX_SKILL_DESCRIPTION),
    instructions,
    hosts: normalizeHosts(fm.metadata.get("hosts")),
  };
}

/** Validate/normalize one legacy JSON skill entry. */
function normalizeJsonSkill(raw: unknown): Skill | null {
  if (!isPlainObject(raw)) return null;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const instructions = typeof raw.instructions === "string" ? raw.instructions : "";
  if (!name || !instructions.trim()) return null;
  if (name.length > MAX_SKILL_NAME) return null;
  if (instructions.length > MAX_SKILL_INSTRUCTIONS) return null;

  const description = typeof raw.description === "string" ? raw.description.trim() : "";
  const slugSource = typeof raw.slug === "string" && raw.slug.trim() ? raw.slug : name;
  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id : crypto.randomUUID(),
    name,
    slug: slugify(slugSource),
    description: (description || name).slice(0, MAX_SKILL_DESCRIPTION),
    instructions,
    hosts: normalizeHosts(raw.hosts),
  };
}

/**
 * Parse a legacy JSON skills bundle (object written by the old exporter, or a
 * bare array). Throws when the payload is not a recognizable bundle.
 */
export function parseSkillsJson(text: string): Skill[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Not a valid skills file.");
  }
  const list = Array.isArray(raw)
    ? raw
    : isPlainObject(raw) && raw.format === SKILLS_FORMAT && Array.isArray(raw.skills)
      ? raw.skills
      : null;
  if (!list) throw new Error("Not a valid skills file.");
  return dedupeSlugs(
    list.map(normalizeJsonSkill).filter((s): s is Skill => s !== null),
  ).slice(0, MAX_SKILLS);
}

function dedupeSlugs(skills: Skill[]): Skill[] {
  const used = new Set<string>();
  for (const skill of skills) {
    skill.slug = uniqueSlug(skill.slug || slugify(skill.name), used);
    used.add(skill.slug);
  }
  return skills;
}

/** Build a `.zip` skill pack: one `<slug>/SKILL.md` entry per skill. */
export async function exportSkillsZip(skills: Skill[]): Promise<Blob> {
  const zip = new JSZip();
  const used = new Set<string>();
  for (const skill of skills) {
    const dir = uniqueSlug(skill.slug || slugify(skill.name), used);
    used.add(dir);
    zip.file(`${dir}/${SKILL_MD_FILE_NAME}`, serializeSkillMd({ ...skill, slug: dir }));
  }
  return zip.generateAsync({ type: "blob" });
}

/** Read every nested SKILL.md entry of a `.zip` skill pack. */
export async function parseSkillsZip(data: Blob | ArrayBuffer | Uint8Array): Promise<Skill[]> {
  const zip = await JSZip.loadAsync(data);
  const skills: Skill[] = [];
  for (const path of Object.keys(zip.files)) {
    if (!/(^|\/)SKILL\.md$/i.test(path)) continue;
    const text = await zip.files[path].async("string");
    const skill = parseSkillMd(text);
    if (!skill) continue;
    const dir = path.split("/").slice(-2)[0];
    if (dir && dir !== SKILL_MD_FILE_NAME) skill.slug = slugify(dir);
    skills.push(skill);
  }
  return dedupeSlugs(skills).slice(0, MAX_SKILLS);
}

/**
 * Parse an imported file: a `.zip` skill pack, a single `SKILL.md`, or a legacy
 * JSON bundle. Throws when nothing usable is found.
 */
export async function parseSkillsFile(file: File): Promise<Skill[]> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".zip")) return parseSkillsZip(file);

  const text = await file.text();
  if (lower.endsWith(".json")) return parseSkillsJson(text);

  const single = parseSkillMd(text);
  if (single) return [single];

  try {
    return parseSkillsJson(text);
  } catch {
    throw new Error("Not a valid skills file.");
  }
}
