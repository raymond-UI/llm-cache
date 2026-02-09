"use client";

import PromptPanel from "@/components/prompt-panel";
import StatsDashboard from "@/components/stats-dashboard";

export default function HomePage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-4">
      <div className="mb-4">
        <h1 className="text-lg font-semibold tracking-tight">Prompt</h1>
        <p className="text-xs text-muted-foreground">
          Send prompts to simulated LLM models. Repeated requests return cached
          responses instantly.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <PromptPanel />
        <StatsDashboard />
      </div>
    </div>
  );
}
