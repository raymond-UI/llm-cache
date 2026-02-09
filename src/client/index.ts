import type {
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from "convex/server";
import type { ComponentApi } from "../component/_generated/component.js";

// Re-export types and validators
export type { ComponentApi } from "../component/_generated/component.js";
export type {
  CacheEntry,
  CacheConfig,
  CacheStats,
  CleanupResult,
  ConfigUpdate,
  HistoryEntry,
} from "../component/types.js";
export {
  cacheEntryValidator,
  configUpdateValidator,
  configDocValidator,
  cacheStatsValidator,
  cleanupResultValidator,
  historyEntryValidator,
} from "../component/types.js";

type QueryCtx = Pick<GenericQueryCtx<GenericDataModel>, "runQuery">;
type MutationCtx = Pick<
  GenericMutationCtx<GenericDataModel>,
  "runQuery" | "runMutation"
>;
type ActionCtx = Pick<
  GenericActionCtx<GenericDataModel>,
  "runQuery" | "runMutation" | "runAction"
>;

/**
 * Client wrapper for the LLM Cache component.
 *
 * Usage:
 * ```ts
 * import { LLMCache } from "@mzedstudio/llm-cache";
 * import { components } from "./_generated/api";
 *
 * const cache = new LLMCache(components.llmCache);
 * ```
 */
export class LLMCache {
  public component: ComponentApi;

  constructor(component: ComponentApi) {
    this.component = component;
  }

  /**
   * Look up a cached response and increment hit count.
   * Requires MutationCtx or ActionCtx (needs runMutation for hit counting).
   */
  async lookup(
    ctx: MutationCtx | ActionCtx,
    args: {
      request: Record<string, unknown>;
      modelVersion?: string;
    },
  ) {
    const result = await ctx.runQuery(this.component.cache.lookup, args);
    if (result) {
      await ctx.runMutation(this.component.cache.incrementHitCount, {
        cacheKey: result.cacheKey,
      });
    }
    return result;
  }

  /**
   * Read-only cache lookup without incrementing hit count.
   * Works from any context including queries.
   */
  async peek(
    ctx: QueryCtx,
    args: {
      request: Record<string, unknown>;
      modelVersion?: string;
    },
  ) {
    return await ctx.runQuery(this.component.cache.lookup, args);
  }

  /**
   * Store an LLM response in the cache. Returns the cache key.
   */
  async store(
    ctx: MutationCtx,
    args: {
      request: Record<string, unknown>;
      response: unknown;
      tags?: string[];
      metadata?: unknown;
      pin?: boolean;
      modelVersion?: string;
    },
  ) {
    return await ctx.runMutation(this.component.cache.store, args);
  }

  /**
   * Get a cache entry by its cache key (direct lookup, no hit counting).
   */
  async get(ctx: QueryCtx, args: { cacheKey: string }) {
    return await ctx.runQuery(this.component.cache.get, args);
  }

  /**
   * Query cached responses with filters.
   */
  async query(
    ctx: QueryCtx,
    args: {
      model?: string;
      tag?: string;
      after?: number;
      before?: number;
      limit?: number;
    } = {},
  ) {
    return await ctx.runQuery(this.component.queries.queryEntries, args);
  }

  /**
   * Get cached responses for a given request.
   */
  async history(
    ctx: QueryCtx,
    args: { request: Record<string, unknown> },
  ) {
    return await ctx.runQuery(this.component.queries.history, args);
  }

  /**
   * Invalidate cache entries by key, model, modelVersion, tag, or time range.
   * Returns the count of deleted entries.
   */
  async invalidate(
    ctx: MutationCtx,
    args: {
      cacheKey?: string;
      model?: string;
      modelVersion?: string;
      tag?: string;
      before?: number;
    },
  ) {
    return await ctx.runMutation(this.component.manage.invalidate, args);
  }

  /**
   * Delete expired cache entries. Returns cleanup results.
   */
  async cleanup(
    ctx: ActionCtx,
    args: { batchSize?: number; dryRun?: boolean } = {},
  ) {
    return await ctx.runAction(this.component.cleanup.cleanup, args);
  }

  /**
   * Update cache configuration.
   */
  async setConfig(
    ctx: MutationCtx,
    args: {
      config: {
        defaultTtlMs?: number;
        promotionTtlMs?: number;
        ttlByModel?: Record<string, number>;
        ttlByTag?: Record<string, number>;
        normalizeRequests?: boolean;
        maxEntries?: number;
      };
      replace?: boolean;
    },
  ) {
    return await ctx.runMutation(this.component.config.setConfig, args);
  }

  /**
   * Read current cache configuration.
   */
  async getConfig(ctx: QueryCtx) {
    return await ctx.runQuery(this.component.config.getConfig, {});
  }

  /**
   * Get cache statistics.
   */
  async getStats(ctx: QueryCtx) {
    return await ctx.runQuery(this.component.config.getStats, {});
  }
}
