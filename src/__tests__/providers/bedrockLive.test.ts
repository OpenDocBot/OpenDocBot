import { describe, it, expect } from "vitest";
import {
  discoverBedrockModels,
  getBedrockCapabilities,
} from "../../lib/bedrockModels";
import { BedrockProvider } from "../../providers/bedrock";

/**
 * Live control-plane test. `ListFoundationModels` / `ListInferenceProfiles` are
 * free (no inference), so this never incurs token charges. It only runs when a
 * Bedrock API key is present in the environment.
 */
const API_KEY = process.env.BEDROCK_API_KEY || "";
const REGION = process.env.BEDROCK_REGION || "us-east-1";
const CHEAP_MODEL = process.env.BEDROCK_MODEL || "nvidia.nemotron-super-3-120b";
// Real inference costs money. Opt in explicitly with BEDROCK_LIVE_INFERENCE=1.
const RUN_INFERENCE = process.env.BEDROCK_LIVE_INFERENCE === "1";
const TIMEOUT = 30000;

describe.skipIf(!API_KEY)("Bedrock live discovery", () => {
  it(
    "lists Converse-capable models including the default",
    async () => {
      const models = await discoverBedrockModels({ apiKey: API_KEY, region: REGION });
      expect(models.length).toBeGreaterThan(0);
      expect(models.some((m) => m.id === "nvidia.nemotron-super-3-120b")).toBe(true);
    },
    TIMEOUT
  );

  it(
    "records caching capabilities for a Claude model",
    async () => {
      await discoverBedrockModels({ apiKey: API_KEY, region: REGION });
      const claude = getBedrockCapabilities("anthropic.claude-sonnet-4-6") ??
        getBedrockCapabilities("anthropic.claude-haiku-4-5-20251001-v1:0");
      expect(claude?.explicitPromptCaching).toBe(true);
    },
    TIMEOUT
  );

  it(
    "records no caching for the default Nemotron model",
    async () => {
      await discoverBedrockModels({ apiKey: API_KEY, region: REGION });
      const nemotron = getBedrockCapabilities("nvidia.nemotron-super-3-120b");
      expect(nemotron?.explicitPromptCaching).toBe(false);
    },
    TIMEOUT
  );
});

/**
 * Real inference (costs money, opt-in). Uses the cheapest configured model and
 * a tiny output budget. Run with:
 *   BEDROCK_LIVE_INFERENCE=1 npx vitest run src/__tests__/providers/bedrockLive.test.ts
 */
describe.skipIf(!API_KEY || !RUN_INFERENCE)("Bedrock live inference", () => {
  const provider = new BedrockProvider();
  const options = { apiKey: API_KEY, model: CHEAP_MODEL, region: REGION, maxTokens: 16 };

  it(
    "answers a non-streaming Converse request",
    async () => {
      const res = await provider.chat([{ role: "user", content: "Reply with the word OK." }], [], options);
      expect(res.finishReason === "stop" || res.finishReason === "length").toBe(true);
      expect(res.usage?.promptTokens).toBeGreaterThan(0);
    },
    TIMEOUT
  );

  it(
    "streams a Converse response",
    async () => {
      const tokens: string[] = [];
      let finished: string | null = null;
      await provider.chatStream(
        [{ role: "user", content: "Reply with the word OK." }],
        (t) => tokens.push(t),
        () => {},
        [],
        options,
        undefined,
        (info) => { finished = info.finishReason; }
      );
      expect(finished).toBeTruthy();
      expect(tokens.join("").length).toBeGreaterThan(0);
    },
    TIMEOUT
  );
});
