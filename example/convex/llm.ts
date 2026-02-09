import { mutation, query } from "./_generated/server";
import { components } from "./_generated/api";
import { LLMCache } from "@mzedstudio/llm-cache";
import { v } from "convex/values";

const cache = new LLMCache(components.llmCache);

// ---------------------------------------------------------------------------
// Query wrappers
// ---------------------------------------------------------------------------

export const queryEntries = query({
  args: {
    model: v.optional(v.string()),
    tag: v.optional(v.string()),
    after: v.optional(v.number()),
    before: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await cache.query(ctx, args);
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    return await cache.getStats(ctx);
  },
});

export const getConfig = query({
  args: {},
  handler: async (ctx) => {
    return await cache.getConfig(ctx);
  },
});

export const getEntry = query({
  args: { cacheKey: v.string() },
  handler: async (ctx, args) => {
    return await cache.get(ctx, args);
  },
});

export const getHistory = query({
  args: { request: v.any() },
  handler: async (ctx, args) => {
    return await cache.history(ctx, { request: args.request });
  },
});

// ---------------------------------------------------------------------------
// Mutation wrappers
// ---------------------------------------------------------------------------

export const updateConfig = mutation({
  args: {
    config: v.object({
      defaultTtlMs: v.optional(v.number()),
      promotionTtlMs: v.optional(v.number()),
      ttlByModel: v.optional(v.any()),
      ttlByTag: v.optional(v.any()),
      normalizeRequests: v.optional(v.boolean()),
      maxEntries: v.optional(v.number()),
    }),
    replace: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    return await cache.setConfig(ctx, args);
  },
});

export const invalidateEntries = mutation({
  args: {
    cacheKey: v.optional(v.string()),
    model: v.optional(v.string()),
    modelVersion: v.optional(v.string()),
    tag: v.optional(v.string()),
    before: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await cache.invalidate(ctx, args);
  },
});
