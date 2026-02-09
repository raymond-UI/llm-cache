"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { Eraser } from "lucide-react";
import { toast } from "sonner";

import { api } from "../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CleanupResult = {
  deletedCount: number;
  keys: string[];
  hasMore: boolean;
};

export default function CleanupPanel() {
  const [batchSize, setBatchSize] = useState("100");
  const [dryRun, setDryRun] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<CleanupResult | null>(null);

  const cleanup = useAction(api.llm.cleanupExpired);

  async function handleCleanup() {
    setIsRunning(true);
    try {
      const res = await cleanup({
        batchSize: parseInt(batchSize) || 100,
        dryRun,
      });
      setResult(res as CleanupResult);
      if (dryRun) {
        toast.info(`Dry run: would delete ${(res as CleanupResult).deletedCount} entries`);
      } else {
        toast.success(`Cleaned up ${(res as CleanupResult).deletedCount} expired entries`);
      }
    } catch (err) {
      toast.error("Cleanup failed");
      console.error(err);
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Eraser className="size-4" />
          Cleanup Expired Entries
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Remove cache entries whose TTL has expired. Use dry run mode to preview
          what would be deleted.
        </p>

        <div className="flex items-end gap-3">
          <div className="w-28">
            <Label htmlFor="batch-size">Batch Size</Label>
            <Input
              id="batch-size"
              type="number"
              value={batchSize}
              onChange={(e) => setBatchSize(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="flex items-center space-x-2 pb-2">
            <Checkbox
              id="dry-run"
              checked={dryRun}
              onCheckedChange={(c) => setDryRun(c === true)}
            />
            <Label htmlFor="dry-run" className="text-sm font-normal">
              Dry run (preview only)
            </Label>
          </div>
          <div className="ml-auto pb-1">
            <Button onClick={handleCleanup} disabled={isRunning}>
              <Eraser className="mr-1.5 size-3.5" />
              {isRunning ? "Running..." : "Run Cleanup"}
            </Button>
          </div>
        </div>

        {result && (
          <div className="rounded-md bg-muted p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant={dryRun ? "secondary" : "default"} className="text-xs">
                {dryRun ? "Dry Run" : "Executed"}
              </Badge>
              <span className="text-sm font-medium">
                {result.deletedCount} entr{result.deletedCount === 1 ? "y" : "ies"}
                {dryRun ? " would be" : ""} deleted
              </span>
              {result.hasMore && (
                <Badge variant="outline" className="text-xs">
                  Has more
                </Badge>
              )}
            </div>
            {result.keys.length > 0 && (
              <div className="text-xs font-mono text-muted-foreground max-h-32 overflow-y-auto space-y-0.5">
                {result.keys.map((key) => (
                  <div key={key} className="truncate">
                    {key}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
