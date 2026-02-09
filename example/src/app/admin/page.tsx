"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ConfigPanel from "@/components/config-panel";
import InvalidationPanel from "@/components/invalidation-panel";
import CleanupPanel from "@/components/cleanup-panel";

export default function AdminPage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-4">
      <div className="mb-4">
        <h1 className="text-lg font-semibold tracking-tight">Admin</h1>
        <p className="text-xs text-muted-foreground">
          Configure cache behavior, invalidate entries, and clean up expired data.
        </p>
      </div>

      <Tabs defaultValue="config">
        <TabsList>
          <TabsTrigger value="config">Config</TabsTrigger>
          <TabsTrigger value="invalidation">Invalidation</TabsTrigger>
          <TabsTrigger value="cleanup">Cleanup</TabsTrigger>
        </TabsList>
        <TabsContent value="config" className="mt-4">
          <ConfigPanel />
        </TabsContent>
        <TabsContent value="invalidation" className="mt-4">
          <InvalidationPanel />
        </TabsContent>
        <TabsContent value="cleanup" className="mt-4">
          <CleanupPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
