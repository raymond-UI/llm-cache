"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { Send, Zap, Clock } from "lucide-react";
import { toast } from "sonner";

import { api } from "../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MODELS = [
  { id: "openai/gpt-4o-mini", label: "GPT-4o Mini" },
  { id: "anthropic/claude-3.5-haiku", label: "Claude 3.5 Haiku" },
  { id: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash" },
] as const;

const TIER_LABELS: Record<number, { label: string; variant: "default" | "secondary" | "outline" }> = {
  0: { label: "Default", variant: "outline" },
  1: { label: "Promoted", variant: "secondary" },
  2: { label: "Pinned", variant: "default" },
};

type PromptResult = {
  response: unknown;
  fromCache: boolean;
  cacheKey: string;
  hitCount: number;
  ttlTier: number;
};

export default function PromptPanel() {
  const [prompt, setPrompt] = useState("What is the capital of France?");
  const [model, setModel] = useState<string>("openai/gpt-4o-mini");
  const [temperature, setTemperature] = useState("0.7");
  const [tags, setTags] = useState("");
  const [pin, setPin] = useState(false);
  const [modelVersion, setModelVersion] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<PromptResult | null>(null);

  const sendPrompt = useAction(api.llmActions.sendPrompt);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const parsedTags = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const res = await sendPrompt({
        messages: [{ role: "user", content: prompt }],
        model,
        temperature: parseFloat(temperature) || 0.7,
        tags: parsedTags.length > 0 ? parsedTags : undefined,
        pin: pin || undefined,
        modelVersion: modelVersion.trim() || undefined,
      });
      setResult(res as PromptResult);
    } catch (err) {
      console.error("sendPrompt failed:", err);
      toast.error(err instanceof Error ? err.message : "Failed to send prompt");
    } finally {
      setIsSubmitting(false);
    }
  }

  const responseContent =
    result?.response &&
    typeof result.response === "object" &&
    "choices" in (result.response as Record<string, unknown>)
      ? ((result.response as { choices: Array<{ message: { content: string } }> }).choices[0]?.message?.content ?? "")
      : JSON.stringify(result?.response, null, 2);

  const usage =
    result?.response &&
    typeof result.response === "object" &&
    "usage" in (result.response as Record<string, unknown>)
      ? (result.response as { usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }).usage
      : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Send a Prompt</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <Label htmlFor="prompt">Message</Label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="Enter your prompt..."
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <div className="w-48">
                <Label>Model</Label>
                <Select value={model} onValueChange={(v) => v && setModel(v)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODELS.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="w-24">
                <Label htmlFor="temperature">Temperature</Label>
                <Input
                  id="temperature"
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div className="flex-1 min-w-[140px]">
                <Label htmlFor="tags">Tags (comma-separated)</Label>
                <Input
                  id="tags"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="chat, demo"
                  className="mt-1"
                />
              </div>

              <div className="w-32">
                <Label htmlFor="modelVersion">Version</Label>
                <Input
                  id="modelVersion"
                  value={modelVersion}
                  onChange={(e) => setModelVersion(e.target.value)}
                  placeholder="v1.0"
                  className="mt-1"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="pin"
                  checked={pin}
                  onCheckedChange={(checked) => setPin(checked === true)}
                />
                <Label htmlFor="pin" className="text-sm font-normal">
                  Pin (never expires)
                </Label>
              </div>

              <Button type="submit" disabled={isSubmitting || !prompt.trim()}>
                <Send className="mr-1.5 size-3.5" />
                {isSubmitting ? "Sending..." : "Send"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Response</CardTitle>
              <Badge
                variant={result.fromCache ? "default" : "secondary"}
                className="text-xs"
              >
                {result.fromCache ? (
                  <>
                    <Zap className="mr-1 size-3" />
                    Cache Hit
                  </>
                ) : (
                  <>
                    <Clock className="mr-1 size-3" />
                    Cache Miss
                  </>
                )}
              </Badge>
              {TIER_LABELS[result.ttlTier] && (
                <Badge variant={TIER_LABELS[result.ttlTier].variant} className="text-xs">
                  {TIER_LABELS[result.ttlTier].label}
                </Badge>
              )}
              {result.hitCount > 0 && (
                <span className="text-xs text-muted-foreground">
                  {result.hitCount} hit{result.hitCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">{responseContent}</p>

            {usage && (
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>Prompt: {usage.prompt_tokens} tokens</span>
                <span>Completion: {usage.completion_tokens} tokens</span>
                <span>Total: {usage.total_tokens} tokens</span>
              </div>
            )}

            <div className="text-xs text-muted-foreground font-mono truncate">
              Key: {result.cacheKey}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
