import type { Host } from "../../office";
import { ALL_HOSTS, type Skill } from "./types";

const VALID_HOSTS: Host[] = ["word", "excel", "powerpoint"];

/** Whether a skill is available in the given Office host. */
export function isSkillAvailable(skill: Skill, host: Host): boolean {
  return skill.hosts.includes(host);
}

/** The subset of skills available in the given Office host. */
export function availableSkills(skills: Skill[], host: Host): Skill[] {
  return skills.filter((skill) => skill.hosts.includes(host));
}

/**
 * Normalize a `hosts` value (array, or a comma/space-separated string) into a
 * deduped list of valid hosts. Defaults to every host when nothing valid is
 * given, so imported/legacy skills stay available everywhere.
 */
export function normalizeHosts(raw: unknown): Host[] {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(/[\s,]+/)
      : [];
  const valid = list.filter((h): h is Host => VALID_HOSTS.includes(h as Host));
  return valid.length > 0 ? Array.from(new Set(valid)) : [...ALL_HOSTS];
}
