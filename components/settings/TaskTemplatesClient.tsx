"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { Plus, Trash2, Loader2, ClipboardList, RefreshCw, ListChecks } from "lucide-react";
import type { ChecklistItem } from "@/lib/checklist";

type User = { id: string; name: string };
type Client = { id: string; name: string };

type TemplateRow = {
  id: string;
  name: string;
  title: string;
  priority: string;
  sector: string | null;
  due_in_days: number | null;
  recurrence: string;
  recurrence_interval: number;
  default_assignee: { id: string; name: string } | null;
  client: { id: string; name: string } | null;
  checklistCount: number;
};

const SECTORS = ["Novara", "Sage", "Podcast", "Trade"];
const EMPTY = {
  name: "", title: "", description: "", priority: "Medium", sector: "",
  due_in_days: "", recurrence: "None", recurrence_interval: "1",
  default_assignee_id: "none", client_id: "none",
};

export function TaskTemplatesClient({
  initialTemplates, users, clients,
}: {
  initialTemplates: TemplateRow[];
  users: User[];
  clients: Client[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [form, setForm] = useState({ ...EMPTY });
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const addItem = () => setChecklist((p) => [...p, { text: "", done: false }]);
  const updItem = (i: number, text: string) => setChecklist((p) => p.map((it, idx) => (idx === i ? { ...it, text } : it)));
  const rmItem = (i: number) => setChecklist((p) => p.filter((_, idx) => idx !== i));

  async function create() {
    if (form.name.trim().length < 2 || form.title.trim().length < 3) {
      toast.error("Name (2+) and title (3+) are required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        title: form.title.trim(),
        description: form.description || undefined,
        priority: form.priority,
        sector: form.sector || undefined,
        checklist: checklist.filter((i) => i.text.trim() !== ""),
        due_in_days: form.due_in_days === "" ? undefined : Number(form.due_in_days),
        recurrence: form.recurrence,
        recurrence_interval: Number(form.recurrence_interval) || 1,
        default_assignee_id: form.default_assignee_id === "none" ? undefined : form.default_assignee_id,
        client_id: form.client_id === "none" ? undefined : form.client_id,
      };
      const res = await fetch("/api/task-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error ?? "Failed to create template");
        return;
      }
      toast.success("Template created");
      setForm({ ...EMPTY });
      setChecklist([]);
      setOpen(false);
      startTransition(() => router.refresh());
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete template "${name}"?`)) return;
    try {
      const res = await fetch(`/api/task-templates/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Failed to delete template");
        return;
      }
      toast.success("Template deleted");
      startTransition(() => router.refresh());
    } catch {
      toast.error("Something went wrong");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen((o) => !o)}>
          <Plus className="h-4 w-4" /> New Template
        </Button>
      </div>

      {open && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Template Name *</Label>
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Site Visit Prep" />
              </div>
              <div className="space-y-1.5">
                <Label>Default Task Title *</Label>
                <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Prepare site visit" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => v && set("priority", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Low">Low</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                    <SelectItem value="Critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Sector</Label>
                <Select value={form.sector || "none"} onValueChange={(v) => { if (v) set("sector", v === "none" ? "" : v); }}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {SECTORS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Due in (days)</Label>
                <Input type="number" min={0} value={form.due_in_days} onChange={(e) => set("due_in_days", e.target.value)} placeholder="e.g. 3" />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Recurrence</Label>
                <Select value={form.recurrence} onValueChange={(v) => v && set("recurrence", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="None">No recurrence</SelectItem>
                    <SelectItem value="Daily">Daily</SelectItem>
                    <SelectItem value="Weekly">Weekly</SelectItem>
                    <SelectItem value="Monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.recurrence !== "None" && (
                <div className="space-y-1.5">
                  <Label>Every</Label>
                  <Input type="number" min={1} value={form.recurrence_interval} onChange={(e) => set("recurrence_interval", e.target.value)} />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Default Assignee</Label>
                <Select value={form.default_assignee_id} onValueChange={(v) => v && set("default_assignee_id", v)}>
                  <SelectTrigger>
                    <SelectValue>
                      {form.default_assignee_id === "none" ? "Task creator" : users.find((u) => u.id === form.default_assignee_id)?.name ?? "Task creator"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Task creator</SelectItem>
                    {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Client</Label>
                <Select value={form.client_id} onValueChange={(v) => v && set("client_id", v)}>
                  <SelectTrigger>
                    <SelectValue>
                      {form.client_id === "none" ? "No client" : clients.find((c) => c.id === form.client_id)?.name ?? "No client"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No client</SelectItem>
                    {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Checklist */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Checklist</Label>
                <Button type="button" variant="outline" size="xs" onClick={addItem}>
                  <Plus className="h-3.5 w-3.5" /> Add item
                </Button>
              </div>
              {checklist.map((it, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={it.text} placeholder={`Step ${i + 1}`} onChange={(e) => updItem(i, e.target.value)} className="h-8 flex-1 text-sm" />
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => rmItem(i)} aria-label="Remove">
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setOpen(false); setForm({ ...EMPTY }); setChecklist([]); }}>Cancel</Button>
              <Button onClick={create} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Create Template
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {initialTemplates.length === 0 ? (
        <Card>
          <EmptyState icon={ClipboardList} title="No templates yet" description="Create a template to speed up repeated task setups." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {initialTemplates.map((t) => (
            <Card key={t.id}>
              <CardContent className="pt-4 flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium truncate">{t.name}</p>
                  <p className="text-sm text-muted-foreground truncate">{t.title}</p>
                  <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground pt-1">
                    <span className="rounded bg-muted px-1.5 py-0.5">{t.priority}</span>
                    {t.sector && <span className="rounded bg-muted px-1.5 py-0.5">{t.sector}</span>}
                    {t.due_in_days != null && <span className="rounded bg-muted px-1.5 py-0.5">Due +{t.due_in_days}d</span>}
                    {t.recurrence !== "None" && (
                      <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">
                        <RefreshCw className="h-3 w-3" />{t.recurrence_interval > 1 ? `${t.recurrence} ×${t.recurrence_interval}` : t.recurrence}
                      </span>
                    )}
                    {t.checklistCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">
                        <ListChecks className="h-3 w-3" />{t.checklistCount}
                      </span>
                    )}
                    {t.default_assignee && <span className="rounded bg-muted px-1.5 py-0.5">{t.default_assignee.name}</span>}
                    {t.client && <span className="rounded bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5">{t.client.name}</span>}
                  </div>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => remove(t.id, t.name)} aria-label="Delete template">
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
