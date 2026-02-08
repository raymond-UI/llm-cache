# PRD: LLM Request Cache Component

## Overview

A Convex component that provides an idempotency and caching layer for LLM API calls. It stores request/response pairs with deterministic cache keys, tiered TTL that extends on cache hits, and query interfaces for inspecting cached data. Compatible with OpenAI-style request formats.

**Package name:** `@mzedstudio/llm-cache` (or similar)
**Challenge:** get-convex/components-submissions-directory#2
**Category:** AI / Agent Infrastructure

## Problem

Every app calling LLM APIs faces the same issues:
- **Duplicate requests** waste tokens and money (same prompt sent multiple times)
- **No visibility** into what was cached, when, or how often
- **No TTL management** -- stale responses linger or fresh ones expire too soon
- **Model upgrades** silently serve outdated cached responses

This component solves all of these as a drop-in Convex component.

## Architecture

```
App code                          Component
--------                          ---------
                                  ┌─────────────────────┐
llmCache.lookup(ctx, {     ──►    │ cachedResponses      │
  messages, model, temp           │   cacheKey (hash)    │
})                                │   request (JSON)     │
  │                               │   response (JSON)    │
  ├─ cache hit ──► return         │   hitCount           │
  │                               │   ttlTier            │
  └─ cache miss ──► app calls     │   expiresAt          │
     LLM API, then:               │   createdAt          │
                                  │   lastAccessedAt     │
llmCache.store(ctx, {      ──►    │   model              │
  request, response               │   modelVersion       │
})                                │   tags               │
                                  └─────────────────────┘
                                  ┌─────────────────────┐
llmCache.setConfig(ctx, {  ──►    │ cacheConfig          │
  defaultTtlMs,                   │   defaultTtlMs       │
  ttlByModel,                     │   ttlByModel         │
  ttlByTag                        │   ttlByTag           │
  ...                             │   promotionTtlMs     │
})                                │   normalizeRequests  │
                                  └─────────────────────┘
```

## Component Schema

### `cachedResponses` table

| Field | Type | Description |
|---|---|---|
| `cacheKey` | `string` | Deterministic hash of normalized request params |
| `request` | `object` | Original request: `{ messages, model, temperature, ...}` |
| `response` | `any` | Full LLM response (choices, usage, etc.) |
| `model` | `string` | Model identifier (e.g. "gpt-4o", "claude-sonnet-4-5-20250929") |
| `modelVersion` | `optional(string)` | Model version tag for invalidation |
| `hitCount` | `number` | Times this cache entry has been accessed |
| `ttlTier` | `number` | Current TTL tier (0 = default, 1 = promoted, 2 = pinned) |
| `expiresAt` | `optional(number)` | Expiration timestamp (ms) |
| `createdAt` | `number` | When the entry was first cached |
| `lastAccessedAt` | `number` | Last time the entry was read |
| `tags` | `optional(array(string))` | User-defined tags for querying |
| `metadata` | `optional(any)` | Arbitrary user metadata |

**Indexes:**
- `by_cacheKey` -- primary lookup
- `by_model` -- filter by model
- `by_expiresAt` -- cleanup expired entries
- `by_createdAt` -- time-range queries
- `by_model_createdAt` -- model + time range queries

### `cacheConfig` table (singleton)

| Field | Type | Description |
|---|---|---|
| `singleton` | `literal("config")` | Single-row key |
| `defaultTtlMs` | `optional(number)` | Default TTL (default: 24 hours) |
| `promotionTtlMs` | `optional(number)` | TTL after promotion on hit (default: 7 days) |
| `ttlByModel` | `optional(record(string, number))` | Per-model TTL overrides |
| `ttlByTag` | `optional(record(string, number))` | Per-tag TTL overrides |
| `normalizeRequests` | `optional(boolean)` | Enable request normalization (default: true) |
| `maxEntries` | `optional(number)` | Max cache entries before eviction |

## Component Functions

### Public (exposed to app via ComponentApi)

| Function | Type | Description |
|---|---|---|
| `lookup` | query | Look up a cached response by request params. Returns cached response + metadata or null. Increments hit count and promotes TTL tier on hit. |
| `store` | mutation | Store an LLM response. Generates cache key, computes TTL, inserts/updates entry. |
| `get` | query | Get a cache entry by its cache key (direct lookup). |
| `query` | query | Query cached responses with filters: model, tag, time range, pattern. Paginated. |
| `history` | query | Time travel: get all historical responses for a given request (by cache key), ordered by creation time. |
| `invalidate` | mutation | Invalidate (delete) cache entries by key, model, model version, tag, or time range. |
| `setConfig` | mutation | Update cache configuration. |
| `getConfig` | query | Read current configuration. |
| `getStats` | query | Cache statistics: total entries, total hits, hit rate, entries by model, storage estimate. |
| `cleanup` | action | Delete expired entries. Supports `dryRun` and `batchSize`. |

### Internal

| Function | Type | Description |
|---|---|---|
| `expiredBatch` | internalQuery | Fetch a batch of expired entries for cleanup. |
| `deleteBatch` | internalMutation | Delete a batch of entries by key. |
| `incrementHitCount` | internalMutation | Atomically increment hit count and update lastAccessedAt/TTL. |
| `getConfigInternal` | internalQuery | Read config for internal use. |

## Cache Key Generation

Deterministic hash from normalized request parameters:

```
cacheKey = SHA-256(JSON.stringify(normalize({
  messages,        // array of { role, content }
  model,           // string
  temperature,     // number (rounded to 2 decimal places)
  max_tokens,      // number (if provided)
  top_p,           // number (if provided)
  // other OpenAI-compatible params
})))
```

