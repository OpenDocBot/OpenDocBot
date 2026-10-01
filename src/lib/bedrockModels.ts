import { buildRequestUrl } from "../providers/proxyUrl";
import { proxyFetch } from "./sessionAuth";

export interface BedrockModelInfo {
  id: string;
  name: string;
  provider?: string;
}

/**
 * Per-model capabilities derived from `ListFoundationModels`. Used to decide
 * whether it is safe to send explicit prompt-cache checkpoints (sending a
 * `cachePoint` to a model that doesn't support it would fail the request).
 */
export interface BedrockCapabilities {
  explicitPromptCaching: boolean;
  reasoning: boolean;
  maxTokensMaximum?: number;
  systemRoleSupported: boolean;
  userImageTypesSupported: string[];
}

const capabilityRegistry = new Map<string, BedrockCapabilities>();

/** Capabilities for a model or inference-profile ID, if discovery has run. */
export function getBedrockCapabilities(
  modelId: string
): BedrockCapabilities | undefined {
  return capabilityRegistry.get(modelId);
}

/** Reset the capability cache (tests, or when the region changes). */
export function clearBedrockModelCache(): void {
  capabilityRegistry.clear();
}

export const DEFAULT_BEDROCK_REGION = "us-east-1";

/** Last-resort list if discovery and the Mantle fallback both fail. */
export const FALLBACK_BEDROCK_MODELS: BedrockModelInfo[] = [
  {
    id: "nvidia.nemotron-super-3-120b",
    name: "NVIDIA · Nemotron 3 Super 120B",
    provider: "NVIDIA",
  },
];

export function runtimeBaseUrl(region: string): string {
  return `https://bedrock-runtime.${region || DEFAULT_BEDROCK_REGION}.amazonaws.com`;
}

function controlBaseUrl(region: string): string {
  return `https://bedrock.${region || DEFAULT_BEDROCK_REGION}.amazonaws.com`;
}

function mantleBaseUrl(region: string): string {
  return `https://bedrock-mantle.${region || DEFAULT_BEDROCK_REGION}.api.aws`;
}

