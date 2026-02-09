"use client";

import NormalizationDemo from "@/components/normalization-demo";

export default function NormalizePage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-4">
      <div className="mb-4">
        <h1 className="text-lg font-semibold tracking-tight">Normalization Demo</h1>
        <p className="text-xs text-muted-foreground">
          See how request normalization ensures semantically identical prompts
          share the same cache entry.
        </p>
      </div>

      <NormalizationDemo />
    </div>
  );
}
