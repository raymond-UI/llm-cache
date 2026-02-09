import { v, type Infer } from "convex/values";

// --- Cache entry validator (for return values across component boundary) ---
export const cacheEntryValidator = v.object({
  _id: v.string(),
  _creationTime: v.number(),
  cacheKey: v.string(),
  request: v.any(),
  response: v.any(),
  model: v.string(),
  modelVersion: v.optional(v.string()),
  hitCount: v.number(),
  ttlTier: v.number(),
  expiresAt: v.optional(v.number()),
  createdAt: v.number(),
  lastAccessedAt: v.number(),
  tags: v.optional(v.array(v.string())),
  metadata: v.optional(v.any()),
});

export type CacheEntry = Infer<typeof cacheEntryValidator>;

// --- History entry validator (unified shape for time travel) ---
export const historyEntryValidator = v.object({
  cacheKey: v.string(),
  request: v.any(),
  response: v.any(),
  model: v.string(),
  modelVersion: v.optional(v.string()),
  tags: v.optional(v.array(v.string())),
  metadata: v.optional(v.any()),
  storedAt: v.number(),
  isCurrent: v.boolean(),
});

export type HistoryEntry = Infer<typeof historyEntryValidator>;

// --- Config validators ---
export const configUpdateValidator = v.object({
  defaultTtlMs: v.optional(v.number()),
  promotionTtlMs: v.optional(v.number()),
  ttlByModel: v.optional(v.record(v.string(), v.number())),
  ttlByTag: v.optional(v.record(v.string(), v.number())),
  normalizeRequests: v.optional(v.boolean()),
  maxEntries: v.optional(v.number()),
});

export type ConfigUpdate = Infer<typeof configUpdateValidator>;

export const configDocValidator = v.object({
  defaultTtlMs: v.optional(v.number()),
  promotionTtlMs: v.optional(v.number()),
  ttlByModel: v.optional(v.record(v.string(), v.number())),
  ttlByTag: v.optional(v.record(v.string(), v.number())),
  normalizeRequests: v.optional(v.boolean()),
  maxEntries: v.optional(v.number()),
});

export type CacheConfig = Infer<typeof configDocValidator>;

// --- Stats validator ---
export const cacheStatsValidator = v.object({
  totalEntries: v.number(),
  totalHits: v.number(),
  entriesByModel: v.record(v.string(), v.number()),
  hitsByModel: v.record(v.string(), v.number()),
  oldestEntry: v.optional(v.number()),
  newestEntry: v.optional(v.number()),
});

export type CacheStats = Infer<typeof cacheStatsValidator>;

// --- Cleanup result validator ---
export const cleanupResultValidator = v.object({
  deletedCount: v.number(),
  keys: v.array(v.string()),
  hasMore: v.boolean(),
});

export type CleanupResult = Infer<typeof cleanupResultValidator>;
