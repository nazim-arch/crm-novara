"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createTaskSchema, type CreateTaskInput } from "@/lib/validations/task";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";

type User = { id: string; name: string };
type Lead = { id: string; lead_number: string; full_name: string };
type Opportunity = { id: string; opp_number: string; name: string };
type Client = { id: string; name: string };

interface TaskFormProps {
  users: User[];
  leads: Lead[];
  opportunities: Opportunity[];
  clients: Client[];
  currentUserId: string;
  defaultValues?: Partial<CreateTaskInput>;
  taskId?: string;
  defaultLeadId?: string;
  defaultOpportunityId?: string;
}

export function TaskForm({
  users,
  leads,
  opportunities,
  clients,
  currentUserId,
  defaultValues,
  taskId,
  defaultLeadId,
  defaultOpportunityId,
}: TaskFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [revenueTagged, setRevenueTagged] = useState(defaultValues?.revenue_tagged ?? false);
  const [assignedToId, setAssignedToId] = useState(defaultValues?.assigned_to_id ?? currentUserId);
  const [selectedLeadId, setSelectedLeadId] = useState(defaultLeadId ?? defaultValues?.lead_id ?? "none");
  const [selectedOppId, setSelectedOppId] = useState(defaultOpportunityId ?? defaultValues?.opportunity_id ?? "none");
  const [selectedClientId, setSelectedClientId] = useState(defaultValues?.client_id ?? "none");
  const isEditing = !!taskId;

  const SECTORS = ["Novara", "Sage", "Podcast", "Trade"];

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<CreateTaskInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(createTaskSchema) as any,
    defaultValues: {
      assigned_to_id: currentUserId,
      priority: "Medium",
      recurrence: "None",
      revenue_tagged: false,
      lead_id: defaultLeadId,
      opportunity_id: defaultOpportunityId,
      ...defaultValues,
    },
  });

  const onSubmit = async (data: CreateTaskInput) => {
    setLoading(true);
    try {
      const url = isEditing ? `/api/tasks/${taskId}` : "/api/tasks";
      const method = isEditing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error ?? "Failed to save task");
        return;
      }
      toast.success(isEditing ? "Task updated" : "Task created");
      router.push(`/tasks/${result.data.id}`);
      router.refresh();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title *</Label>
            <Input id="title" {...register("title")} placeholder="Task title" />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" {...register("description")} rows={3} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Assigned To *</Label>
              <Select
                value={assignedToId}
                onValueChange={(v) => { if (v) { setAssignedToId(v); setValue("assigned_to_id", v); } }}
              >
                <SelectTrigger>
                  <SelectValue>
                    {users.find((u) => u.id === assignedToId)?.name ?? "Select user"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.assigned_to_id && <p className="text-xs text-destructive">{errors.assigned_to_id.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select
                defaultValue="Medium"
                onValueChange={(v) => v && setValue("priority", v as CreateTaskInput["priority"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Low">Low</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="due_date">Due Date *</Label>
              <Input id="due_date" type="date" {...register("due_date")} />
              {errors.due_date && <p className="text-xs text-destructive">{errors.due_date.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="start_date">Start Date</Label>
              <Input id="start_date" type="date" {...register("start_date")} />
            </div>

            <div className="space-y-1.5">
              <Label>Sector</Label>
              <Select
                defaultValue={defaultValues?.sector ?? ""}
                onValueChange={(v) => setValue("sector", v || undefined)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select sector" />
                </SelectTrigger>
                <SelectContent>
                  {SECTORS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Recurrence</Label>
              <Select
                defaultValue="None"
                onValueChange={(v) => v && setValue("recurrence", v as CreateTaskInput["recurrence"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="None">No recurrence</SelectItem>
                  <SelectItem value="Daily">Daily</SelectItem>
                  <SelectItem value="Weekly">Weekly</SelectItem>
                  <SelectItem value="Monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Link to Lead or Opportunity */}
          <div className="space-y-1.5">
            <Label>Link to Lead (optional)</Label>
            <Select
              value={selectedLeadId}
              onValueChange={(v) => {
                setSelectedLeadId(v ?? "none");
                setValue("lead_id", v === "none" || !v ? undefined : v);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {selectedLeadId === "none"
                    ? "No lead"
                    : leads.find((l) => l.id === selectedLeadId)
                      ? `${leads.find((l) => l.id === selectedLeadId)!.lead_number} – ${leads.find((l) => l.id === selectedLeadId)!.full_name}`
                      : "Select lead"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No lead</SelectItem>
                {leads.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.lead_number} – {l.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Link to Opportunity (optional)</Label>
            <Select
              value={selectedOppId}
              onValueChange={(v) => {
                setSelectedOppId(v ?? "none");
                setValue("opportunity_id", v === "none" || !v ? undefined : v);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {selectedOppId === "none"
                    ? "No opportunity"
                    : opportunities.find((o) => o.id === selectedOppId)
                      ? `${opportunities.find((o) => o.id === selectedOppId)!.opp_number} – ${opportunities.find((o) => o.id === selectedOppId)!.name}`
                      : "Select opportunity"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No opportunity</SelectItem>
                {opportunities.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.opp_number} – {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Client (optional)</Label>
            <Select
              value={selectedClientId}
              onValueChange={(v) => {
                setSelectedClientId(v ?? "none");
                setValue("client_id", v === "none" || !v ? undefined : v);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {selectedClientId === "none"
                    ? "No client"
                    : clients.find((c) => c.id === selectedClientId)?.name ?? "Select client"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No client</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Revenue tagging */}
          <div className="flex items-center gap-3 p-3 border rounded-lg">
            <Switch
              checked={revenueTagged}
              onCheckedChange={(v) => {
                setRevenueTagged(v);
                setValue("revenue_tagged", v);
              }}
            />
            <Label className="cursor-pointer">Revenue-tagged task</Label>
            {revenueTagged && (
              <Input
                type="number"
                placeholder="Amount (₹)"
                {...register("revenue_amount")}
                className="ml-auto w-36"
              />
            )}
          </div>
          {errors.revenue_amount && (
            <p className="text-xs text-destructive">{errors.revenue_amount.message}</p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" {...register("notes")} rows={2} />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3 mt-4 justify-end">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? "Update Task" : "Create Task"}
        </Button>
      </div>
    </form>
  );
}
