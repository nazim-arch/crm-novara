"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ClipboardList } from "lucide-react";

type Option = { id: string; name: string };

/**
 * Lets the user prefill the New Task form from a saved template. Selecting one
 * navigates to /tasks/new?template=<id> (preserving any lead/opportunity link),
 * which the server page reads to build defaultValues.
 */
export function TaskTemplatePicker({ templates, current }: { templates: Option[]; current?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  if (templates.length === 0) return null;

  const onPick = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (id === "none") params.delete("template");
    else params.set("template", id);
    router.push(`/tasks/new?${params.toString()}`);
  };

  return (
    <div className="mb-4 flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
      <ClipboardList className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="text-sm font-medium">Start from template</span>
      <Select value={current ?? "none"} onValueChange={(v) => v && onPick(v)}>
        <SelectTrigger className="h-8 w-56 text-sm ml-auto">
          <SelectValue>
            {current ? templates.find((t) => t.id === current)?.name ?? "Choose a template" : "Choose a template"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Blank task</SelectItem>
          {templates.map((t) => (
            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
