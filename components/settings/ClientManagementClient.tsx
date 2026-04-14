"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Loader2, Building2 } from "lucide-react";

type Client = {
  id: string;
  name: string;
  industry: string | null;
  contact_person: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
};

const EMPTY_FORM = {
  name: "",
  industry: "",
  contact_person: "",
  contact_email: "",
  contact_phone: "",
  notes: "",
};

export function ClientManagementClient({ initialClients }: { initialClients: Client[] }) {
  const [clients, setClients] = useState<Client[]>(initialClients);
  const [createOpen, setCreateOpen] = useState(false);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function openCreate() {
    setForm(EMPTY_FORM);
    setCreateOpen(true);
  }

  function openEdit(c: Client) {
    setForm({
      name: c.name,
      industry: c.industry ?? "",
      contact_person: c.contact_person ?? "",
      contact_email: c.contact_email ?? "",
      contact_phone: c.contact_phone ?? "",
      notes: c.notes ?? "",
    });
    setEditClient(c);
  }

  async function handleCreate() {
    if (!form.name.trim()) { toast.error("Client name is required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await res.json();
      if (!res.ok) { toast.error(result.error ?? "Failed to create client"); return; }
      setClients((prev) => [...prev, result.data].sort((a, b) => a.name.localeCompare(b.name)));
      toast.success(`Client "${result.data.name}" created`);
      setCreateOpen(false);
    } catch { toast.error("Something went wrong"); }
    finally { setSaving(false); }
  }

  async function handleEdit() {
    if (!editClient) return;
    if (!form.name.trim()) { toast.error("Client name is required"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${editClient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await res.json();
      if (!res.ok) { toast.error(result.error ?? "Failed to update client"); return; }
      setClients((prev) => prev.map((c) => (c.id === editClient.id ? result.data : c)));
      toast.success("Client updated");
      setEditClient(null);
    } catch { toast.error("Something went wrong"); }
    finally { setSaving(false); }
  }

  async function handleDelete(client: Client) {
    if (!confirm(`Delete "${client.name}"? This cannot be undone.`)) return;
    setDeletingId(client.id);
    try {
      const res = await fetch(`/api/clients/${client.id}`, { method: "DELETE" });
      const result = await res.json();
      if (!res.ok) { toast.error(result.error ?? "Failed to delete client"); return; }
      setClients((prev) => prev.filter((c) => c.id !== client.id));
      toast.success("Client deleted");
    } catch { toast.error("Something went wrong"); }
    finally { setDeletingId(null); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{clients.length} client{clients.length !== 1 ? "s" : ""}</p>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Add Client
        </Button>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add Client</DialogTitle>
            </DialogHeader>
            <ClientForm form={form} setForm={setForm} onSubmit={handleCreate} saving={saving} submitLabel="Create Client" />
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit dialog — rendered at top level, controlled by editClient state */}
      <Dialog open={!!editClient} onOpenChange={(open) => { if (!open) setEditClient(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Client</DialogTitle>
          </DialogHeader>
          <ClientForm form={form} setForm={setForm} onSubmit={handleEdit} saving={saving} submitLabel="Save Changes" />
        </DialogContent>
      </Dialog>

      {clients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border rounded-lg bg-card">
          <Building2 className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">No clients yet</p>
          <p className="text-xs text-muted-foreground mt-1">Add your first client to start tagging tasks</p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Name</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <p className="font-medium">{c.name}</p>
                    {c.notes && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{c.notes}</p>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.industry ?? "—"}</TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {c.contact_person && <p>{c.contact_person}</p>}
                      {c.contact_email && <p className="text-xs text-muted-foreground">{c.contact_email}</p>}
                      {c.contact_phone && <p className="text-xs text-muted-foreground">{c.contact_phone}</p>}
                      {!c.contact_person && !c.contact_email && !c.contact_phone && <span className="text-muted-foreground">—</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={c.is_active ? "default" : "secondary"} className="text-xs">
                      {c.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(c)}
                        disabled={deletingId === c.id}
                      >
                        {deletingId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function ClientForm({
  form,
  setForm,
  onSubmit,
  saving,
  submitLabel,
}: {
  form: typeof EMPTY_FORM;
  setForm: React.Dispatch<React.SetStateAction<typeof EMPTY_FORM>>;
  onSubmit: () => void;
  saving: boolean;
  submitLabel: string;
}) {
  const set = (key: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Client Name *</Label>
        <Input value={form.name} onChange={set("name")} placeholder="e.g. Acme Corp" />
      </div>
      <div className="space-y-1.5">
        <Label>Industry</Label>
        <Input value={form.industry} onChange={set("industry")} placeholder="e.g. Real Estate, Tech, Finance" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Contact Person</Label>
          <Input value={form.contact_person} onChange={set("contact_person")} placeholder="Full name" />
        </div>
        <div className="space-y-1.5">
          <Label>Contact Phone</Label>
          <Input value={form.contact_phone} onChange={set("contact_phone")} placeholder="+91 …" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Contact Email</Label>
        <Input type="email" value={form.contact_email} onChange={set("contact_email")} placeholder="contact@example.com" />
      </div>
      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Textarea value={form.notes} onChange={set("notes")} rows={2} placeholder="Any additional info…" />
      </div>
      <Button className="w-full" onClick={onSubmit} disabled={saving}>
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {submitLabel}
      </Button>
    </div>
  );
}