async function fetchJson(
  url: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  const res = await proxyFetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

interface FmSummary {
  modelId?: string;
  modelName?: string;
  providerName?: string;
  inputModalities?: string[];
  outputModalities?: string[];
  responseStreamingSupported?: boolean;
  inferenceTypesSupported?: string[];
  modelLifecycle?: { status?: string };
  explicitPromptCaching?: { isSupported?: boolean };
  inferenceAPIsSupported?: { converse?: { sync?: boolean; streaming?: boolean } };
  converse?: {
    maxTokensMaximum?: number;
    systemRoleSupported?: boolean;
    userImageTypesSupported?: string[];
    reasoningSupported?: unknown;
  };
}

interface ProfileSummary {
  inferenceProfileId?: string;
  status?: string;
  type?: string;
  models?: { modelArn?: string }[];
}

async function listFoundationModels(
  region: string,
  apiKey: string,
  proxy?: boolean,
  signal?: AbortSignal
): Promise<FmSummary[]> {
  const out: FmSummary[] = [];
  let nextToken: string | undefined;
  do {
    const params = new URLSearchParams({ maxResults: "100" });
    if (nextToken) params.set("nextToken", nextToken);
    const url = buildRequestUrl(
      controlBaseUrl(region),
      `/foundation-models?${params.toString()}`,
      proxy
    );
    const data = await fetchJson(url, apiKey, signal);
    out.push(...((data.modelSummaries as FmSummary[]) || []));
    nextToken = data.nextToken as string | undefined;
  } while (nextToken);
  return out;
}

async function listInferenceProfiles(
  region: string,
  apiKey: string,
  proxy?: boolean,
  signal?: AbortSignal
): Promise<ProfileSummary[]> {
  const out: ProfileSummary[] = [];
  let nextToken: string | undefined;
  do {
    const params = new URLSearchParams({ maxResults: "100" });
    if (nextToken) params.set("nextToken", nextToken);
    const url = buildRequestUrl(
      controlBaseUrl(region),
      `/inference-profiles?${params.toString()}`,
      proxy
    );
    const data = await fetchJson(url, apiKey, signal);
    out.push(...((data.inferenceProfileSummaries as ProfileSummary[]) || []));
    nextToken = data.nextToken as string | undefined;
  } while (nextToken);
  return out;
}

function profilePrefix(profileId: string): string {
  const head = profileId.split(".")[0];
  if (["us", "eu", "apac", "jp", "au", "global", "us-gov"].includes(head)) {
    return head.toUpperCase();
  }
  return "";
}

function extractCapabilities(m: FmSummary): BedrockCapabilities {
  return {
    explicitPromptCaching: m.explicitPromptCaching?.isSupported === true,
    reasoning: m.converse?.reasoningSupported != null,
    maxTokensMaximum: m.converse?.maxTokensMaximum,
    systemRoleSupported: m.converse?.systemRoleSupported !== false,
    userImageTypesSupported: m.converse?.userImageTypesSupported ?? [],
  };
}

/** Build the display list from raw control-plane payloads. */
export function buildBedrockModelList(
  models: FmSummary[],
  profiles: ProfileSummary[]
): BedrockModelInfo[] {
  const byId = new Map<string, BedrockModelInfo>();

  const add = (m: BedrockModelInfo) => {
    if (!m.id || byId.has(m.id)) return;
    byId.set(m.id, m);
  };

  for (const m of models) {
    const converse = m.inferenceAPIsSupported?.converse;
    if (!converse?.sync && !converse?.streaming) continue;
    if ((m.modelLifecycle?.status || "").toUpperCase() !== "ACTIVE") continue;
    if (!(m.outputModalities || []).includes("TEXT")) continue;
    const modelId = m.modelId;
    if (!modelId) continue;

    const provider = m.providerName || "";
    const modelName = m.modelName || modelId;
    const baseName = provider ? `${provider} · ${modelName}` : modelName;
    const types = m.inferenceTypesSupported || [];
    const capabilities = extractCapabilities(m);
    capabilityRegistry.set(modelId, capabilities);

    const matching = profiles.filter(
      (p) =>
        (p.status || "ACTIVE").toUpperCase() === "ACTIVE" &&
        (p.models || []).some((mm) => (mm.modelArn || "").endsWith(`/${modelId}`))
    );

    if (types.includes("ON_DEMAND")) {
      add({ id: modelId, name: baseName, provider });
    }

    for (const p of matching) {
      const pid = p.inferenceProfileId;
      if (!pid) continue;
      capabilityRegistry.set(pid, capabilities);
      const prefix = profilePrefix(pid);
      add({
        id: pid,
        name: prefix ? `${baseName} (${prefix})` : `${baseName} (${pid})`,
        provider,
      });
    }

    // If neither on-demand nor a profile matched, still surface the base ID so
    // the user can try it; the API will return a clear error otherwise.
    if (!types.includes("ON_DEMAND") && matching.length === 0) {
      add({ id: modelId, name: baseName, provider });
    }
  }

  return Array.from(byId.values()).sort((a, b) => {
    const p = (a.provider || "").localeCompare(b.provider || "");
    return p !== 0 ? p : a.name.localeCompare(b.name);
  });
}

async function listViaMantle(
  region: string,
  apiKey: string,
  proxy?: boolean,
  signal?: AbortSignal
): Promise<BedrockModelInfo[]> {
  const url = buildRequestUrl(mantleBaseUrl(region), "/v1/models", proxy);
  const data = await fetchJson(url, apiKey, signal);
  const rows = (data.data as { id?: string }[]) || [];
  return rows
    .filter((r) => r.id)
    .map((r) => ({ id: r.id as string, name: r.id as string }));
}

export interface DiscoverOptions {
  apiKey: string;
  region: string;
  proxyRequests?: boolean;
  signal?: AbortSignal;
}

/**
 * Discover Converse-capable models via the control-plane
 * `ListFoundationModels` / `ListInferenceProfiles` APIs (bearer auth), falling
 * back to the Mantle `/v1/models` endpoint and finally a static list.
 */
export async function discoverBedrockModels(
  opts: DiscoverOptions
): Promise<BedrockModelInfo[]> {
  const { apiKey, region, proxyRequests, signal } = opts;
  // Fresh discovery replaces previously cached capabilities.
  capabilityRegistry.clear();

  try {
    const [models, profiles] = await Promise.all([
      listFoundationModels(region, apiKey, proxyRequests, signal),
      listInferenceProfiles(region, apiKey, proxyRequests, signal).catch(
        () => [] as ProfileSummary[]
      ),
    ]);
    const built = buildBedrockModelList(models, profiles);
    if (built.length > 0) return built;
  } catch {
    /* fall through to Mantle */
  }

  try {
    const viaMantle = await listViaMantle(region, apiKey, proxyRequests, signal);
    if (viaMantle.length > 0) return viaMantle;
  } catch {
    /* fall through to static list */
  }

  return FALLBACK_BEDROCK_MODELS;
}