**Normalization** (when `normalizeRequests` is enabled):
- Trim whitespace from message content
- Sort object keys alphabetically
- Round floating-point params to 2 decimal places
- Strip `undefined` / `null` fields
- Lowercase model names

## TTL Tiers

| Tier | Name | Default Duration | Trigger |
|---|---|---|---|
| 0 | Default | 24 hours | Initial cache store |
| 1 | Promoted | 7 days | First cache hit |
| 2 | Pinned | No expiration | Manual pin via `store` with `pin: true` |

On each cache hit:
1. If tier 0 → promote to tier 1, update `expiresAt`
2. If tier 1 → refresh `expiresAt` to 7 more days from now
3. If tier 2 → no change (pinned)

Tiers and durations are configurable via `setConfig`.

## Client Wrapper API

```ts
import { LLMCache } from "@mzedstudio/llm-cache";
import { components } from "./_generated/api";

const cache = new LLMCache(components.llmCache);

// In a Convex action:
export const chat = action({
  args: { messages: v.array(v.object({ role: v.string(), content: v.string() })) },
  handler: async (ctx, args) => {
    const request = { messages: args.messages, model: "gpt-4o", temperature: 0.7 };

    // Check cache first
    const cached = await cache.lookup(ctx, { request });
    if (cached) return cached.response;

    // Cache miss -- call LLM
    const response = await callOpenAI(request);

    // Store in cache
    await cache.store(ctx, { request, response, tags: ["chat"] });

    return response;
  },
});
```

### Full Client Methods

```ts
class LLMCache {
  constructor(component: ComponentApi)

  // Core
  lookup(ctx, { request, modelVersion? }): Promise<CacheEntry | null>
  store(ctx, { request, response, tags?, metadata?, pin?, modelVersion? }): Promise<string>

  // Query
  get(ctx, { cacheKey }): Promise<CacheEntry | null>
  query(ctx, { model?, tag?, after?, before?, limit? }): Promise<CacheEntry[]>
  history(ctx, { request }): Promise<CacheEntry[]>

  // Management
  invalidate(ctx, { cacheKey?, model?, modelVersion?, tag?, before? }): Promise<number>
  cleanup(ctx, { batchSize?, dryRun? }): Promise<CleanupResult>

  // Config
  setConfig(ctx, { config, replace? }): Promise<void>
  getConfig(ctx): Promise<CacheConfig>
  getStats(ctx): Promise<CacheStats>
}
```

## Types

```ts
interface CacheEntry {
  cacheKey: string;
  request: LLMRequest;
  response: any;
  model: string;
  modelVersion?: string;
  hitCount: number;
  ttlTier: number;
  expiresAt?: number;
  createdAt: number;
  lastAccessedAt: number;
  tags?: string[];
  metadata?: any;
}

interface LLMRequest {
  messages: Array<{ role: string; content: string }>;
  model: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  [key: string]: unknown;  // other OpenAI-compatible params
}

interface CacheStats {
  totalEntries: number;
  totalHits: number;
  entriesByModel: Record<string, number>;
  hitsByModel: Record<string, number>;
  oldestEntry?: number;
  newestEntry?: number;
}

interface CleanupResult {
  deletedCount: number;
  keys: string[];
  hasMore: boolean;
}

interface CacheConfig {
  defaultTtlMs?: number;
  promotionTtlMs?: number;
  ttlByModel?: Record<string, number>;
  ttlByTag?: Record<string, number>;
  normalizeRequests?: boolean;
  maxEntries?: number;
}
```

## Project Structure

```
@mzedstudio/llm-cache/
├── src/
│   ├── component/
│   │   ├── convex.config.ts
│   │   ├── schema.ts
│   │   ├── cache.ts          # lookup, store, get
│   │   ├── queries.ts        # query, history
│   │   ├── invalidate.ts     # invalidate, cleanup
│   │   ├── config.ts         # setConfig, getConfig, getStats
│   │   ├── normalize.ts      # request normalization + key generation
│   │   └── types.ts          # validators and types
│   ├── client/
│   │   └── index.ts          # LLMCache class + type re-exports
│   └── test.ts               # Test registration helper
├── example/
│   └── convex/               # Example app using the component
├── tests/
│   └── llm_cache.test.ts
├── package.json
├── tsconfig.json
├── tsconfig.build.json
└── vitest.config.ts
```

## Test Plan

| Test | What it covers |
|---|---|
| Store and lookup | Basic cache round-trip |
| Cache miss returns null | Lookup with no stored entry |
| Deterministic keys | Same request always produces same key |
| Normalization | Whitespace, key order, case don't affect key |
| TTL tier promotion | Hit promotes tier 0 → 1, refreshes tier 1 |
| Pinned entries don't expire | Tier 2 entries survive cleanup |
| TTL by model | Model-specific TTL overrides default |
| TTL by tag | Tag-specific TTL overrides |
| Query by model | Filter entries by model name |
| Query by time range | Filter by after/before timestamps |
| Query by tag | Filter by tag |
| History | Multiple stores for same key return all versions |
| Invalidate by key | Single entry deletion |
| Invalidate by model | Bulk deletion by model |
| Invalidate by model version | Version-based invalidation |
| Cleanup expired | Removes only expired entries |
| Cleanup dry run | Reports without deleting |
| Config update | setConfig + getConfig round-trip |
| Stats | Correct counts after operations |
| Request normalization toggle | Config flag enables/disables normalization |

## Success Criteria

1. All public functions have `args` and `returns` validators
2. Cache key generation is deterministic and collision-resistant
3. TTL tier promotion works correctly on cache hits
4. Cleanup only removes expired entries
5. Model version invalidation works for LLM upgrade scenarios
6. 20+ tests passing
7. Published to npm with proper entry points
8. Example app demonstrates usage with a real LLM API call
