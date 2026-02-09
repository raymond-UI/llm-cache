import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { cleanupResultValidator, type CleanupResult } from "./types";

/**
 * Delete expired cache entries. Supports dry-run mode and batch size control.
 */
export const cleanup = action({
  args: {
    batchSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  returns: cleanupResultValidator,
  handler: async (ctx, args): Promise<CleanupResult> => {
    const limit: number = args.batchSize ?? 100;

    const expired: Array<{ cacheKey: string }> = await ctx.runQuery(
      internal.queries.expiredBatch,
      { now: Date.now(), limit },
    );

    const keys: string[] = expired.map((item) => item.cacheKey);

    if (!args.dryRun && keys.length > 0) {
      await ctx.runMutation(internal.manage.deleteBatch, { cacheKeys: keys });
    }

    return {
      deletedCount: args.dryRun ? 0 : keys.length,
      keys,
      hasMore: expired.length >= limit,
    };
  },
});
