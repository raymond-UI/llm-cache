import { action, mutation, query } from "./_generated/server";
import { components } from "./_generated/api";
import { LLMCache } from "@mzedstudio/llm-cache";
import { v } from "convex/values";

const cache = new LLMCache(components.llmCache);

/**
 * Example: cached LLM chat action.
 * Replace the simulated response with a real OpenAI/Anthropic API call.
 */
export const chat = action({
  args: {
    messages: v.array(
      v.object({ role: v.string(), content: v.string() }),
    ),
    model: v.optional(v.string()),
    temperature: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const request = {
      messages: args.messages,
      model: args.model ?? "gpt-4o",
      temperature: args.temperature ?? 0.7,
    };

    // Check cache first
    const cached = await cache.lookup(ctx, { request });
    if (cached) {
      return { response: cached.response, fromCache: true };
    }

    // Cache miss — call LLM (simulated here)
    const response = {
      choices: [
        {
          message: {
            role: "assistant",
            content: "Hello! This is a simulated response.",
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 },
    };

    // Store in cache
    await cache.store(ctx, { request, response, tags: ["chat"] });

    return { response, fromCache: false };
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    return await cache.getStats(ctx);
  },
});

export const cleanupExpired = action({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    return await cache.cleanup(ctx, { dryRun: args.dryRun });
  },
});

export const updateConfig = mutation({
  args: {
    defaultTtlMs: v.optional(v.number()),
    normalizeRequests: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    return await cache.setConfig(ctx, { config: args });
  },
});
