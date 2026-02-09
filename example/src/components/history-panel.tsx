"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { History, Clock, CheckCircle2 } from "lucide-react";

import { api } from "../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function extractContent(response: unknown): string {
  if (
    response &&
    typeof response === "object" &&
    "choices" in (response as Record<string, unknown>)
  ) {
    const choices = (response as { choices: Array<{ message: { content: string } }> }).choices;
    return choices[0]?.message?.content ?? "";
  }
  return JSON.stringify(response, null, 2);
}

type HistoryEntry = {
  cacheKey: string;
  request: unknown;
  response: unknown;
  model: string;
  modelVersion?: string;
  tags?: string[];
  metadata?: unknown;
  storedAt: number;
  isCurrent: boolean;
};

export default function HistoryPanel() {
  const [prompt, setPrompt] = useState("What is the capital of France?");
  const [model, setModel] = useState<string>("openai/gpt-4o-mini");
  const [temperature, setTemperature] = useState("0.7");
  const [submitted, setSubmitted] = useState(false);
  const [request, setRequest] = useState<Record<string, unknown> | null>(null);

  const history = useQuery(
    api.llm.getHistory,
    request ? { request } : "skip",
  );

  function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setRequest({
      messages: [{ role: "user", content: prompt }],
      model,
      temperature: parseFloat(temperature) || 0.7,
    });
    setSubmitted(true);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Look Up History</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLookup} className="space-y-3">
            <div>
              <Label htmlFor="history-prompt">Message</Label>
              <textarea
                id="history-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="Enter the prompt to look up..."
              />
            </div>

            <div className="flex flex-wrap gap-3 items-end">
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
                <Label htmlFor="history-temp">Temperature</Label>
                <Input
                  id="history-temp"
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                  className="mt-1"
                />
              </div>

              <Button type="submit" disabled={!prompt.trim()}>
                <History className="mr-1.5 size-3.5" />
                Look Up
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {submitted && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Response Timeline</CardTitle>
              {history && (
                <span className="text-xs text-muted-foreground">
                  {history.length} version{history.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {history === undefined ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No history found for this request. Send the prompt first from
                the Prompt page.
              </p>
            ) : (
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />

                <div className="space-y-4">
                  {history.map((entry: HistoryEntry, i: number) => (
                    <div key={`${entry.storedAt}-${i}`} className="relative pl-10">
                      {/* Timeline dot */}
                      <div className="absolute left-[9px] top-1.5 size-3.5 rounded-full border-2 border-background bg-border flex items-center justify-center">
                        {entry.isCurrent ? (
                          <CheckCircle2 className="size-3.5 text-primary" />
                        ) : (
                          <Clock className="size-3.5 text-muted-foreground" />
                        )}
                      </div>

                      <div className="rounded-md border bg-card p-3 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-muted-foreground">
                            {formatDate(entry.storedAt)}
                          </span>
                          {entry.isCurrent ? (
                            <Badge variant="default" className="text-[10px]">
                              Current
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">
                              Archived
                            </Badge>
                          )}
                          {entry.modelVersion && (
                            <Badge variant="secondary" className="text-[10px]">
                              {entry.modelVersion}
                            </Badge>
                          )}
                          {entry.tags?.map((tag) => (
                            <Badge
                              key={tag}
                              variant="outline"
                              className="text-[10px]"
                            >
                              {tag}
                            </Badge>
                          ))}
                        </div>

                        <p className="text-sm">{extractContent(entry.response)}</p>

                        <details className="text-xs">
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
                            Raw response
                          </summary>
                          <pre className="mt-1 font-mono bg-muted rounded-md p-2 overflow-x-auto max-h-48 overflow-y-auto">
                            {JSON.stringify(entry.response, null, 2)}
                          </pre>
                        </details>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
