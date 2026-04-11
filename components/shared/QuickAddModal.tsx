"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Users, Building2, CheckSquare, CalendarClock, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type User = { id: string; name: string };
type Lead = { id: string; lead_number: string; full_name: string };
type TaskItem = { id: string; task_number: string; title: string };
type OppItem = { id: string; opp_number: string; name: string };

const LEAD_SOURCES = ["Website", "Facebook", "Instagram", "Google Ads", "Referral", "Walk-in", "Cold Call", "Exhibition", "WhatsApp", "Other"];
const FOLLOW_UP_TYPES = ["Call", "Email", "WhatsApp", "Visit", "Meeting"];
const PROPERTY_TYPES = ["Residential", "Commercial", "Plot", "Villa", "Apartment", "Office"];
const SECTORS = ["Novara", "Sage", "Podcast", "Trade"];

type Mode = "new" | "edit";

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="flex rounded-md border overflow-hidden text-sm mb-1">
      <button
        type="button"
        onClick={() => onChange("new")}
        className={`flex-1 py-1.5 text-center transition-colors ${mode === "new" ? "bg-primary text-primary-foreground" : "bg-transparent hover:bg-muted"}`}
      >
        New
      </button>
      <button
        type="button"
        onClick={() => onChange("edit")}
        className={`flex-1 py-1.5 text-center transition-colors ${mode === "edit" ? "bg-primary text-primary-foreground" : "bg-transparent hover:bg-muted"}`}
      >
        Edit Existing
      </button>
    </div>
  );
}

