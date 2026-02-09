"use client";

import { useQuery } from "convex/react";
import { BarChart3, Database, Zap } from "lucide-react";

import { api } from "../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-4 pb-3">
        <div className="rounded-md bg-muted p-2">
          <Icon className="size-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-2xl font-semibold tracking-tight">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function BarSection({
  title,
  data,
}: {
  title: string;
  data: Record<string, number>;
}) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(([, v]) => v), 1);

  if (entries.length === 0) {
    return (
      <div>
        <h4 className="text-sm font-medium mb-2">{title}</h4>
        <p className="text-xs text-muted-foreground">No data yet</p>
      </div>
    );
  }

  return (
    <div>
      <h4 className="text-sm font-medium mb-2">{title}</h4>
      <div className="space-y-1.5">
        {entries.map(([model, count]) => (
          <div key={model} className="flex items-center gap-3">
            <span className="text-xs w-36 text-right truncate text-muted-foreground font-mono">
              {model}
            </span>
            <div className="flex-1 h-6 bg-muted rounded-md overflow-hidden">
              <div
                className="h-full bg-primary/80 rounded-md flex items-center px-2 transition-all"
                style={{ width: `${Math.max((count / max) * 100, 8)}%` }}
              >
                <span className="text-[10px] font-medium text-primary-foreground">
                  {count}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StatsDashboard() {
  const stats = useQuery(api.llm.getStats);

  if (stats === undefined) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
        <Skeleton className="h-32" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Total Entries"
          value={stats.totalEntries}
          icon={Database}
        />
        <StatCard
          label="Total Hits"
          value={stats.totalHits}
          icon={Zap}
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="size-4" />
            Breakdown by Model
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <BarSection title="Entries" data={stats.entriesByModel} />
          <BarSection title="Hits" data={stats.hitsByModel} />
        </CardContent>
      </Card>
    </div>
  );
}
