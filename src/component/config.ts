import { query, mutation, internalQuery } from "./_generated/server";
import type { DatabaseReader } from "./_generated/server";
import { v } from "convex/values";
import {
  configUpdateValidator,
  configDocValidator,
  cacheStatsValidator,
} from "./types";

const CONFIG_KEY = "config" as const;
export const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const DEFAULT_PROMOTION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type CacheConfigData = {
  defaultTtlMs?: number;
  promotionTtlMs?: number;
  ttlByModel?: Record<string, number>;
  ttlByTag?: Record<string, number>;
  normalizeRequests?: boolean;
  maxEntries?: number;
};

async function readConfig(db: DatabaseReader): Promise<CacheConfigData> {
  const record = await db
    .query("cacheConfig")
    .withIndex("by_singleton", (q) => q.eq("singleton", CONFIG_KEY))
    .unique();

  if (!record) return {};
  return {
    defaultTtlMs: record.defaultTtlMs,
    promotionTtlMs: record.promotionTtlMs,
    ttlByModel: record.ttlByModel,
    ttlByTag: record.ttlByTag,
    normalizeRequests: record.normalizeRequests,
    maxEntries: record.maxEntries,
  };
}

/** Load config from the singleton row. Usable from any function context. */
export async function loadConfig(ctx: {
  db: DatabaseReader;
}): Promise<CacheConfigData> {
  return await readConfig(ctx.db);
}

/** Compute the initial expiresAt timestamp for a new cache entry. */
export function computeExpiresAt(params: {
  now: number;
  model: string;
  tags?: string[];
  config: CacheConfigData;
}): number {
  const { now, model, tags, config } = params;

  // Priority 1: Per-tag TTL (longest matching tag wins)
  if (tags && config.ttlByTag) {
    let maxTagTtl: number | undefined;
    for (const tag of tags) {
      const ttl = config.ttlByTag[tag];
      if (ttl !== undefined && (maxTagTtl === undefined || ttl > maxTagTtl)) {
        maxTagTtl = ttl;
      }
    }
    if (maxTagTtl !== undefined) return now + maxTagTtl;
  }

  // Priority 2: Per-model TTL
  if (config.ttlByModel?.[model] !== undefined) {
    return now + config.ttlByModel[model];
  }

  // Priority 3: Default TTL
  const defaultTtl = config.defaultTtlMs ?? DEFAULT_TTL_MS;
  return now + defaultTtl;
}

// --- Public functions ---

export const getConfig = query({
  args: {},
  returns: configDocValidator,
  handler: async (ctx) => {
    return await readConfig(ctx.db);
  },
});

export const setConfig = mutation({
  args: {
    config: configUpdateValidator,
    replace: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("cacheConfig")
      .withIndex("by_singleton", (q) => q.eq("singleton", CONFIG_KEY))
      .unique();

    if (existing) {
      if (args.replace) {
        await ctx.db.patch(existing._id, {
          defaultTtlMs: args.config.defaultTtlMs,
          promotionTtlMs: args.config.promotionTtlMs,
          ttlByModel: args.config.ttlByModel,
          ttlByTag: args.config.ttlByTag,
          normalizeRequests: args.config.normalizeRequests,
          maxEntries: args.config.maxEntries,
        });
      } else {
        // Merge: only update provided fields
        const patch: Record<string, unknown> = {};
        if (args.config.defaultTtlMs !== undefined)
          patch.defaultTtlMs = args.config.defaultTtlMs;
        if (args.config.promotionTtlMs !== undefined)
          patch.promotionTtlMs = args.config.promotionTtlMs;
        if (args.config.ttlByModel !== undefined)
          patch.ttlByModel = args.config.ttlByModel;
        if (args.config.ttlByTag !== undefined)
          patch.ttlByTag = args.config.ttlByTag;
        if (args.config.normalizeRequests !== undefined)
          patch.normalizeRequests = args.config.normalizeRequests;
        if (args.config.maxEntries !== undefined)
          patch.maxEntries = args.config.maxEntries;
        await ctx.db.patch(existing._id, patch as any);
      }
    } else {
      await ctx.db.insert("cacheConfig", {
        singleton: CONFIG_KEY,
        ...args.config,
      });
    }

    return null;
  },
});

export const getStats = query({
  args: {},
  returns: cacheStatsValidator,
  handler: async (ctx) => {
    let totalEntries = 0;
    let totalHits = 0;
    const entriesByModel: Record<string, number> = {};
    const hitsByModel: Record<string, number> = {};
    let oldestEntry: number | undefined;
    let newestEntry: number | undefined;

    const q = ctx.db
      .query("cachedResponses")
      .withIndex("by_createdAt")
      .order("asc");

    for await (const entry of q) {
      totalEntries++;
      totalHits += entry.hitCount;
      entriesByModel[entry.model] =
        (entriesByModel[entry.model] ?? 0) + 1;
      hitsByModel[entry.model] =
        (hitsByModel[entry.model] ?? 0) + entry.hitCount;
      if (oldestEntry === undefined) oldestEntry = entry.createdAt;
      newestEntry = entry.createdAt;
    }

    return {
      totalEntries,
      totalHits,
      entriesByModel,
      hitsByModel,
      oldestEntry,
      newestEntry,
    };
  },
});

// --- Internal functions ---

export const getConfigInternal = internalQuery({
  args: {},
  returns: configDocValidator,
  handler: async (ctx) => {
    return await readConfig(ctx.db);
  },
});
