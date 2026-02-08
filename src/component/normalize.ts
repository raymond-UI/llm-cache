/**
 * Request normalization and deterministic cache key generation.
 * Pure functions — no Convex function exports.
 */

/** Round a number to 2 decimal places. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Recursively sort object keys and normalize values. */
function sortedClone(value: unknown, normalize: boolean): unknown {
  if (value === null || value === undefined) return undefined;

  if (Array.isArray(value)) {
    return value.map((item) => sortedClone(item, normalize));
  }

  if (typeof value === "number" && normalize) {
    return round2(value);
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(obj).sort();
    for (const key of keys) {
      const v = obj[key];
      if (v === undefined || v === null) continue;
      sorted[key] = sortedClone(v, normalize);
    }
    return sorted;
  }

  return value;
}

/**
 * Normalize an LLM request for deterministic cache key generation.
 *
 * When `shouldNormalize` is true:
 * - Trims whitespace from message content
 * - Lowercases model name
 * - Rounds floating-point params to 2 decimal places
 * - Strips null/undefined fields
 * - Sorts object keys alphabetically
 *
 * When false, only sorts keys and strips null/undefined (for deterministic serialization).
 */
export function normalizeRequest(
  request: Record<string, unknown>,
  shouldNormalize: boolean = true,
): Record<string, unknown> {
  // Deep clone with sorted keys and null stripping
  const cleaned = sortedClone(request, shouldNormalize) as Record<
    string,
    unknown
  >;

  if (!shouldNormalize) return cleaned;

  // Lowercase model name
  if (typeof cleaned.model === "string") {
    cleaned.model = cleaned.model.toLowerCase();
  }

  // Trim whitespace from message content
  if (Array.isArray(cleaned.messages)) {
    cleaned.messages = cleaned.messages.map((msg: unknown) => {
      if (typeof msg === "object" && msg !== null) {
        const m = msg as Record<string, unknown>;
        if (typeof m.content === "string") {
          return { ...m, content: m.content.trim() };
        }
      }
      return msg;
    });
  }

  return cleaned;
}

/** Deterministic JSON serialization with sorted keys. */
function sortedStringify(value: unknown): string {
  if (value === null || value === undefined) return "";

  if (typeof value !== "object") return JSON.stringify(value);

  if (Array.isArray(value)) {
    const items = value.map((item) => sortedStringify(item));
    return "[" + items.join(",") + "]";
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const pairs = keys
    .filter((k) => obj[k] !== undefined)
    .map((k) => JSON.stringify(k) + ":" + sortedStringify(obj[k]));
  return "{" + pairs.join(",") + "}";
}

/**
 * Generate a deterministic SHA-256 cache key from an LLM request.
 * Uses Web Crypto API (available in Convex's V8 runtime).
 */
export async function generateCacheKey(
  request: Record<string, unknown>,
  shouldNormalize: boolean = true,
): Promise<string> {
  const normalized = normalizeRequest(request, shouldNormalize);
  const serialized = sortedStringify(normalized);

  const encoder = new TextEncoder();
  const data = encoder.encode(serialized);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray, (b) => b.toString(16).padStart(2, "0")).join("");
}
