"use client";

import CacheExplorer from "@/components/cache-explorer";

export default function ExplorerPage() {
  return (
    <div className="container mx-auto max-w-5xl px-4 py-4">
      <div className="mb-4">
        <h1 className="text-lg font-semibold tracking-tight">Cache Explorer</h1>
        <p className="text-xs text-muted-foreground">
          Browse and filter all cached LLM responses. Click a row to see the
          full request/response.
        </p>
      </div>

      <CacheExplorer />
    </div>
  );
}
