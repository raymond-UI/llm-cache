import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  cachedResponses: defineTable({
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
  })
    .index("by_cacheKey", ["cacheKey"])
    .index("by_model", ["model"])
    .index("by_expiresAt", ["expiresAt"])
    .index("by_createdAt", ["createdAt"])
    .index("by_model_createdAt", ["model", "createdAt"]),

  responseHistory: defineTable({
    cacheKey: v.string(),
    request: v.any(),
    response: v.any(),
    model: v.string(),
    modelVersion: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    metadata: v.optional(v.any()),
    storedAt: v.number(),
  })
    .index("by_cacheKey", ["cacheKey"])
    .index("by_cacheKey_storedAt", ["cacheKey", "storedAt"]),

  cacheConfig: defineTable({
    singleton: v.literal("config"),
    defaultTtlMs: v.optional(v.number()),
    promotionTtlMs: v.optional(v.number()),
    ttlByModel: v.optional(v.record(v.string(), v.number())),
    ttlByTag: v.optional(v.record(v.string(), v.number())),
    normalizeRequests: v.optional(v.boolean()),
    maxEntries: v.optional(v.number()),
  }).index("by_singleton", ["singleton"]),
});
