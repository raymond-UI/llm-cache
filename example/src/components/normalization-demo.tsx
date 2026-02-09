"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { FlaskConical, Play } from "lucide-react";
import { toast } from "sonner";

import { api } from "../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type DemoResult = {
  label: string;
  description: string;
  cacheKey: string;
  fromCache: boolean;
};

export default function NormalizationDemo() {
  const [results, setResults] = useState<DemoResult[] | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const runDemo = useAction(api.llmActions.normalizationDemo);

  async function handleRun() {
    setIsRunning(true);
    setResults(null);
    try {
      const res = await runDemo({});
      setResults(res as DemoResult[]);
      toast.success("Normalization demo complete");
    } catch (err) {
      toast.error("Demo failed");
      console.error(err);
    } finally {
      setIsRunning(false);
    }
  }

  const allSameKey =
    results &&
    results.length > 1 &&
    results.every((r) => r.cacheKey === results[0].cacheKey);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="size-4" />
            How Normalization Works
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            The LLM Cache normalizes requests before generating cache keys. This
            means different-looking requests that are semantically identical
            produce the <strong>same cache key</strong>. Normalization includes:
          </p>
          <ul className="text-sm text-muted-foreground list-disc list-inside space-y-0.5">
            <li>Sorting object keys alphabetically</li>
            <li>Trimming whitespace from string values</li>
            <li>Lowercasing the model name</li>
            <li>Rounding floats to 2 decimal places</li>
            <li>Stripping null/undefined values</li>
          </ul>

          <Button onClick={handleRun} disabled={isRunning}>
            <Play className="mr-1.5 size-3.5" />
            {isRunning ? "Running..." : "Run Demo"}
          </Button>
        </CardContent>
      </Card>

      {results && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Results</CardTitle>
              {allSameKey && (
                <Badge variant="default" className="text-xs">
                  All keys match
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-0 divide-y">
              {/* Header */}
              <div className="grid grid-cols-[140px_1fr_180px_80px] gap-3 pb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                <span>Variant</span>
                <span>What Changed</span>
                <span>Cache Key</span>
                <span className="text-right">Result</span>
              </div>

              {results.map((r, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[140px_1fr_180px_80px] gap-3 py-2 items-center"
                >
                  <span className="text-sm font-medium">{r.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {r.description}
                  </span>
                  <span className="text-xs font-mono text-muted-foreground truncate">
                    {r.cacheKey.slice(0, 24)}...
                  </span>
                  <div className="text-right">
                    <Badge
                      variant={r.fromCache ? "default" : "secondary"}
                      className="text-[10px]"
                    >
                      {r.fromCache ? "HIT" : "MISS"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>

            {allSameKey && (
              <div className="mt-3 rounded-md bg-muted p-3">
                <p className="text-xs text-muted-foreground">
                  All 4 variants produced the same cache key:{" "}
                  <code className="font-mono">{results[0].cacheKey.slice(0, 32)}...</code>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  The first request was a <strong>cache miss</strong> (stored the
                  response). The remaining 3 were <strong>cache hits</strong>,
                  proving that normalization correctly identifies identical requests
                  despite surface-level differences.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
