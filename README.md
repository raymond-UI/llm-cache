# @mzedstudio/llm-cache

A [Convex component](https://docs.convex.dev/components) that caches LLM API request/response pairs with tiered TTL, time travel, and built-in observability. Stop paying for duplicate calls — get instant responses for identical prompts.

## Features

- **Deterministic cache keys** — SHA-256 hash of normalized request parameters. Same prompt always hits the same cache entry, regardless of key order or whitespace.
- **Tiered TTL with auto-promotion** — entries start at 24h, promote to 7 days on first hit, and can be pinned permanently.
- **Time travel** — every time a cached request gets a new response, the old one is archived. Query the full response history for any request to see how model output has changed over time.
- **Request normalization** — trims whitespace, lowercases model names, rounds floats, and sorts keys so `{model: "GPT-4o", temperature: 0.70001}` hits the same cache as `{temperature: 0.7, model: "gpt-4o"}`.
- **Flexible invalidation** — delete by cache key, model name, model version, tag, or time range.
- **Query and inspect** — filter cached entries by model, tag, or time range. Get hit counts, stats breakdowns, and storage metrics.
- **Configurable TTLs** — set per-model and per-tag TTL overrides. Give ephemeral chat completions a short TTL and expensive embedding calls a long one.
- **OpenAI-compatible** — works with any request format that has `messages`, `model`, and optional parameters like `temperature`, `max_tokens`, `top_p`.

## Installation

```bash
npm install @mzedstudio/llm-cache convex
```

## Setup

### 1. Register the component

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import llmCache from "@mzedstudio/llm-cache/convex.config.js";

const app = defineApp();
app.use(llmCache, { name: "llmCache" });
export default app;
```

### 2. Initialize the client

```ts
// convex/llm.ts
import { LLMCache } from "@mzedstudio/llm-cache";
import { components } from "./_generated/api";

const cache = new LLMCache(components.llmCache);
```

## Usage

### Cache an LLM call

```ts
import { action } from "./_generated/server";
import { v } from "convex/values";

export const chat = action({
  args: {
    messages: v.array(v.object({ role: v.string(), content: v.string() })),
  },
  handler: async (ctx, args) => {
    const request = {
      messages: args.messages,
      model: "gpt-4o",
      temperature: 0.7,
    };

    // Check cache first
    const cached = await cache.lookup(ctx, { request });
    if (cached) return cached.response;

    // Cache miss — call your LLM provider
    const response = await openai.chat.completions.create(request);

    // Store the response
    await cache.store(ctx, { request, response, tags: ["chat"] });

    return response;
  },
});
```

### Pin important responses

Pinned entries never expire (TTL tier 2):

```ts
await cache.store(ctx, {
  request,
  response,
  pin: true,
  tags: ["system-prompt"],
});
```

### Read-only peek (no hit counting)

Use `peek` from query contexts where mutations aren't available:

```ts
export const checkCache = query({
  args: { request: v.any() },
  handler: async (ctx, args) => {
    return await cache.peek(ctx, { request: args.request });
  },
});
```

### Filter and browse cached entries

```ts
// All GPT-4o entries from the last hour
const entries = await cache.query(ctx, {
  model: "gpt-4o",
  after: Date.now() - 3600000,
});

// All entries tagged "summarize"
const summaries = await cache.query(ctx, { tag: "summarize", limit: 20 });
```

### Time travel

When `store()` is called with a response that differs from the existing cached response for the same request, the old response is automatically archived. Use `history()` to retrieve the full timeline:

```ts
// Get every response this request has ever produced
const timeline = await cache.history(ctx, { request });

// timeline = [
//   { response: {...}, storedAt: 1706745600000, isCurrent: false },  // oldest
//   { response: {...}, storedAt: 1707000000000, isCurrent: false },
//   { response: {...}, storedAt: 1707350400000, isCurrent: true },   // current
// ]
```

Each entry includes `isCurrent: boolean` to distinguish the live cached response from archived ones. Archived entries preserve the `model`, `modelVersion`, `tags`, and `metadata` they had at the time of archival.

Identical responses are **not** archived — if the model returns the same output, no duplicate history entry is created.

### Invalidate on model upgrade

```ts
// Clear all cached responses for a specific model
await cache.invalidate(ctx, { model: "gpt-4o" });

// Or invalidate by model version
await cache.invalidate(ctx, { modelVersion: "gpt-4o-2024-05-13" });
```

### Scheduled cleanup

```ts
export const cleanupExpired = action({
  handler: async (ctx) => {
    const result = await cache.cleanup(ctx, { batchSize: 200 });
    console.log(`Deleted ${result.deletedCount} expired entries`);
    // result.hasMore === true means there are more to clean
  },
});
```

Preview before deleting with `dryRun`:

```ts
const preview = await cache.cleanup(ctx, { dryRun: true });
// preview.keys lists what *would* be deleted, but nothing is removed
```

### Cache stats

```ts
const stats = await cache.getStats(ctx);
// {
//   totalEntries: 142,
//   totalHits: 891,
//   entriesByModel: { "gpt-4o": 98, "claude-sonnet-4-5-20250929": 44 },
//   hitsByModel: { "gpt-4o": 720, "claude-sonnet-4-5-20250929": 171 },
//   oldestEntry: 1706745600000,
//   newestEntry: 1707350400000,
// }
```

## Configuration

Tune TTLs, toggle normalization, and set per-model or per-tag overrides:

```ts
await cache.setConfig(ctx, {
  config: {
    defaultTtlMs: 12 * 60 * 60 * 1000,            // 12 hours (default: 24h)
    promotionTtlMs: 14 * 24 * 60 * 60 * 1000,      // 14 days (default: 7d)
    ttlByModel: {
      "gpt-4o-mini": 1 * 60 * 60 * 1000,           // 1 hour for cheap models
      "gpt-4o": 48 * 60 * 60 * 1000,               // 2 days for expensive models
    },
    ttlByTag: {
      "embedding": 30 * 24 * 60 * 60 * 1000,       // 30 days for embeddings
    },
    normalizeRequests: true,                         // default: true
    maxEntries: 10000,
  },
});
```

**TTL priority order:** tag > model > default. When multiple tags match, the longest TTL wins.

Use `replace: true` to overwrite the entire config (unset fields revert to defaults):

```ts
await cache.setConfig(ctx, {
  config: { defaultTtlMs: 3600000 },
  replace: true,
});
```

## How It Works

### Cache Key Generation

Every request is hashed into a deterministic 64-character hex string (SHA-256). Before hashing, the request is normalized:

| Normalization step | Example |
|---|---|
| Sort object keys | `{b:2, a:1}` and `{a:1, b:2}` produce the same key |
| Trim message content | `"  Hello  "` matches `"Hello"` |
| Lowercase model name | `"GPT-4o"` matches `"gpt-4o"` |
| Round floats to 2 places | `0.7000001` matches `0.7` |
| Strip null/undefined fields | `{model: "x", top_p: undefined}` matches `{model: "x"}` |

Normalization can be disabled via config if you need exact-match behavior.

### TTL Tiers

Cache entries automatically promote through three tiers based on access patterns:

| Tier | Name | Default Duration | Trigger |
|---|---|---|---|
| 0 | Default | 24 hours | Entry is first stored |
| 1 | Promoted | 7 days | First cache hit (via `lookup`) |
| 2 | Pinned | Never expires | `store` with `pin: true` |

On each `lookup` hit:
- **Tier 0** entries promote to Tier 1 (expiry extends to 7 days from now)
- **Tier 1** entries refresh their expiry (another 7 days from now)
- **Tier 2** entries are unaffected (pinned)

Popular requests naturally survive longer without manual intervention.

### Response History (Time Travel)

The component maintains two tables:

- **`cachedResponses`** — the current/active cached response for each unique request
- **`responseHistory`** — archived responses that were replaced by newer ones

When `store()` is called for a request that already has a cached entry:
1. If the new response **differs** from the existing one, the old response is archived to `responseHistory`
2. The active entry is updated with the new response
3. If the response is **identical**, no archive entry is created

This gives you a complete audit trail of how model outputs have changed over time for any given request.

### Architecture

```
Your Convex action                     llm-cache component
──────────────────                     ────────────────────
                                       ┌───────────────────┐
cache.lookup(ctx, { request }) ───────>│ cachedResponses    │
  │                                    │   cacheKey (SHA-256)│
  ├─ hit ──> return cached response    │   request          │
  │   + increment hit count            │   response         │
  │   + promote TTL tier               │   hitCount, ttlTier│
  │                                    │   expiresAt        │
  └─ miss ──> call LLM API            │   model, tags      │
     then:                             └───────────────────┘
cache.store(ctx, {             ───────>        │
  request, response                            │ (if response changed)
})                                             ▼
                                       ┌───────────────────┐
cache.history(ctx, { request })───────>│ responseHistory    │
                                       │   cacheKey         │
                                       │   response         │
                                       │   model, tags      │
                                       │   storedAt         │
                                       └───────────────────┘
```

## API Reference

### `LLMCache` class

All methods are accessed through an `LLMCache` instance:

```ts
import { LLMCache } from "@mzedstudio/llm-cache";
const cache = new LLMCache(components.llmCache);
```

---

#### `cache.lookup(ctx, { request, modelVersion? })`

Find a cached response and increment the hit count. Promotes TTL tier on hit.

- **Context:** mutation or action
- **Returns:** `CacheEntry | null`

```ts
const cached = await cache.lookup(ctx, { request });
if (cached) {
  console.log(cached.response, cached.hitCount, cached.ttlTier);
}
```

---

#### `cache.peek(ctx, { request, modelVersion? })`

Read-only cache lookup. Does not increment hit count or promote TTL tier. Safe to use from queries.

- **Context:** any (query, mutation, action)
- **Returns:** `CacheEntry | null`

---

#### `cache.store(ctx, { request, response, tags?, metadata?, pin?, modelVersion? })`

Store an LLM response. If an entry with the same cache key already exists and the response differs, the old response is archived to the history table before the entry is updated.

- **Context:** mutation or action
- **Returns:** `string` (cache key)

| Parameter | Type | Description |
|---|---|---|
| `request` | `Record<string, unknown>` | The LLM request object |
| `response` | `unknown` | The LLM response to cache |
| `tags` | `string[]` | Optional tags for filtering and TTL overrides |
| `metadata` | `unknown` | Optional arbitrary metadata |
| `pin` | `boolean` | Pin entry (never expires, TTL tier 2) |
| `modelVersion` | `string` | Version string for model-version-based invalidation |

---

#### `cache.get(ctx, { cacheKey })`

Direct lookup by cache key. No hit counting.

- **Context:** any
- **Returns:** `CacheEntry | null`

---

#### `cache.query(ctx, { model?, tag?, after?, before?, limit? })`

Filter and list cached entries. Results are ordered newest-first.

- **Context:** any
- **Returns:** `CacheEntry[]`

| Parameter | Type | Description |
|---|---|---|
| `model` | `string` | Filter by model name |
| `tag` | `string` | Filter by tag |
| `after` | `number` | Exclude entries created before this timestamp |
| `before` | `number` | Exclude entries created after this timestamp |
| `limit` | `number` | Max results (default 50, max 200) |

---

#### `cache.history(ctx, { request })`

Get the full response timeline for a request. Returns all archived responses plus the current one, ordered oldest-first.

- **Context:** any
- **Returns:** `HistoryEntry[]`

Each `HistoryEntry` contains:

| Field | Type | Description |
|---|---|---|
| `cacheKey` | `string` | The cache key for this request |
| `request` | `unknown` | The original request |
| `response` | `unknown` | The response at this point in time |
| `model` | `string` | Model name |
| `modelVersion` | `string?` | Model version at time of storage |
| `tags` | `string[]?` | Tags at time of storage |
| `metadata` | `unknown?` | Metadata at time of storage |
| `storedAt` | `number` | Timestamp when this response was stored |
| `isCurrent` | `boolean` | `true` for the active cached response, `false` for archived |

---

#### `cache.invalidate(ctx, { cacheKey?, model?, modelVersion?, tag?, before? })`

Delete matching cache entries. At least one filter parameter is required.

- **Context:** mutation or action
- **Returns:** `number` (count of deleted entries)

---

#### `cache.cleanup(ctx, { batchSize?, dryRun? })`

Remove expired entries in batches.

- **Context:** action
- **Returns:** `CleanupResult`

| Field | Type | Description |
|---|---|---|
| `deletedCount` | `number` | Entries deleted (0 if `dryRun`) |
| `keys` | `string[]` | Cache keys that were (or would be) deleted |
| `hasMore` | `boolean` | `true` if more expired entries remain |

---

#### `cache.setConfig(ctx, { config, replace? })`

Update cache configuration. By default, merges with existing config. Pass `replace: true` to overwrite entirely.

- **Context:** mutation or action

---

#### `cache.getConfig(ctx)`

Read current cache configuration.

- **Context:** any
- **Returns:** `CacheConfig`

---

#### `cache.getStats(ctx)`

Get cache statistics.

- **Context:** any
- **Returns:** `CacheStats`

| Field | Type | Description |
|---|---|---|
| `totalEntries` | `number` | Total cached entries |
| `totalHits` | `number` | Sum of all hit counts |
| `entriesByModel` | `Record<string, number>` | Entry count per model |
| `hitsByModel` | `Record<string, number>` | Hit count per model |
| `oldestEntry` | `number?` | Oldest entry timestamp |
| `newestEntry` | `number?` | Newest entry timestamp |

### Configuration options

| Field | Type | Default | Description |
|---|---|---|---|
| `defaultTtlMs` | `number` | `86400000` (24h) | Default TTL for new entries |
| `promotionTtlMs` | `number` | `604800000` (7d) | TTL after promotion to tier 1 |
| `ttlByModel` | `Record<string, number>` | `{}` | Per-model TTL overrides |
| `ttlByTag` | `Record<string, number>` | `{}` | Per-tag TTL overrides |
| `normalizeRequests` | `boolean` | `true` | Enable request normalization |
| `maxEntries` | `number` | none | Max cache entries (informational) |

### Exported types

```ts
import type {
  CacheEntry,      // Full cache entry with metadata
  HistoryEntry,    // Time travel entry (archived or current)
  CacheConfig,     // Configuration document
  CacheStats,      // Statistics response
  CleanupResult,   // Cleanup action result
  ConfigUpdate,    // Partial config for updates
} from "@mzedstudio/llm-cache";
```

Validators are also exported for use in Convex function args/returns:

```ts
import {
  cacheEntryValidator,
  historyEntryValidator,
  configDocValidator,
  cacheStatsValidator,
  cleanupResultValidator,
  configUpdateValidator,
} from "@mzedstudio/llm-cache";
```

## Example App

The `example/` directory contains a full Next.js demo with:

- **Prompt** — send prompts to LLM models, see cache hit/miss status
- **Explorer** — browse and filter all cached entries
- **History** — time travel UI showing the full response timeline for a request
- **Admin** — configure TTLs, invalidate entries, run cleanup
- **Normalize** — see how request normalization maps variants to the same cache key

To run the example:

```bash
cd example
npm install
npx convex dev   # in one terminal
npm run dev       # in another
```

## Testing

39 tests covering cache operations, normalization, TTL tiers, time travel, queries, invalidation, cleanup, config, and stats.

```bash
pnpm test
```

To register the component in your own tests with `convex-test`:

```ts
import { convexTest } from "convex-test";
import { register } from "@mzedstudio/llm-cache/test";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("my test", async () => {
  const t = convexTest(schema, modules);
  register(t, "llmCache");
  // ... test your functions that use the cache
});
```

## License

Apache-2.0
