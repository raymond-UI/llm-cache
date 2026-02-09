"use client";

import HistoryPanel from "@/components/history-panel";

export default function HistoryPage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-4">
      <div className="mb-4">
        <h1 className="text-lg font-semibold tracking-tight">Time Travel</h1>
        <p className="text-xs text-muted-foreground">
          View the full response history for a request. Each time the same
          prompt produces a different response, the old one is archived.
        </p>
      </div>

      <HistoryPanel />
    </div>
  );
}
