"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ImportPanel } from "@/components/import/ImportPanel";
import { leadImportConfig } from "@/lib/import/configs/lead.config";
import { opportunityImportConfig } from "@/lib/import/configs/opportunity.config";
import { taskImportConfig } from "@/lib/import/configs/task.config";
import { clientImportConfig } from "@/lib/import/configs/client.config";

const CONFIGS = [leadImportConfig, opportunityImportConfig, taskImportConfig, clientImportConfig];

export function ImportHubClient() {
  return (
    <Tabs defaultValue="lead" className="w-full">
      <TabsList>
        {CONFIGS.map((c) => (
          <TabsTrigger key={c.entity} value={c.entity}>{c.label}</TabsTrigger>
        ))}
      </TabsList>
      {CONFIGS.map((c) => (
        <TabsContent key={c.entity} value={c.entity} className="pt-4">
          <ImportPanel config={c} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
