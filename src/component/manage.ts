import { mutation, internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";

/**
 * Invalidate cache entries by key, model, modelVersion, tag, or time range.
 * Returns the count of deleted entries.
 */
export const invalidate = mutation({
  args: {
    cacheKey: v.optional(v.string()),
    model: v.optional(v.string()),
    modelVersion: v.optional(v.string()),
    tag: v.optional(v.string()),
    before: v.optional(v.number()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    let count = 0;

    // Single-key deletion
    if (args.cacheKey) {
      const entry = await ctx.db
        .query("cachedResponses")
        .withIndex("by_cacheKey", (q) => q.eq("cacheKey", args.cacheKey!))
        .unique();
      if (entry) {
        await ctx.db.delete(entry._id);
        count++;
      }
      return count;
    }

    // Bulk deletion by filters
    // Use the best available index, apply remaining filters in the loop
    let dbQuery;
    if (args.model) {
      dbQuery = ctx.db
        .query("cachedResponses")
        .withIndex("by_model_createdAt", (q) => q.eq("model", args.model!));
    } else {
      dbQuery = ctx.db
        .query("cachedResponses")
        .withIndex("by_createdAt");
    }

    const toDelete: Id<"cachedResponses">[] = [];
    for await (const entry of dbQuery) {
      if (args.before !== undefined && entry.createdAt >= args.before) continue;
      if (args.modelVersion && entry.modelVersion !== args.modelVersion)
        continue;
      if (args.tag && !entry.tags?.includes(args.tag)) continue;

      toDelete.push(entry._id);
      // Safety limit to avoid transaction size issues
      if (toDelete.length >= 1000) break;
    }

    for (const id of toDelete) {
      await ctx.db.delete(id);
      count++;
    }

    return count;
  },
});

/**
 * Delete a batch of entries by cache key. Used by the cleanup action.
 */
export const deleteBatch = internalMutation({
  args: {
    cacheKeys: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const key of args.cacheKeys) {
      const entry = await ctx.db
        .query("cachedResponses")
        .withIndex("by_cacheKey", (q) => q.eq("cacheKey", key))
        .unique();
      if (entry) {
        await ctx.db.delete(entry._id);
      }
    }
    return null;
  },
});
