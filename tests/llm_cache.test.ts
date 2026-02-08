import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../src/component/schema";

const modules = import.meta.glob("../src/component/**/*.ts");

function makeTest() {
  return convexTest(schema, modules);
}

// Helper: a basic LLM request
function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    messages: [{ role: "user", content: "Hello" }],
    model: "gpt-4o",
    temperature: 0.7,
    ...overrides,
  };
}

describe("LLM Cache Component", () => {
  // ─── Core cache operations ────────────────────────────────────

  test("store and lookup round-trip", async () => {
    const t = makeTest();
    const request = makeRequest();
    const response = { choices: [{ message: { content: "Hi!" } }] };

    const cacheKey = await t.mutation("cache:store", {
      request,
      response,
      tags: ["chat"],
    });

    expect(cacheKey).toBeTypeOf("string");
    expect(cacheKey.length).toBe(64); // SHA-256 hex

    const cached = await t.query("cache:lookup", { request });
    expect(cached).not.toBeNull();
    expect(cached!.response).toEqual(response);
    expect(cached!.model).toBe("gpt-4o");
    expect(cached!.hitCount).toBe(0);
    expect(cached!.ttlTier).toBe(0);
    expect(cached!.tags).toEqual(["chat"]);
  });

  test("cache miss returns null", async () => {
    const t = makeTest();
    const result = await t.query("cache:lookup", {
      request: makeRequest({ model: "nonexistent" }),
    });
    expect(result).toBeNull();
  });

  test("get by cacheKey", async () => {
    const t = makeTest();
    const request = makeRequest();
    const response = { result: "ok" };

    const cacheKey = await t.mutation("cache:store", { request, response });
    const entry = await t.query("cache:get", { cacheKey });

    expect(entry).not.toBeNull();
    expect(entry!.cacheKey).toBe(cacheKey);
    expect(entry!.response).toEqual(response);
  });

  test("store upserts on same request", async () => {
    const t = makeTest();
    const request = makeRequest();

    const key1 = await t.mutation("cache:store", {
      request,
      response: { v: 1 },
    });
    const key2 = await t.mutation("cache:store", {
      request,
      response: { v: 2 },
    });

    expect(key1).toBe(key2);

    const entry = await t.query("cache:get", { cacheKey: key1 });
    expect(entry!.response).toEqual({ v: 2 });
  });

  // ─── Deterministic keys ───────────────────────────────────────

  test("same request produces same cache key", async () => {
    const t = makeTest();
    const request = makeRequest();

    const key1 = await t.mutation("cache:store", {
      request,
      response: { a: 1 },
    });
    // Store again with same request but different response
    const key2 = await t.mutation("cache:store", {
      request,
      response: { a: 2 },
    });

    expect(key1).toBe(key2);
  });

  // ─── Normalization ────────────────────────────────────────────

  test("normalization: whitespace trimming", async () => {
    const t = makeTest();

    const key1 = await t.mutation("cache:store", {
      request: makeRequest({
        messages: [{ role: "user", content: "  Hello  " }],
      }),
      response: { r: 1 },
    });

    const key2 = await t.mutation("cache:store", {
      request: makeRequest({
        messages: [{ role: "user", content: "Hello" }],
      }),
      response: { r: 2 },
    });

    expect(key1).toBe(key2);
  });

  test("normalization: key order independence", async () => {
    const t = makeTest();

    const key1 = await t.mutation("cache:store", {
      request: {
        model: "gpt-4o",
        temperature: 0.7,
        messages: [{ role: "user", content: "Hi" }],
      },
      response: { r: 1 },
    });

    const key2 = await t.mutation("cache:store", {
      request: {
        messages: [{ role: "user", content: "Hi" }],
        temperature: 0.7,
        model: "gpt-4o",
      },
      response: { r: 2 },
    });

    expect(key1).toBe(key2);
  });

  test("normalization: model name case insensitive", async () => {
    const t = makeTest();

    const key1 = await t.mutation("cache:store", {
      request: makeRequest({ model: "GPT-4o" }),
      response: { r: 1 },
    });

    const key2 = await t.mutation("cache:store", {
      request: makeRequest({ model: "gpt-4o" }),
      response: { r: 2 },
    });

    expect(key1).toBe(key2);
  });

  test("normalization: float rounding", async () => {
    const t = makeTest();

    const key1 = await t.mutation("cache:store", {
      request: makeRequest({ temperature: 0.7000001 }),
      response: { r: 1 },
    });

    const key2 = await t.mutation("cache:store", {
      request: makeRequest({ temperature: 0.7 }),
      response: { r: 2 },
    });

    expect(key1).toBe(key2);
  });

  test("normalization disabled via config", async () => {
    const t = makeTest();

    // Disable normalization
    await t.mutation("config:setConfig", {
      config: { normalizeRequests: false },
    });

    // With normalization off, case matters
    const key1 = await t.mutation("cache:store", {
      request: makeRequest({ model: "GPT-4o" }),
      response: { r: 1 },
    });

    const key2 = await t.mutation("cache:store", {
      request: makeRequest({ model: "gpt-4o" }),
      response: { r: 2 },
    });

    expect(key1).not.toBe(key2);
  });

  // ─── TTL Tier Promotion ───────────────────────────────────────

  test("incrementHitCount promotes tier 0 to tier 1", async () => {
    const t = makeTest();
    const request = makeRequest();

    const cacheKey = await t.mutation("cache:store", {
      request,
      response: { r: 1 },
    });

    // Before increment
    let entry = await t.query("cache:get", { cacheKey });
    expect(entry!.ttlTier).toBe(0);
    expect(entry!.hitCount).toBe(0);

    // Increment (simulates what the client wrapper does after lookup)
    await t.mutation("cache:incrementHitCount", { cacheKey });

    entry = await t.query("cache:get", { cacheKey });
    expect(entry!.ttlTier).toBe(1);
    expect(entry!.hitCount).toBe(1);
  });

  test("incrementHitCount refreshes tier 1 expiry", async () => {
    const t = makeTest();
    const request = makeRequest();

    const cacheKey = await t.mutation("cache:store", {
      request,
      response: { r: 1 },
    });

    // First hit: promote to tier 1
    await t.mutation("cache:incrementHitCount", { cacheKey });

    let entry = await t.query("cache:get", { cacheKey });
    const firstExpiry = entry!.expiresAt;

    // Second hit: refresh tier 1 expiry
    await t.mutation("cache:incrementHitCount", { cacheKey });

    entry = await t.query("cache:get", { cacheKey });
    expect(entry!.ttlTier).toBe(1);
    expect(entry!.hitCount).toBe(2);
    // expiresAt should be refreshed (equal or later)
    expect(entry!.expiresAt).toBeGreaterThanOrEqual(firstExpiry!);
  });

  test("pinned entries have no expiration", async () => {
    const t = makeTest();
    const request = makeRequest();

    const cacheKey = await t.mutation("cache:store", {
      request,
      response: { r: 1 },
      pin: true,
    });

    const entry = await t.query("cache:get", { cacheKey });
    expect(entry!.ttlTier).toBe(2);
    expect(entry!.expiresAt).toBeUndefined();
  });

  test("pinned entries are not affected by incrementHitCount", async () => {
    const t = makeTest();
    const request = makeRequest();

    const cacheKey = await t.mutation("cache:store", {
      request,
      response: { r: 1 },
      pin: true,
    });

    await t.mutation("cache:incrementHitCount", { cacheKey });

    const entry = await t.query("cache:get", { cacheKey });
    expect(entry!.ttlTier).toBe(2);
    expect(entry!.expiresAt).toBeUndefined();
    expect(entry!.hitCount).toBe(1);
  });

  // ─── TTL Overrides ────────────────────────────────────────────

  test("TTL by model override", async () => {
    const t = makeTest();
    const oneHour = 60 * 60 * 1000;

    await t.mutation("config:setConfig", {
      config: { ttlByModel: { "gpt-4o": oneHour } },
    });

    const cacheKey = await t.mutation("cache:store", {
      request: makeRequest(),
      response: { r: 1 },
    });

    const entry = await t.query("cache:get", { cacheKey });
    const expectedMin = Date.now() + oneHour - 5000;
    const expectedMax = Date.now() + oneHour + 5000;
    expect(entry!.expiresAt).toBeGreaterThan(expectedMin);
    expect(entry!.expiresAt).toBeLessThan(expectedMax);
  });

  test("TTL by tag override takes priority over model", async () => {
    const t = makeTest();
    const twoHours = 2 * 60 * 60 * 1000;
    const oneHour = 60 * 60 * 1000;

    await t.mutation("config:setConfig", {
      config: {
        ttlByModel: { "gpt-4o": oneHour },
        ttlByTag: { important: twoHours },
      },
    });

    const cacheKey = await t.mutation("cache:store", {
      request: makeRequest(),
      response: { r: 1 },
      tags: ["important"],
    });

    const entry = await t.query("cache:get", { cacheKey });
    // Should use tag TTL (2 hours), not model TTL (1 hour)
    const expectedMin = Date.now() + twoHours - 5000;
    expect(entry!.expiresAt).toBeGreaterThan(expectedMin);
  });

  // ─── Expired entry handling ───────────────────────────────────

  test("expired entry returns null on lookup", async () => {
    const t = makeTest();

    // Set a very short TTL
    await t.mutation("config:setConfig", {
      config: { defaultTtlMs: 1 },
    });

    await t.mutation("cache:store", {
      request: makeRequest(),
      response: { r: 1 },
    });

    // Wait briefly to ensure expiration
    await new Promise((resolve) => setTimeout(resolve, 10));

    const result = await t.query("cache:lookup", {
      request: makeRequest(),
    });
    expect(result).toBeNull();
  });

  // ─── Query functions ──────────────────────────────────────────

  test("query by model", async () => {
    const t = makeTest();

    await t.mutation("cache:store", {
      request: makeRequest({ model: "gpt-4o" }),
      response: { r: 1 },
    });
    await t.mutation("cache:store", {
      request: makeRequest({ model: "claude-sonnet" }),
      response: { r: 2 },
    });

    const results = await t.query("queries:queryEntries", {
      model: "gpt-4o",
    });

    expect(results.length).toBe(1);
    expect(results[0].model).toBe("gpt-4o");
  });

  test("query by tag", async () => {
    const t = makeTest();

    await t.mutation("cache:store", {
      request: makeRequest({ model: "a" }),
      response: { r: 1 },
      tags: ["chat"],
    });
    await t.mutation("cache:store", {
      request: makeRequest({ model: "b" }),
      response: { r: 2 },
      tags: ["summarize"],
    });

    const results = await t.query("queries:queryEntries", {
      tag: "chat",
    });

    expect(results.length).toBe(1);
    expect(results[0].tags).toContain("chat");
  });

  test("query by time range", async () => {
    const t = makeTest();
    const now = Date.now();

    await t.mutation("cache:store", {
      request: makeRequest({ model: "m1" }),
      response: { r: 1 },
    });

    const results = await t.query("queries:queryEntries", {
      after: now - 60000,
      before: now + 60000,
    });

    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  test("query respects limit", async () => {
    const t = makeTest();

    // Store 5 entries
    for (let i = 0; i < 5; i++) {
      await t.mutation("cache:store", {
        request: makeRequest({ model: `model-${i}` }),
        response: { i },
      });
    }

    const results = await t.query("queries:queryEntries", { limit: 3 });
    expect(results.length).toBe(3);
  });

  test("history returns entries for a request", async () => {
    const t = makeTest();
    const request = makeRequest();

    await t.mutation("cache:store", { request, response: { v: 1 } });

    const entries = await t.query("queries:history", { request });
    expect(entries.length).toBe(1);
    expect(entries[0].request).toEqual(request);
  });

  // ─── Invalidation ─────────────────────────────────────────────

  test("invalidate by cacheKey", async () => {
    const t = makeTest();
    const request = makeRequest();

    const cacheKey = await t.mutation("cache:store", {
      request,
      response: { r: 1 },
    });

    const count = await t.mutation("manage:invalidate", { cacheKey });
    expect(count).toBe(1);

    const entry = await t.query("cache:get", { cacheKey });
    expect(entry).toBeNull();
  });

  test("invalidate by model", async () => {
    const t = makeTest();

    await t.mutation("cache:store", {
      request: makeRequest({ model: "gpt-4o" }),
      response: { r: 1 },
    });
    await t.mutation("cache:store", {
      request: makeRequest({ model: "gpt-4o", temperature: 0.5 }),
      response: { r: 2 },
    });
    await t.mutation("cache:store", {
      request: makeRequest({ model: "claude-sonnet" }),
      response: { r: 3 },
    });

    const count = await t.mutation("manage:invalidate", { model: "gpt-4o" });
    expect(count).toBe(2);

    const stats = await t.query("config:getStats", {});
    expect(stats.totalEntries).toBe(1);
  });

  test("invalidate by modelVersion", async () => {
    const t = makeTest();

    await t.mutation("cache:store", {
      request: makeRequest({ model: "gpt-4o" }),
      response: { r: 1 },
      modelVersion: "v1",
    });
    await t.mutation("cache:store", {
      request: makeRequest({ model: "gpt-4o", temperature: 0.5 }),
      response: { r: 2 },
      modelVersion: "v2",
    });

    const count = await t.mutation("manage:invalidate", {
      modelVersion: "v1",
    });
    expect(count).toBe(1);
  });

  test("invalidate by tag", async () => {
    const t = makeTest();

    await t.mutation("cache:store", {
      request: makeRequest({ model: "a" }),
      response: { r: 1 },
      tags: ["chat"],
    });
    await t.mutation("cache:store", {
      request: makeRequest({ model: "b" }),
      response: { r: 2 },
      tags: ["summarize"],
    });

    const count = await t.mutation("manage:invalidate", { tag: "chat" });
    expect(count).toBe(1);
  });

  // ─── Cleanup ──────────────────────────────────────────────────

  test("cleanup removes only expired entries", async () => {
    const t = makeTest();

    // Store one with very short TTL
    await t.mutation("config:setConfig", {
      config: { defaultTtlMs: 1 },
    });
    await t.mutation("cache:store", {
      request: makeRequest({ model: "expired" }),
      response: { r: 1 },
    });

    // Store one with normal TTL
    await t.mutation("config:setConfig", {
      config: { defaultTtlMs: 24 * 60 * 60 * 1000 },
    });
    await t.mutation("cache:store", {
      request: makeRequest({ model: "fresh" }),
      response: { r: 2 },
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    const result = await t.action("cleanup:cleanup", {});
    expect(result.deletedCount).toBe(1);
    expect(result.keys.length).toBe(1);

    const stats = await t.query("config:getStats", {});
    expect(stats.totalEntries).toBe(1);
  });

  test("cleanup dry run reports without deleting", async () => {
    const t = makeTest();

    await t.mutation("config:setConfig", {
      config: { defaultTtlMs: 1 },
    });
    await t.mutation("cache:store", {
      request: makeRequest(),
      response: { r: 1 },
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    const result = await t.action("cleanup:cleanup", { dryRun: true });
    expect(result.deletedCount).toBe(0);
    expect(result.keys.length).toBe(1);

    // Entry should still exist
    const stats = await t.query("config:getStats", {});
    expect(stats.totalEntries).toBe(1);
  });

  // ─── Config ───────────────────────────────────────────────────

  test("setConfig and getConfig round-trip", async () => {
    const t = makeTest();

    await t.mutation("config:setConfig", {
      config: {
        defaultTtlMs: 3600000,
        normalizeRequests: false,
        maxEntries: 100,
      },
    });

    const config = await t.query("config:getConfig", {});
    expect(config.defaultTtlMs).toBe(3600000);
    expect(config.normalizeRequests).toBe(false);
    expect(config.maxEntries).toBe(100);
  });

  test("setConfig merge mode preserves existing fields", async () => {
    const t = makeTest();

    await t.mutation("config:setConfig", {
      config: { defaultTtlMs: 1000, maxEntries: 50 },
    });

    // Merge: only update defaultTtlMs
    await t.mutation("config:setConfig", {
      config: { defaultTtlMs: 2000 },
    });

    const config = await t.query("config:getConfig", {});
    expect(config.defaultTtlMs).toBe(2000);
    expect(config.maxEntries).toBe(50); // preserved
  });

  test("setConfig replace mode clears unset fields", async () => {
    const t = makeTest();

    await t.mutation("config:setConfig", {
      config: { defaultTtlMs: 1000, maxEntries: 50 },
    });

    // Replace: only defaultTtlMs is set
    await t.mutation("config:setConfig", {
      config: { defaultTtlMs: 2000 },
      replace: true,
    });

    const config = await t.query("config:getConfig", {});
    expect(config.defaultTtlMs).toBe(2000);
    expect(config.maxEntries).toBeUndefined();
  });

  // ─── Stats ────────────────────────────────────────────────────

  test("getStats returns accurate counts", async () => {
    const t = makeTest();

    await t.mutation("cache:store", {
      request: makeRequest({ model: "gpt-4o" }),
      response: { r: 1 },
    });
    await t.mutation("cache:store", {
      request: makeRequest({ model: "gpt-4o", temperature: 0.5 }),
      response: { r: 2 },
    });
    await t.mutation("cache:store", {
      request: makeRequest({ model: "claude-sonnet" }),
      response: { r: 3 },
    });

    // Simulate some hits
    const entries = await t.query("queries:queryEntries", {});
    await t.mutation("cache:incrementHitCount", {
      cacheKey: entries[0].cacheKey,
    });
    await t.mutation("cache:incrementHitCount", {
      cacheKey: entries[0].cacheKey,
    });

    const stats = await t.query("config:getStats", {});
    expect(stats.totalEntries).toBe(3);
    expect(stats.totalHits).toBe(2);
    expect(stats.entriesByModel["gpt-4o"]).toBe(2);
    expect(stats.entriesByModel["claude-sonnet"]).toBe(1);
  });

  // ─── Model version filtering ──────────────────────────────────

  test("query time range excludes entries outside bounds", async () => {
    const t = makeTest();

    // Store 3 entries with forced time separation
    await t.mutation("cache:store", {
      request: makeRequest({ model: "t1" }),
      response: { r: "old" },
    });
    await t.mutation("cache:store", {
      request: makeRequest({ model: "t2" }),
      response: { r: "mid" },
    });
    await t.mutation("cache:store", {
      request: makeRequest({ model: "t3" }),
      response: { r: "new" },
    });

    // Get all entries to know their createdAt timestamps
    const all = await t.query("queries:queryEntries", {});
    expect(all.length).toBe(3);

    // Query with before = newest entry's createdAt (should exclude the newest)
    const withBefore = await t.query("queries:queryEntries", {
      before: all[0].createdAt, // desc order, so all[0] is newest
    });
    // Should not include the newest entry
    for (const entry of withBefore) {
      expect(entry.createdAt).toBeLessThan(all[0].createdAt);
    }

    // Query with after = oldest entry's createdAt (should exclude the oldest)
    const withAfter = await t.query("queries:queryEntries", {
      after: all[all.length - 1].createdAt, // oldest
    });
    for (const entry of withAfter) {
      expect(entry.createdAt).toBeGreaterThan(all[all.length - 1].createdAt);
    }
  });

  test("model name stored normalized for consistent querying", async () => {
    const t = makeTest();

    // Store with uppercase model
    await t.mutation("cache:store", {
      request: makeRequest({ model: "GPT-4O" }),
      response: { r: 1 },
    });

    // Query by lowercase model should find it (normalization lowercases)
    const results = await t.query("queries:queryEntries", {
      model: "gpt-4o",
    });
    expect(results.length).toBe(1);

    // Stats should show lowercase model name
    const stats = await t.query("config:getStats", {});
    expect(stats.entriesByModel["gpt-4o"]).toBe(1);
    expect(stats.entriesByModel["GPT-4O"]).toBeUndefined();
  });

  // ─── Model version filtering ──────────────────────────────────

  test("lookup with modelVersion filters mismatches", async () => {
    const t = makeTest();
    const request = makeRequest();

    await t.mutation("cache:store", {
      request,
      response: { r: 1 },
      modelVersion: "v1",
    });

    // Lookup with matching version
    const hit = await t.query("cache:lookup", {
      request,
      modelVersion: "v1",
    });
    expect(hit).not.toBeNull();

    // Lookup with different version
    const miss = await t.query("cache:lookup", {
      request,
      modelVersion: "v2",
    });
    expect(miss).toBeNull();
  });
});
