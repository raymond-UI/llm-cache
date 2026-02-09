import { action, mutation, query } from "./_generated/server";
import { components } from "./_generated/api";
import { LLMCache } from "@mzedstudio/llm-cache";
import { v } from "convex/values";

const cache = new LLMCache(components.llmCache);

// ---------------------------------------------------------------------------
// Simulated LLM response generator (no real API calls needed)
// ---------------------------------------------------------------------------

function simulateResponse(
  model: string,
  messages: Array<{ role: string; content: string }>,
) {
  const lastMessage = messages[messages.length - 1]?.content ?? "";
  const wordCount = lastMessage.split(/\s+/).filter(Boolean).length;

  const responses: Record<string, (prompt: string) => string> = {
    "gpt-4o": (p) =>
      `[GPT-4o] I've analyzed your prompt "${p.slice(0, 60)}..." with advanced reasoning. Here's a comprehensive response with detailed analysis and nuanced insights.`,
    "claude-3.5-sonnet": (p) =>
      `[Claude 3.5 Sonnet] Thank you for your thoughtful question about "${p.slice(0, 60)}...". Let me provide a nuanced perspective with careful consideration of multiple angles.`,
    "gpt-3.5-turbo": (p) =>
      `[GPT-3.5 Turbo] Here's a quick answer to "${p.slice(0, 60)}...". This is a fast, efficient response optimized for speed.`,
  };

  const generator =
    responses[model.toLowerCase()] ?? responses["gpt-4o"] ?? responses["gpt-4o"]!;

  return {
    choices: [
      {
        message: { role: "assistant", content: generator(lastMessage) },
        finish_reason: "stop",
      },
    ],
    model,
    usage: {
      prompt_tokens: wordCount * 2,
      completion_tokens: Math.floor(wordCount * 3.5),
      total_tokens: Math.floor(wordCount * 5.5),
    },
  };
}

// ---------------------------------------------------------------------------
// Prompt / Cache operations
// ---------------------------------------------------------------------------

export const sendPrompt = action({
  args: {
    messages: v.array(v.object({ role: v.string(), content: v.string() })),
    model: v.optional(v.string()),
    temperature: v.optional(v.number()),
    tags: v.optional(v.array(v.string())),
    pin: v.optional(v.boolean()),
    modelVersion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const request = {
      messages: args.messages,
      model: args.model ?? "gpt-4o",
      temperature: args.temperature ?? 0.7,
    };

    const cached = await cache.lookup(ctx, {
      request,
      modelVersion: args.modelVersion,
    });

    if (cached) {
      return {
        response: cached.response,
        fromCache: true,
        cacheKey: cached.cacheKey,
        hitCount: cached.hitCount,
        ttlTier: cached.ttlTier,
      };
    }

    const response = simulateResponse(request.model, args.messages);
    const cacheKey = await cache.store(ctx, {
      request,
      response,
      tags: args.tags,
      pin: args.pin,
      modelVersion: args.modelVersion,
    });

    return {
      response,
      fromCache: false,
      cacheKey,
      hitCount: 0,
      ttlTier: args.pin ? 2 : 0,
    };
  },
});

// ---------------------------------------------------------------------------
// Query wrappers
// ---------------------------------------------------------------------------

export const queryEntries = query({
  args: {
    model: v.optional(v.string()),
    tag: v.optional(v.string()),
    after: v.optional(v.number()),
    before: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await cache.query(ctx, args);
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    return await cache.getStats(ctx);
  },
});

export const getConfig = query({
  args: {},
  handler: async (ctx) => {
    return await cache.getConfig(ctx);
  },
});

export const getEntry = query({
  args: { cacheKey: v.string() },
  handler: async (ctx, args) => {
    return await cache.get(ctx, args);
  },
});

export const getHistory = query({
  args: { request: v.any() },
  handler: async (ctx, args) => {
    return await cache.history(ctx, { request: args.request });
  },
});

// ---------------------------------------------------------------------------
// Mutation wrappers
// ---------------------------------------------------------------------------

export const updateConfig = mutation({
  args: {
    config: v.object({
      defaultTtlMs: v.optional(v.number()),
      promotionTtlMs: v.optional(v.number()),
      ttlByModel: v.optional(v.any()),
      ttlByTag: v.optional(v.any()),
      normalizeRequests: v.optional(v.boolean()),
      maxEntries: v.optional(v.number()),
    }),
    replace: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    return await cache.setConfig(ctx, args);
  },
});

export const invalidateEntries = mutation({
  args: {
    cacheKey: v.optional(v.string()),
    model: v.optional(v.string()),
    modelVersion: v.optional(v.string()),
    tag: v.optional(v.string()),
    before: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await cache.invalidate(ctx, args);
  },
});

// ---------------------------------------------------------------------------
// Action wrappers
// ---------------------------------------------------------------------------

export const cleanupExpired = action({
  args: {
    batchSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    return await cache.cleanup(ctx, args);
  },
});

export const normalizationDemo = action({
  args: {},
  handler: async (ctx) => {
    const variants = [
      {
        label: "Original",
        description: 'Baseline: model "gpt-4o", temp 0.7',
        request: {
          messages: [{ role: "user", content: "Hello world" }],
          model: "gpt-4o",
          temperature: 0.7,
        },
      },
      {
        label: "Whitespace",
        description: "Extra spaces in content",
        request: {
          messages: [{ role: "user", content: "  Hello world  " }],
          model: "gpt-4o",
          temperature: 0.7,
        },
      },
      {
        label: "Key Order + Case",
        description: "Reordered keys, model in UPPERCASE",
        request: {
          temperature: 0.7,
          messages: [{ role: "user", content: "Hello world" }],
          model: "GPT-4O",
        },
      },
      {
        label: "Float Precision",
        description: "Temperature 0.7000001 → rounds to 0.7",
        request: {
          messages: [{ role: "user", content: "Hello world" }],
          model: "gpt-4o",
          temperature: 0.7000001,
        },
      },
    ];

    const results = [];
    for (const { label, description, request } of variants) {
      const cached = await cache.lookup(ctx, { request });
      if (cached) {
        results.push({
          label,
          description,
          cacheKey: cached.cacheKey,
          fromCache: true,
        });
      } else {
        const response = simulateResponse(
          (request.model as string) ?? "gpt-4o",
          request.messages as Array<{ role: string; content: string }>,
        );
        const cacheKey = await cache.store(ctx, {
          request,
          response,
          tags: ["normalization-demo"],
        });
        results.push({ label, description, cacheKey, fromCache: false });
      }
    }
    return results;
  },
});
