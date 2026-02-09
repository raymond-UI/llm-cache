"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { api } from "../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

const TIER_LABELS: Record<number, { label: string; variant: "default" | "secondary" | "outline" }> = {
  0: { label: "Default", variant: "outline" },
  1: { label: "Promoted", variant: "secondary" },
  2: { label: "Pinned", variant: "default" },
};

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 0) {
    const abs = -diff;
    if (abs < 60_000) return `in ${Math.round(abs / 1000)}s`;
    if (abs < 3_600_000) return `in ${Math.round(abs / 60_000)}m`;
    if (abs < 86_400_000) return `in ${(abs / 3_600_000).toFixed(1)}h`;
    return `in ${(abs / 86_400_000).toFixed(1)}d`;
  }
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${(diff / 3_600_000).toFixed(1)}h ago`;
  return `${(diff / 86_400_000).toFixed(1)}d ago`;
}

type CacheEntry = {
  _id: string;
  cacheKey: string;
  model: string;
  hitCount: number;
  ttlTier: number;
  createdAt: number;
  expiresAt?: number;
  lastAccessedAt: number;
  request: unknown;
  response: unknown;
  tags?: string[];
  metadata?: unknown;
  modelVersion?: string;
};

function EntryRow({
  entry,
  isExpanded,
  onToggle,
}: {
  entry: CacheEntry;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const tier = TIER_LABELS[entry.ttlTier] ?? TIER_LABELS[0];

  return (
    <div className="border-b last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="text-xs font-mono truncate w-36 shrink-0 text-muted-foreground">
          {entry.cacheKey.slice(0, 16)}...
        </span>
        <span className="text-xs w-32 shrink-0 truncate">{entry.model}</span>
        <span className="text-xs w-12 shrink-0 text-right">{entry.hitCount}</span>
        <Badge variant={tier.variant} className="text-[10px] shrink-0">
          {tier.label}
        </Badge>
        <span className="text-xs text-muted-foreground w-20 shrink-0 text-right">
          {formatRelative(entry.createdAt)}
        </span>
        <span className="text-xs text-muted-foreground w-20 shrink-0 text-right">
          {entry.expiresAt ? formatRelative(entry.expiresAt) : "Never"}
        </span>
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 space-y-2 bg-muted/30">
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>Key: <code className="font-mono">{entry.cacheKey}</code></span>
            {entry.modelVersion && <span>Version: {entry.modelVersion}</span>}
            <span>Last accessed: {formatRelative(entry.lastAccessedAt)}</span>
          </div>

          {entry.tags && entry.tags.length > 0 && (
            <div className="flex gap-1">
              {entry.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-[10px]">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          <div>
            <p className="text-xs font-medium mb-1">Request</p>
            <pre className="text-xs font-mono bg-background rounded-md p-2 overflow-x-auto max-h-48 overflow-y-auto">
              {JSON.stringify(entry.request, null, 2)}
            </pre>
          </div>

          <div>
            <p className="text-xs font-medium mb-1">Response</p>
            <pre className="text-xs font-mono bg-background rounded-md p-2 overflow-x-auto max-h-48 overflow-y-auto">
              {JSON.stringify(entry.response, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CacheExplorer() {
  const [modelFilter, setModelFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [limit, setLimit] = useState("20");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const queryArgs = useMemo(() => {
    const args: {
      model?: string;
      tag?: string;
      limit?: number;
    } = {};
    if (modelFilter.trim()) args.model = modelFilter.trim();
    if (tagFilter.trim()) args.tag = tagFilter.trim();
    const l = parseInt(limit);
    if (l > 0) args.limit = l;
    return args;
  }, [modelFilter, tagFilter, limit]);

  const entries = useQuery(api.llm.queryEntries, queryArgs);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <div className="w-36">
              <Label htmlFor="model-filter">Model</Label>
              <Input
                id="model-filter"
                value={modelFilter}
                onChange={(e) => setModelFilter(e.target.value)}
                placeholder="gpt-4o"
                className="mt-1"
              />
            </div>
            <div className="w-36">
              <Label htmlFor="tag-filter">Tag</Label>
              <Input
                id="tag-filter"
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                placeholder="chat"
                className="mt-1"
              />
            </div>
            <div className="w-20">
              <Label htmlFor="limit">Limit</Label>
              <Input
                id="limit"
                type="number"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Cached Entries
            {entries && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                ({entries.length} result{entries.length !== 1 ? "s" : ""})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Header row */}
          <div className="flex items-center gap-3 px-3 py-1.5 border-b text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            <span className="w-3.5 shrink-0" />
            <span className="w-36 shrink-0">Cache Key</span>
            <span className="w-32 shrink-0">Model</span>
            <span className="w-12 shrink-0 text-right">Hits</span>
            <span className="w-16 shrink-0">Tier</span>
            <span className="w-20 shrink-0 text-right">Created</span>
            <span className="w-20 shrink-0 text-right">Expires</span>
          </div>

          {entries === undefined ? (
            <div className="p-3 space-y-2">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          ) : entries.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">
              No cached entries found. Send some prompts first!
            </p>
          ) : (
            entries.map((entry: CacheEntry) => (
              <EntryRow
                key={entry.cacheKey}
                entry={entry}
                isExpanded={expandedKey === entry.cacheKey}
                onToggle={() =>
                  setExpandedKey(
                    expandedKey === entry.cacheKey ? null : entry.cacheKey,
                  )
                }
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
