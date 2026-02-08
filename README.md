# @mzedstudio/llm-cache

A [Convex component](https://docs.convex.dev/components) that caches LLM API request/response pairs. Stop paying for duplicate calls — get instant responses for identical prompts with automatic TTL management.

## Features

- **Deterministic cache keys** — SHA-256 hash of normalized request parameters. Same prompt always hits the same cache entry, regardless of key order or whitespace.
- **Tiered TTL with auto-promotion** — entries start at 24h, promote to 7 days on first hit, and can be pinned permanently. Frequently-used responses stick around longer.
- **Request normalization** — trims whitespace, lowercases model names, rounds floats, and sorts keys so `{model: "GPT-4o", temperature: 0.70001}` hits the same cache as `{temperature: 0.7, model: "gpt-4o"}`.
- **Flexible invalidation** — delete by cache key, model name, model version, tag, or time range. Swap models without serving stale responses.
- **Query and inspect** — filter cached entries by model, tag, or time range. Get hit counts, stats breakdowns, and storage metrics.
- **Configurable per-model and per-tag TTLs** — give ephemeral chat completions a short TTL and expensive embedding calls a long one.
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

### Basic: cache an LLM call

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

| Tier | Name | Default Duration | How it's triggered |
|---|---|---|---|
| 0 | Default | 24 hours | Entry is first stored |
| 1 | Promoted | 7 days | First cache hit (via `lookup`) |
| 2 | Pinned | Never expires | `store` with `pin: true` |

On each `lookup` hit:
- **Tier 0** entries promote to Tier 1 (expiry extends to 7 days from now)
- **Tier 1** entries refresh their expiry (another 7 days from now)
- **Tier 2** entries are unaffected (pinned)

This means popular requests naturally survive longer without manual intervention.

### Architecture

```
Your Convex action                     llm-cache component
──────────────────                     ────────────────────
                                       ┌───────────────────┐
cache.lookup(ctx, { request }) ───────>│ cachedResponses    │
  │                                    │   cacheKey (SHA-256)│
  ├─ hit ──> return cached response    │   request          │
  │   + increment hit count            │   response         │
  │   + promote TTL tier               │   hitCount         │
  │                                    │   ttlTier          │
  └─ miss ──> call LLM API            │   expiresAt        │
     then:                             │   model            │
cache.store(ctx, {             ───────>│   tags             │
  request, response                    │   metadata         │
})                                     └───────────────────┘
```

## API Reference

### `LLMCache` class

| Method | Context required | Description |
|---|---|---|
| `lookup(ctx, { request, modelVersion? })` | mutation / action | Find cached response, increment hit count |
| `peek(ctx, { request, modelVersion? })` | any (including query) | Read-only lookup, no hit counting |
| `store(ctx, { request, response, tags?, metadata?, pin?, modelVersion? })` | mutation / action | Store a response. Returns cache key. Upserts if key exists. |
| `get(ctx, { cacheKey })` | any | Direct lookup by cache key |
| `query(ctx, { model?, tag?, after?, before?, limit? })` | any | Filter and list cached entries |
| `history(ctx, { request })` | any | Get cached entry for a request |
| `invalidate(ctx, { cacheKey?, model?, modelVersion?, tag?, before? })` | mutation / action | Delete matching entries. Returns count deleted. |
| `cleanup(ctx, { batchSize?, dryRun? })` | action | Remove expired entries |
| `setConfig(ctx, { config, replace? })` | mutation / action | Update configuration |
| `getConfig(ctx)` | any | Read current configuration |
| `getStats(ctx)` | any | Cache statistics and hit rates |

### Configuration options

| Field | Type | Default | Description |
|---|---|---|---|
| `defaultTtlMs` | `number` | `86400000` (24h) | Default TTL for new entries |
| `promotionTtlMs` | `number` | `604800000` (7d) | TTL after promotion to tier 1 |
| `ttlByModel` | `Record<string, number>` | `{}` | Per-model TTL overrides |
| `ttlByTag` | `Record<string, number>` | `{}` | Per-tag TTL overrides |
| `normalizeRequests` | `boolean` | `true` | Enable request normalization |
| `maxEntries` | `number` | none | Max cache entries (informational) |

## Testing

This component includes 33 tests covering cache operations, normalization, TTL tiers, queries, invalidation, cleanup, config, and stats.

```bash
pnpm test
```

To use in your own tests with `convex-test`:

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
