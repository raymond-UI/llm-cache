"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function InvalidationPanel() {
  const [cacheKey, setCacheKey] = useState("");
  const [model, setModel] = useState("");
  const [modelVersion, setModelVersion] = useState("");
  const [tag, setTag] = useState("");
  const [before, setBefore] = useState("");
  const [result, setResult] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const invalidate = useMutation(api.llm.invalidateEntries);

  async function handleInvalidate() {
    setIsRunning(true);
    try {
      const args: Record<string, string | number> = {};
      if (cacheKey.trim()) args.cacheKey = cacheKey.trim();
      if (model.trim()) args.model = model.trim();
      if (modelVersion.trim()) args.modelVersion = modelVersion.trim();
      if (tag.trim()) args.tag = tag.trim();
      if (before) args.before = new Date(before).getTime();

      if (Object.keys(args).length === 0) {
        toast.error("Provide at least one filter");
        return;
      }

      const count = await invalidate(args as Parameters<typeof invalidate>[0]);
      setResult(count);
      toast.success(`Deleted ${count} entr${count === 1 ? "y" : "ies"}`);
    } catch (err) {
      toast.error("Invalidation failed");
      console.error(err);
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Trash2 className="size-4" />
          Invalidate Cache Entries
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Delete entries matching your criteria. Use <strong>Cache Key</strong>{" "}
          for single-entry deletion, or other fields for bulk operations.
        </p>

        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[200px]">
            <Label htmlFor="inv-key">Cache Key</Label>
            <Input
              id="inv-key"
              value={cacheKey}
              onChange={(e) => setCacheKey(e.target.value)}
              placeholder="Full 64-char hex key"
              className="mt-1 font-mono text-xs"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="w-36">
            <Label htmlFor="inv-model">Model</Label>
            <Input
              id="inv-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-4o"
              className="mt-1"
            />
          </div>
          <div className="w-28">
            <Label htmlFor="inv-version">Model Version</Label>
            <Input
              id="inv-version"
              value={modelVersion}
              onChange={(e) => setModelVersion(e.target.value)}
              placeholder="v1.0"
              className="mt-1"
            />
          </div>
          <div className="w-28">
            <Label htmlFor="inv-tag">Tag</Label>
            <Input
              id="inv-tag"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="chat"
              className="mt-1"
            />
          </div>
          <div className="w-52">
            <Label htmlFor="inv-before">Before</Label>
            <Input
              id="inv-before"
              type="datetime-local"
              value={before}
              onChange={(e) => setBefore(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          {result !== null && (
            <p className="text-sm">
              Deleted <strong>{result}</strong> entr{result === 1 ? "y" : "ies"}
            </p>
          )}
          <div className="ml-auto">
            <Button
              variant="destructive"
              onClick={handleInvalidate}
              disabled={isRunning}
            >
              <Trash2 className="mr-1.5 size-3.5" />
              {isRunning ? "Invalidating..." : "Invalidate"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