export function QuickAddModal({ currentUserId, role }: { currentUserId: string; role: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [opps, setOpps] = useState<OppItem[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Mode per tab
  const [leadMode, setLeadMode] = useState<Mode>("new");
  const [oppMode, setOppMode] = useState<Mode>("new");
  const [taskMode, setTaskMode] = useState<Mode>("new");
  const [fuMode, setFuMode] = useState<Mode>("new");

  // Edit selections
  const [editLeadId, setEditLeadId] = useState("none");
  const [editOppId, setEditOppId] = useState("none");
  const [editTaskId, setEditTaskId] = useState("none");

  // Lead form
  const [leadName, setLeadName] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadSource, setLeadSource] = useState("");
  const [leadTemperature, setLeadTemperature] = useState("Cold");

  // Opportunity form
  const [oppName, setOppName] = useState("");
  const [oppProject, setOppProject] = useState("");
  const [oppPropertyType, setOppPropertyType] = useState("");
  const [oppLocation, setOppLocation] = useState("");
  const [oppCommission, setOppCommission] = useState("");

  // Task form
  const [taskTitle, setTaskTitle] = useState("");
  const [taskAssignedTo, setTaskAssignedTo] = useState(currentUserId);
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskLeadId, setTaskLeadId] = useState("none");
  const [taskOppId, setTaskOppId] = useState("none");
  const [taskSector, setTaskSector] = useState("");

  // Follow-up form
  const [fuLinkType, setFuLinkType] = useState<"lead" | "task">("lead");
  const [fuLeadId, setFuLeadId] = useState("none");
  const [fuTaskId, setFuTaskId] = useState("none");
  const [fuType, setFuType] = useState("Call");
  const [fuDate, setFuDate] = useState("");
  const [fuNotes, setFuNotes] = useState("");

  const loadData = useCallback(async () => {
    if (dataLoaded) return;
    try {
      const [usersRes, leadsRes, tasksRes, oppsRes] = await Promise.all([
        fetch("/api/users/assignable"),
        fetch("/api/leads?page=1&limit=200"),
        fetch("/api/tasks?page=1&limit=200&status=Todo,InProgress"),
        fetch("/api/opportunities?status=Active&limit=200"),
      ]);
      if (usersRes.ok) {
        const d = await usersRes.json();
        setUsers(d.data ?? []);
      }
      if (leadsRes.ok) {
        const d = await leadsRes.json();
        setLeads(
          (d.data ?? []).map((l: { id: string; lead_number: string; full_name: string }) => ({
            id: l.id,
            lead_number: l.lead_number,
            full_name: l.full_name,
          }))
        );
      }
      if (tasksRes.ok) {
        const d = await tasksRes.json();
        setTasks(
          (d.data ?? []).map((t: { id: string; task_number: string; title: string }) => ({
            id: t.id,
            task_number: t.task_number,
            title: t.title,
          }))
        );
      }
      if (oppsRes.ok) {
        const d = await oppsRes.json();
        setOpps(
          (d.data ?? []).map((o: { id: string; opp_number: string; name: string }) => ({
            id: o.id,
            opp_number: o.opp_number,
            name: o.name,
          }))
        );
      }
    } catch {
      // silent — forms still work, just no dropdown data
    }
    setDataLoaded(true);
  }, [dataLoaded]);

  useEffect(() => {
    if (open) loadData();
  }, [open, loadData]);

  function resetForms() {
    setLeadMode("new"); setOppMode("new"); setTaskMode("new"); setFuMode("new");
    setEditLeadId("none"); setEditOppId("none"); setEditTaskId("none");
    setLeadName(""); setLeadPhone(""); setLeadSource(""); setLeadTemperature("Cold");
    setOppName(""); setOppProject(""); setOppPropertyType(""); setOppLocation(""); setOppCommission("");
    setTaskTitle(""); setTaskAssignedTo(currentUserId); setTaskDueDate(""); setTaskLeadId("none"); setTaskOppId("none"); setTaskSector("");
    setFuLinkType("lead"); setFuLeadId("none"); setFuTaskId("none"); setFuType("Call"); setFuDate(""); setFuNotes("");
  }

  function navigateToEdit(path: string) {
    setOpen(false);
    resetForms();
    router.push(path);
  }

  async function submitLead() {
    if (!leadName || !leadPhone || !leadSource) {
      toast.error("Name, phone and source are required");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: leadName,
          phone: leadPhone,
          lead_source: leadSource,
          temperature: leadTemperature,
          lead_owner_id: currentUserId,
          assigned_to_id: currentUserId,
        }),
      });
      const result = await res.json();
      if (!res.ok) { toast.error(result.error ?? "Failed to create lead"); return; }
      toast.success(`Lead ${result.data.lead_number} created`);
      setOpen(false);
      resetForms();
      router.push(`/leads/${result.data.id}`);
      router.refresh();
    } catch { toast.error("Something went wrong"); }
    finally { setLoading(false); }
  }

  async function submitOpportunity() {
    if (!oppName || !oppProject || !oppPropertyType || !oppLocation || !oppCommission) {
      toast.error("All opportunity fields are required");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: oppName,
          project: oppProject,
          property_type: oppPropertyType,
          location: oppLocation,
          commission_percent: parseFloat(oppCommission),
          configurations: [{ label: "TBD", number_of_units: 1, price_per_unit: 1 }],
        }),
      });
      const result = await res.json();
      if (!res.ok) { toast.error(result.error ?? "Failed to create opportunity"); return; }
      toast.success(`Opportunity ${result.data.opp_number} created`);
      setOpen(false);
      resetForms();
      router.push(`/opportunities/${result.data.id}`);
      router.refresh();
    } catch { toast.error("Something went wrong"); }
    finally { setLoading(false); }
  }

  async function submitTask() {
    if (!taskTitle || !taskDueDate) {
      toast.error("Title and due date are required");
      return;
    }
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        title: taskTitle,
        assigned_to_id: taskAssignedTo,
        due_date: taskDueDate,
        priority: "Medium",
        recurrence: "None",
      };
      if (taskLeadId !== "none") body.lead_id = taskLeadId;
      if (taskOppId !== "none") body.opportunity_id = taskOppId;
      if (taskSector) body.sector = taskSector;
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (!res.ok) { toast.error(result.error ?? "Failed to create task"); return; }
      toast.success(`Task ${result.data.task_number} created`);
      setOpen(false);
      resetForms();
      router.push(`/tasks/${result.data.id}`);
      router.refresh();
    } catch { toast.error("Something went wrong"); }
    finally { setLoading(false); }
  }

  async function submitFollowUp() {
    if (!fuDate) {
      toast.error("Date & time is required");
      return;
    }
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        type: fuType,
        scheduled_at: fuDate,
        notes: fuNotes || undefined,
      };
      if (fuLinkType === "lead" && fuLeadId !== "none") body.lead_id = fuLeadId;
      if (fuLinkType === "task" && fuTaskId !== "none") body.task_id = fuTaskId;

      const res = await fetch("/api/follow-ups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (!res.ok) { toast.error(result.error ?? "Failed to schedule follow-up"); return; }
      toast.success("Follow-up scheduled");
      setOpen(false);
      resetForms();
      router.refresh();
    } catch { toast.error("Something went wrong"); }
    finally { setLoading(false); }
  }

  const taskAssigneeName = users.find((u) => u.id === taskAssignedTo)?.name ?? "Select user";
  const taskLeadLabel = taskLeadId === "none" ? "No lead" : leads.find((l) => l.id === taskLeadId) ? `${leads.find((l) => l.id === taskLeadId)!.lead_number} – ${leads.find((l) => l.id === taskLeadId)!.full_name}` : "Select lead";
  const taskOppLabel = taskOppId === "none" ? "No opportunity" : opps.find((o) => o.id === taskOppId) ? `${opps.find((o) => o.id === taskOppId)!.opp_number} – ${opps.find((o) => o.id === taskOppId)!.name}` : "Select opportunity";
  const fuLeadLabel = fuLeadId === "none" ? "Select lead" : leads.find((l) => l.id === fuLeadId) ? `${leads.find((l) => l.id === fuLeadId)!.lead_number} – ${leads.find((l) => l.id === fuLeadId)!.full_name}` : "Select lead";
  const fuTaskLabel = fuTaskId === "none" ? "Select task" : tasks.find((t) => t.id === fuTaskId) ? `${tasks.find((t) => t.id === fuTaskId)!.task_number} – ${tasks.find((t) => t.id === fuTaskId)!.title}` : "Select task";

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForms(); }}>
      <DialogTrigger
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
        aria-label="Quick add"
      >
        <Plus className="h-6 w-6" />
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Quick Add</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue={role === "Operations" ? "task" : "lead"}>
          <TabsList className={`w-full grid ${role === "Operations" ? "grid-cols-1" : "grid-cols-4"}`}>
            {role !== "Operations" && <TabsTrigger value="lead" className="gap-1 text-xs"><Users className="h-3.5 w-3.5" />Lead</TabsTrigger>}
            {role !== "Operations" && <TabsTrigger value="opportunity" className="gap-1 text-xs"><Building2 className="h-3.5 w-3.5" />Opp</TabsTrigger>}
            <TabsTrigger value="task" className="gap-1 text-xs"><CheckSquare className="h-3.5 w-3.5" />Task</TabsTrigger>
            {role !== "Operations" && <TabsTrigger value="followup" className="gap-1 text-xs"><CalendarClock className="h-3.5 w-3.5" />Follow-up</TabsTrigger>}
          </TabsList>

          {/* ── LEAD ── */}
          <TabsContent value="lead" className="space-y-3 mt-4">
            <ModeToggle mode={leadMode} onChange={setLeadMode} />

            {leadMode === "edit" ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Select Lead to Edit</Label>
                  <Select value={editLeadId} onValueChange={(v) => v && setEditLeadId(v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {editLeadId === "none" ? "Select a lead" : leads.find((l) => l.id === editLeadId) ? `${leads.find((l) => l.id === editLeadId)!.lead_number} – ${leads.find((l) => l.id === editLeadId)!.full_name}` : "Select a lead"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select a lead</SelectItem>
                      {leads.map((l) => (
                        <SelectItem key={l.id} value={l.id}>{l.lead_number} – {l.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full" disabled={editLeadId === "none"} onClick={() => navigateToEdit(`/leads/${editLeadId}/edit`)}>
                  <Pencil className="mr-2 h-4 w-4" /> Edit Lead
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>Full Name *</Label>
                  <Input value={leadName} onChange={(e) => setLeadName(e.target.value)} placeholder="e.g. Ravi Sharma" />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone *</Label>
                  <Input value={leadPhone} onChange={(e) => setLeadPhone(e.target.value)} placeholder="+91 98765 43210" type="tel" />
                </div>
                <div className="space-y-1.5">
                  <Label>Lead Source *</Label>
                  <Select value={leadSource} onValueChange={(v) => v && setLeadSource(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select source">{leadSource || "Select source"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_SOURCES.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Temperature</Label>
                  <Select value={leadTemperature} onValueChange={(v) => v && setLeadTemperature(v)}>
                    <SelectTrigger><SelectValue>{leadTemperature}</SelectValue></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Hot">Hot</SelectItem>
                      <SelectItem value="Warm">Warm</SelectItem>
                      <SelectItem value="Cold">Cold</SelectItem>
                      <SelectItem value="FollowUpLater">Follow Up Later</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full" onClick={submitLead} disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Lead
                </Button>
              </>
            )}
          </TabsContent>

          {/* ── OPPORTUNITY ── */}
          <TabsContent value="opportunity" className="space-y-3 mt-4">
            <ModeToggle mode={oppMode} onChange={setOppMode} />

            {oppMode === "edit" ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Select Opportunity to Edit</Label>
                  <Select value={editOppId} onValueChange={(v) => v && setEditOppId(v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {editOppId === "none" ? "Select an opportunity" : opps.find((o) => o.id === editOppId) ? `${opps.find((o) => o.id === editOppId)!.opp_number} – ${opps.find((o) => o.id === editOppId)!.name}` : "Select an opportunity"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select an opportunity</SelectItem>
                      {opps.map((o) => (
                        <SelectItem key={o.id} value={o.id}>{o.opp_number} – {o.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full" disabled={editOppId === "none"} onClick={() => navigateToEdit(`/opportunities/${editOppId}/edit`)}>
                  <Pencil className="mr-2 h-4 w-4" /> Edit Opportunity
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>Opportunity Name *</Label>
                  <Input value={oppName} onChange={(e) => setOppName(e.target.value)} placeholder="e.g. 2BHK in Wakad" />
                </div>
                <div className="space-y-1.5">
                  <Label>Project *</Label>
                  <Input value={oppProject} onChange={(e) => setOppProject(e.target.value)} placeholder="e.g. Novara Heights" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Property Type *</Label>
                    <Select value={oppPropertyType} onValueChange={(v) => v && setOppPropertyType(v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Type">{oppPropertyType || "Type"}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {PROPERTY_TYPES.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Commission % *</Label>
                    <Input value={oppCommission} onChange={(e) => setOppCommission(e.target.value)} placeholder="e.g. 2.5" type="number" step="0.1" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Location *</Label>
                  <Input value={oppLocation} onChange={(e) => setOppLocation(e.target.value)} placeholder="e.g. Wakad, Pune" />
                </div>
                <Button className="w-full" onClick={submitOpportunity} disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Opportunity
                </Button>
              </>
            )}
          </TabsContent>

          {/* ── TASK ── */}
          <TabsContent value="task" className="space-y-3 mt-4">
            <ModeToggle mode={taskMode} onChange={setTaskMode} />

            {taskMode === "edit" ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Select Task to Edit</Label>
                  <Select value={editTaskId} onValueChange={(v) => v && setEditTaskId(v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {editTaskId === "none" ? "Select a task" : tasks.find((t) => t.id === editTaskId) ? `${tasks.find((t) => t.id === editTaskId)!.task_number} – ${tasks.find((t) => t.id === editTaskId)!.title}` : "Select a task"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select a task</SelectItem>
                      {tasks.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.task_number} – {t.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full" disabled={editTaskId === "none"} onClick={() => navigateToEdit(`/tasks/${editTaskId}/edit`)}>
                  <Pencil className="mr-2 h-4 w-4" /> Edit Task
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>Title *</Label>
                  <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Task title" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Assigned To</Label>
                    <Select value={taskAssignedTo} onValueChange={(v) => v && setTaskAssignedTo(v)}>
                      <SelectTrigger><SelectValue>{taskAssigneeName}</SelectValue></SelectTrigger>
                      <SelectContent>
                        {users.map((u) => (<SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Due Date *</Label>
                    <Input value={taskDueDate} onChange={(e) => setTaskDueDate(e.target.value)} type="date" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Sector</Label>
                  <Select value={taskSector} onValueChange={(v) => v && setTaskSector(v)}>
                    <SelectTrigger className="w-full"><SelectValue>{taskSector || "Select sector"}</SelectValue></SelectTrigger>
                    <SelectContent className="w-full">
                      {SECTORS.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Link to Lead</Label>
                  <Select value={taskLeadId} onValueChange={(v) => v && setTaskLeadId(v)}>
                    <SelectTrigger className="w-full"><SelectValue>{taskLeadLabel}</SelectValue></SelectTrigger>
                    <SelectContent className="w-full">
                      <SelectItem value="none">No lead</SelectItem>
                      {leads.map((l) => (<SelectItem key={l.id} value={l.id}>{l.lead_number} – {l.full_name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Link to Opportunity</Label>
                  <Select value={taskOppId} onValueChange={(v) => v && setTaskOppId(v)}>
                    <SelectTrigger className="w-full"><SelectValue>{taskOppLabel}</SelectValue></SelectTrigger>
                    <SelectContent className="w-full">
                      <SelectItem value="none">No opportunity</SelectItem>
                      {opps.map((o) => (<SelectItem key={o.id} value={o.id}>{o.opp_number} – {o.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full" onClick={submitTask} disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Task
                </Button>
              </>
            )}
          </TabsContent>

          {/* ── FOLLOW-UP ── */}
          <TabsContent value="followup" className="space-y-3 mt-4">
            <ModeToggle mode={fuMode} onChange={setFuMode} />

            {fuMode === "edit" ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Select the lead or task the follow-up is linked to, then go to its detail page to edit or complete the follow-up.</p>
                <div className="flex rounded-md border overflow-hidden text-sm">
                  <button type="button" onClick={() => setFuLinkType("lead")} className={`flex-1 py-1.5 text-center transition-colors ${fuLinkType === "lead" ? "bg-primary text-primary-foreground" : "bg-transparent hover:bg-muted"}`}>Lead</button>
                  <button type="button" onClick={() => setFuLinkType("task")} className={`flex-1 py-1.5 text-center transition-colors ${fuLinkType === "task" ? "bg-primary text-primary-foreground" : "bg-transparent hover:bg-muted"}`}>Task</button>
                </div>
                {fuLinkType === "lead" ? (
                  <>
                    <Select value={fuLeadId} onValueChange={(v) => v && setFuLeadId(v)}>
                      <SelectTrigger className="w-full"><SelectValue>{fuLeadLabel}</SelectValue></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Select a lead</SelectItem>
                        {leads.map((l) => (<SelectItem key={l.id} value={l.id}>{l.lead_number} – {l.full_name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                    <Button className="w-full" disabled={fuLeadId === "none"} onClick={() => navigateToEdit(`/leads/${fuLeadId}`)}>
                      <Pencil className="mr-2 h-4 w-4" /> Go to Lead
                    </Button>
                  </>
                ) : (
                  <>
                    <Select value={fuTaskId} onValueChange={(v) => v && setFuTaskId(v)}>
                      <SelectTrigger className="w-full"><SelectValue>{fuTaskLabel}</SelectValue></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Select a task</SelectItem>
                        {tasks.map((t) => (<SelectItem key={t.id} value={t.id}>{t.task_number} – {t.title}</SelectItem>))}
                      </SelectContent>
                    </Select>
                    <Button className="w-full" disabled={fuTaskId === "none"} onClick={() => navigateToEdit(`/tasks/${fuTaskId}`)}>
                      <Pencil className="mr-2 h-4 w-4" /> Go to Task
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="flex rounded-md border overflow-hidden text-sm">
                  <button type="button" onClick={() => setFuLinkType("lead")} className={`flex-1 py-1.5 text-center transition-colors ${fuLinkType === "lead" ? "bg-primary text-primary-foreground" : "bg-transparent hover:bg-muted"}`}>Link to Lead</button>
                  <button type="button" onClick={() => setFuLinkType("task")} className={`flex-1 py-1.5 text-center transition-colors ${fuLinkType === "task" ? "bg-primary text-primary-foreground" : "bg-transparent hover:bg-muted"}`}>Link to Task</button>
                </div>

                {fuLinkType === "lead" ? (
                  <div className="space-y-1.5">
                    <Label>Lead</Label>
                    <Select value={fuLeadId} onValueChange={(v) => v && setFuLeadId(v)}>
                      <SelectTrigger className="w-full"><SelectValue>{fuLeadLabel}</SelectValue></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Select a lead</SelectItem>
                        {leads.map((l) => (<SelectItem key={l.id} value={l.id}>{l.lead_number} – {l.full_name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label>Task</Label>
                    <Select value={fuTaskId} onValueChange={(v) => v && setFuTaskId(v)}>
                      <SelectTrigger className="w-full"><SelectValue>{fuTaskLabel}</SelectValue></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Select a task</SelectItem>
                        {tasks.map((t) => (<SelectItem key={t.id} value={t.id}>{t.task_number} – {t.title}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Type</Label>
                    <Select value={fuType} onValueChange={(v) => v && setFuType(v)}>
                      <SelectTrigger><SelectValue>{fuType}</SelectValue></SelectTrigger>
                      <SelectContent>
                        {FOLLOW_UP_TYPES.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Date &amp; Time *</Label>
                    <Input value={fuDate} onChange={(e) => setFuDate(e.target.value)} type="datetime-local" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <Input value={fuNotes} onChange={(e) => setFuNotes(e.target.value)} placeholder="Optional notes" />
                </div>
                <Button className="w-full" onClick={submitFollowUp} disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Schedule Follow-up
                </Button>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
