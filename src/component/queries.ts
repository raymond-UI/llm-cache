import { query, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { cacheEntryValidator } from "./types";
import { generateCacheKey } from "./normalize";
import { loadConfig } from "./config";

/**
 * Query cached responses with filters and manual cursor-based pagination.
 */
export const queryEntries = query({
  args: {
    model: v.optional(v.string()),
    tag: v.optional(v.string()),
    after: v.optional(v.number()),
    before: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  returns: v.array(cacheEntryValidator),
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 50, 200);

    // Use the appropriate index and apply time filtering in the loop
    let dbQuery;
    if (args.model) {
      dbQuery = ctx.db
        .query("cachedResponses")
        .withIndex("by_model_createdAt", (q) => q.eq("model", args.model!))
        .order("desc");
    } else {
      dbQuery = ctx.db
        .query("cachedResponses")
        .withIndex("by_createdAt")
        .order("desc");
    }

    const results: (typeof cacheEntryValidator.type)[] = [];

    for await (const entry of dbQuery) {
      // Desc order: newest first. Skip entries newer than `before`.
      if (args.before !== undefined && entry.createdAt >= args.before) continue;
      // Stop once entries are older than `after` (all remaining will be older).
      if (args.after !== undefined && entry.createdAt <= args.after) break;
      // Tag filter
      if (args.tag && !entry.tags?.includes(args.tag)) continue;

      results.push(entry);
      if (results.length >= limit) break;
    }

    return results;
  },
});

/**
 * Get the current cached response for a given request.
 * Returns an array (for forward compatibility if versioned history is added later).
 */
export const history = query({
  args: {
    request: v.any(),
  },
  returns: v.array(cacheEntryValidator),
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

    return entry ? [entry] : [];
  },
});

/**
 * Fetch a batch of expired entries for cleanup.
 */
export const expiredBatch = internalQuery({
  args: {
    now: v.number(),
    limit: v.number(),
  },
  returns: v.array(v.object({ cacheKey: v.string(), _id: v.string() })),
  handler: async (ctx, args) => {
    const results: { cacheKey: string; _id: string }[] = [];

    const dbQuery = ctx.db
      .query("cachedResponses")
      .withIndex("by_expiresAt", (q) => q.lte("expiresAt", args.now))
      .order("asc");

    for await (const entry of dbQuery) {
      results.push({
        cacheKey: entry.cacheKey,
        _id: entry._id as string,
      });
      if (results.length >= args.limit) break;
    }

    return results;
  },
});
