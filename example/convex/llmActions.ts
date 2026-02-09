"use node";

import { action } from "./_generated/server";
import { components } from "./_generated/api";
import { LLMCache } from "@mzedstudio/llm-cache";
import { v } from "convex/values";
import OpenAI from "openai";

const cache = new LLMCache(components.llmCache);

// ---------------------------------------------------------------------------
// OpenRouter client (OpenAI SDK compatible)
// ---------------------------------------------------------------------------

function getOpenRouterClient(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Run: npx convex env set OPENROUTER_API_KEY <your-key>",
    );
  }
  return new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
  });
}

async function callLLM(
  model: string,
  messages: Array<{ role: string; content: string }>,
  temperature: number,
) {
  const client = getOpenRouterClient();
  const completion = await client.chat.completions.create({
    model,
    messages: messages.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    })),
    temperature,
  });

  return {
    choices: completion.choices.map((c) => ({
      message: {
        role: c.message.role,
        content: c.message.content ?? "",
      },
      finish_reason: c.finish_reason,
    })),
    model: completion.model,
    usage: completion.usage
      ? {
          prompt_tokens: completion.usage.prompt_tokens,
          completion_tokens: completion.usage.completion_tokens,
          total_tokens: completion.usage.total_tokens,
        }
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Actions (require Node.js runtime for OpenAI SDK)
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
      model: args.model ?? "openai/gpt-4o-mini",
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

    const response = await callLLM(
      request.model,
      args.messages,
      request.temperature,
    );
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
        description: 'Baseline: model "openai/gpt-4o-mini", temp 0.7',
        request: {
          messages: [{ role: "user", content: "Hello world" }],
          model: "openai/gpt-4o-mini",
          temperature: 0.7,
        },
      },
      {
        label: "Whitespace",
        description: "Extra spaces in content",
        request: {
          messages: [{ role: "user", content: "  Hello world  " }],
          model: "openai/gpt-4o-mini",
          temperature: 0.7,
        },
      },
      {
        label: "Key Order + Case",
        description: "Reordered keys, model in UPPERCASE",
        request: {
          temperature: 0.7,
          messages: [{ role: "user", content: "Hello world" }],
          model: "OPENAI/GPT-4O-MINI",
        },
      },
      {
        label: "Float Precision",
        description: "Temperature 0.7000001 → rounds to 0.7",
        request: {
          messages: [{ role: "user", content: "Hello world" }],
          model: "openai/gpt-4o-mini",
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
        const response = await callLLM(
          (request.model as string) ?? "openai/gpt-4o-mini",
          request.messages as Array<{ role: string; content: string }>,
          (request.temperature as number) ?? 0.7,
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
