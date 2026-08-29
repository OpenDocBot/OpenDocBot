/**
 * Gemini context caching helper.
 * Uses Google's cachedContents API to reduce input token costs.
 *
 * Pricing model (Gemini 3.x):
 *  - Standard input:      ~$1.50/M tokens
 *  - Cached read:         ~$0.15/M tokens
 *  - Cache storage:       ~$1.00/M tokens per hour
 *
 * The cache is rebuilt when the estimated uncached delta grows past a
 * configurable token threshold. Because storage is billed per token-hour,
 * a 1h TTL keeps idle-storage costs bounded while covering typical sessions.
 */

import { debugLog } from "./debugLog";

export const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
export const DEFAULT_RECACHE_THRESHOLD = 2000; // estimated delta tokens before rebuild
const MIN_CACHE_TOKENS = 1024; // Gemini requires caches of at least 1024 tokens

interface GeminiMessage {
  role: string;
  parts: Array<Record<string, unknown>>;
}

interface CachedContentsRequest {
  model: string;
  contents: GeminiMessage[];
  systemInstruction?: { parts: Array<{ text: string }> };
  tools?: Array<{ functionDeclarations: unknown[] }>;
  ttl: string;
}

interface CachedContentsResponse {
  name: string; // e.g. "cachedContents/abc123"
  model: string;
  createTime: string;
  updateTime: string;
  expireTime: string;
}

export class GeminiCache {
  private cacheId: string | null = null;
  private cachedMessageCount = 0;
  private cachedTokenCount = 0;
  private model: string | null = null;
  private apiKey = "";
  private baseUrl = "";
  private threshold = DEFAULT_RECACHE_THRESHOLD;
  private expireAt = 0;
  /** Fingerprint of the systemInstruction + tools baked into the cached resource. */
  private systemFingerprint: string | null = null;

  reset(): void {
    if (this.cacheId) {
      this.deleteCache().catch(() => {});
    }
    this.cacheId = null;
    this.cachedMessageCount = 0;
    this.cachedTokenCount = 0;
    this.model = null;
    this.expireAt = 0;
    this.systemFingerprint = null;
  }

  /**
   * Drop cache state without a network call. Used when the cached resource
   * is known to be expired/evicted server-side; the next request then
   * recreates the cache through the new-conversation path.
   */
  invalidate(): void {
    this.cacheId = null;
    this.cachedMessageCount = 0;
    this.cachedTokenCount = 0;
    this.expireAt = 0;
    this.systemFingerprint = null;
  }

  setRecacheThreshold(value: number): void {
    this.threshold = Math.max(MIN_CACHE_TOKENS, value);
  }

  setConfig(apiKey: string, baseUrl?: string): void {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl || "https://generativelanguage.googleapis.com/v1beta";
  }

  getCacheId(): string | null {
    return this.cacheId;
  }

  getCachedMessageCount(): number {
    return this.cachedMessageCount;
  }

  /** Fingerprint of the systemInstruction + tools the cache was created with. */
  getSystemFingerprint(): string | null {
    return this.systemFingerprint;
  }

  isExpired(): boolean {
    return this.cacheId !== null && this.expireAt > 0 && Date.now() >= this.expireAt;
  }

  private async deleteCache(keepalive = false): Promise<void> {
    if (!this.cacheId) return;
    try {
      await fetch(`${this.baseUrl}/${this.cacheId}`, {
        method: "DELETE",
        headers: { "x-goog-api-key": this.apiKey },
        keepalive,
      });
      debugLog("info", `Gemini cache deleted: ${this.cacheId}`);
    } catch {
      // best effort cleanup
    }
    this.cacheId = null;
  }

  /**
   * Fire-and-forget delete of the remote cache that survives page unload
   * (taskpane close). Used to stop idle-storage billing once the in-memory
   * conversation is gone.
   */
  flushRemote(): void {
    void this.deleteCache(true);
  }

  isNewConversation(messagesLength: number): boolean {
    // New conversation: only 2 messages (system + user) or cache was reset
    return messagesLength <= 2 || !this.cacheId || this.model === null;
  }

  shouldRecreateCache(currentTokenEstimate: number): boolean {
    if (!this.cacheId) return false;
    if (this.isExpired()) return false;
    return currentTokenEstimate - this.cachedTokenCount >= this.threshold;
  }

  async createOrUpdateCache(
    model: string,
    systemInstruction: { parts: Array<{ text: string }> } | null,
    contents: GeminiMessage[],
    tools: Array<{ functionDeclarations: unknown[] }> | null,
    tokenEstimate: number,
  ): Promise<string | null> {
    // Only cache if there's enough content (system + tools + at least 1 message)
    if (contents.length === 0) return null;

    try {
      // Delete old cache first
      if (this.cacheId) {
        await this.deleteCache();
      }

      const body: CachedContentsRequest = {
        model: `models/${model}`,
        contents,
        ttl: `${CACHE_TTL_MS / 1000}s`,
      };

      if (systemInstruction) {
        body.systemInstruction = systemInstruction;
      }
      if (tools && tools.length > 0) {
        body.tools = tools;
      }

      const res = await fetch(`${this.baseUrl}/cachedContents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => `${res.status}`);
        // "Too small" is expected — skip caching for short conversations
        if (errText.includes("too small")) {
          debugLog("info", `Gemini cache skipped: content too small (< 1024 tokens)`);
        } else {
          debugLog("warn", `Gemini cache create failed (${res.status}): ${errText.slice(0, 200)}`);
        }
        // Reset cache state to avoid stale references
        this.cacheId = null;
        this.cachedMessageCount = 0;
        this.cachedTokenCount = 0;
        this.expireAt = 0;
        this.systemFingerprint = null;
        return null;
      }

      const data = (await res.json()) as CachedContentsResponse;
      this.cacheId = data.name;
      this.cachedMessageCount = contents.length;
      this.cachedTokenCount = tokenEstimate;
      this.model = model;
      this.systemFingerprint = JSON.stringify({ systemInstruction, tools });

      const parsedExpiry = data.expireTime ? Date.parse(data.expireTime) : NaN;
      this.expireAt = Number.isFinite(parsedExpiry) ? parsedExpiry : Date.now() + CACHE_TTL_MS;

      debugLog("info", `Gemini cache created: ${data.name} (${contents.length} messages, ~${tokenEstimate} tokens)`);
      return data.name;
    } catch {
      return null;
    }
  }
}
