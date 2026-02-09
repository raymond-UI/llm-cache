import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { cacheEntryValidator } from "./types";
import { generateCacheKey } from "./normalize";
import { loadConfig, computeExpiresAt, DEFAULT_PROMOTION_TTL_MS } from "./config";

/**
 * Look up a cached response by request params.
 * Returns the cached entry or null. Does NOT increment hit count
 * (the client wrapper handles that via a separate incrementHitCount call).
 */
export const lookup = query({
  args: {
    request: v.any(),
    modelVersion: v.optional(v.string()),
  },
  returns: v.union(cacheEntryValidator, v.null()),
  handler: async (ctx, args) => {
    const config = await loadConfig(ctx);
    const cacheKey = await generateCacheKey(
      args.request as Record<string, unknown>,
      config.normalizeRequests !== false,
    );

    const entry = await ctx.db
      .query("cachedResponses")
      .withIndex("by_cacheKey", (q) => q.eq("cacheKey", cacheKey))
      .unique();

    if (!entry) return null;

    // Check expiration
    if (entry.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
      return null;
    }

    // Check model version if specified
    if (args.modelVersion && entry.modelVersion !== args.modelVersion) {
      return null;
    }

    return entry;
  },
});

/**
 * Increment hit count and promote TTL tier on cache hit.
 * Called by the client wrapper after a successful lookup.
 */
export const incrementHitCount = mutation({
  args: {
    cacheKey: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const entry = await ctx.db
      .query("cachedResponses")
      .withIndex("by_cacheKey", (q) => q.eq("cacheKey", args.cacheKey))
      .unique();

    if (!entry) return null;

    const config = await loadConfig(ctx);
    const now = Date.now();
    const promotionTtl = config.promotionTtlMs ?? DEFAULT_PROMOTION_TTL_MS;

    const patch: Record<string, unknown> = {
      hitCount: entry.hitCount + 1,
      lastAccessedAt: now,
    };

    // TTL tier promotion
    if (entry.ttlTier === 0) {
      // Default → Promoted
      patch.ttlTier = 1;
      patch.expiresAt = now + promotionTtl;
    } else if (entry.ttlTier === 1) {
      // Promoted → refresh expiry
      patch.expiresAt = now + promotionTtl;
    }
    // Tier 2 (pinned) — no change

    await ctx.db.patch(entry._id, patch as any);
    return null;
  },
});

/**
 * Store an LLM response in the cache.
 * If an entry with the same cache key exists, it is updated (upsert).
 * Returns the cache key.
 */
export const store = mutation({
  args: {
    request: v.any(),
    response: v.any(),
    tags: v.optional(v.array(v.string())),
    metadata: v.optional(v.any()),
    pin: v.optional(v.boolean()),
    modelVersion: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const config = await loadConfig(ctx);
    const shouldNormalize = config.normalizeRequests !== false;
    const cacheKey = await generateCacheKey(
      args.request as Record<string, unknown>,
      shouldNormalize,
    );
    const now = Date.now();

    const rawModel =
      (args.request as Record<string, unknown>)?.model?.toString() ?? "unknown";
    const model = shouldNormalize ? rawModel.toLowerCase() : rawModel;

    const ttlTier = args.pin ? 2 : 0;
    const expiresAt = args.pin
      ? undefined
      : computeExpiresAt({ now, model, tags: args.tags, config });

    // Upsert by cacheKey
    const existing = await ctx.db
      .query("cachedResponses")
      .withIndex("by_cacheKey", (q) => q.eq("cacheKey", cacheKey))
      .unique();

    if (existing) {
      // Archive old response to history if it changed
      const oldJson = JSON.stringify(existing.response);
      const newJson = JSON.stringify(args.response);
      if (oldJson !== newJson) {
        await ctx.db.insert("responseHistory", {
          cacheKey,
          request: existing.request,
          response: existing.response,
          model: existing.model,
          modelVersion: existing.modelVersion,
          tags: existing.tags,
          metadata: existing.metadata,
          storedAt: existing.createdAt,
        });
      }

      await ctx.db.patch(existing._id, {
        response: args.response,
        modelVersion: args.modelVersion,
        tags: args.tags,
        metadata: args.metadata,
        ttlTier,
        expiresAt,
        lastAccessedAt: now,
      });
      return cacheKey;
    }

    await ctx.db.insert("cachedResponses", {
      cacheKey,
      request: args.request,
      response: args.response,
      model,
      modelVersion: args.modelVersion,
      hitCount: 0,
      ttlTier,
      expiresAt,
      createdAt: now,
      lastAccessedAt: now,
      tags: args.tags,
      metadata: args.metadata,
    });

    return cacheKey;
  },
});

/**
 * Get a cache entry by its cache key (direct lookup, no hit counting).
 */
export const get = query({
  args: {
    cacheKey: v.string(),
  },
  returns: v.union(cacheEntryValidator, v.null()),
  handler: async (ctx, args) => {
    const entry = await ctx.db
      .query("cachedResponses")
      .withIndex("by_cacheKey", (q) => q.eq("cacheKey", args.cacheKey))
      .unique();

    return entry ?? null;
  },
});
