"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Save, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

function formatMs(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(1)}h`;
  return `${(ms / 86_400_000).toFixed(1)}d`;
}

export default function ConfigPanel() {
  const config = useQuery(api.llm.getConfig);
  const updateConfig = useMutation(api.llm.updateConfig);

  const [defaultTtlMs, setDefaultTtlMs] = useState("");
  const [promotionTtlMs, setPromotionTtlMs] = useState("");
  const [ttlByModel, setTtlByModel] = useState("");
  const [ttlByTag, setTtlByTag] = useState("");
  const [normalizeRequests, setNormalizeRequests] = useState(true);
  const [maxEntries, setMaxEntries] = useState("");
  const [replaceMode, setReplaceMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    setIsSaving(true);
    try {
      const cfg: Record<string, unknown> = {};
      if (defaultTtlMs.trim()) cfg.defaultTtlMs = parseInt(defaultTtlMs);
      if (promotionTtlMs.trim()) cfg.promotionTtlMs = parseInt(promotionTtlMs);
      if (maxEntries.trim()) cfg.maxEntries = parseInt(maxEntries);
      cfg.normalizeRequests = normalizeRequests;

      if (ttlByModel.trim()) {
        try {
          cfg.ttlByModel = JSON.parse(ttlByModel);
        } catch {
          toast.error("Invalid JSON for TTL by Model");
          return;
        }
      }
      if (ttlByTag.trim()) {
        try {
          cfg.ttlByTag = JSON.parse(ttlByTag);
        } catch {
          toast.error("Invalid JSON for TTL by Tag");
          return;
        }
      }

      await updateConfig({
        config: cfg as Parameters<typeof updateConfig>[0]["config"],
        replace: replaceMode || undefined,
      });
      toast.success("Config updated");
    } catch (err) {
      toast.error("Failed to update config");
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <RefreshCw className="size-4" />
            Current Config
          </CardTitle>
        </CardHeader>
        <CardContent>
          {config === undefined ? (
            <Skeleton className="h-24" />
          ) : config === null ? (
            <p className="text-sm text-muted-foreground">No config set. Using defaults.</p>
          ) : (
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              {config.defaultTtlMs != null && (
                <>
                  <span className="text-muted-foreground">Default TTL</span>
                  <span>{formatMs(config.defaultTtlMs)} ({config.defaultTtlMs.toLocaleString()} ms)</span>
                </>
              )}
              {config.promotionTtlMs != null && (
                <>
                  <span className="text-muted-foreground">Promotion TTL</span>
                  <span>{formatMs(config.promotionTtlMs)} ({config.promotionTtlMs.toLocaleString()} ms)</span>
                </>
              )}
              {config.normalizeRequests != null && (
                <>
                  <span className="text-muted-foreground">Normalize</span>
                  <span>{config.normalizeRequests ? "Yes" : "No"}</span>
                </>
              )}
              {config.maxEntries != null && (
                <>
                  <span className="text-muted-foreground">Max Entries</span>
                  <span>{config.maxEntries.toLocaleString()}</span>
                </>
              )}
              {config.ttlByModel && Object.keys(config.ttlByModel).length > 0 && (
                <>
                  <span className="text-muted-foreground">TTL by Model</span>
                  <pre className="text-xs font-mono">{JSON.stringify(config.ttlByModel, null, 2)}</pre>
                </>
              )}
              {config.ttlByTag && Object.keys(config.ttlByTag).length > 0 && (
                <>
                  <span className="text-muted-foreground">TTL by Tag</span>
                  <pre className="text-xs font-mono">{JSON.stringify(config.ttlByTag, null, 2)}</pre>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Save className="size-4" />
            Update Config
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <div className="w-40">
              <Label htmlFor="defaultTtl">Default TTL (ms)</Label>
              <Input
                id="defaultTtl"
                type="number"
                value={defaultTtlMs}
                onChange={(e) => setDefaultTtlMs(e.target.value)}
                placeholder="86400000 (24h)"
                className="mt-1"
              />
              {defaultTtlMs && !isNaN(parseInt(defaultTtlMs)) && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  = {formatMs(parseInt(defaultTtlMs))}
                </p>
              )}
            </div>
            <div className="w-40">
              <Label htmlFor="promotionTtl">Promotion TTL (ms)</Label>
              <Input
                id="promotionTtl"
                type="number"
                value={promotionTtlMs}
                onChange={(e) => setPromotionTtlMs(e.target.value)}
                placeholder="604800000 (7d)"
                className="mt-1"
              />
              {promotionTtlMs && !isNaN(parseInt(promotionTtlMs)) && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  = {formatMs(parseInt(promotionTtlMs))}
                </p>
              )}
            </div>
            <div className="w-28">
              <Label htmlFor="maxEntries">Max Entries</Label>
              <Input
                id="maxEntries"
                type="number"
                value={maxEntries}
                onChange={(e) => setMaxEntries(e.target.value)}
                placeholder="10000"
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="ttlByModel">TTL by Model (JSON)</Label>
            <textarea
              id="ttlByModel"
              value={ttlByModel}
              onChange={(e) => setTtlByModel(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              placeholder='{"gpt-3.5-turbo": 3600000}'
            />
          </div>

          <div>
            <Label htmlFor="ttlByTag">TTL by Tag (JSON)</Label>
            <textarea
              id="ttlByTag"
              value={ttlByTag}
              onChange={(e) => setTtlByTag(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              placeholder='{"important": 604800000}'
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="normalize"
                  checked={normalizeRequests}
                  onCheckedChange={(c) => setNormalizeRequests(c === true)}
                />
                <Label htmlFor="normalize" className="text-sm font-normal">
                  Normalize requests
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="replace"
                  checked={replaceMode}
                  onCheckedChange={(c) => setReplaceMode(c === true)}
                />
                <Label htmlFor="replace" className="text-sm font-normal">
                  Replace mode (clear unset fields)
                </Label>
              </div>
            </div>

            <Button onClick={handleSave} disabled={isSaving}>
              <Save className="mr-1.5 size-3.5" />
              {isSaving ? "Saving..." : "Save Config"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
