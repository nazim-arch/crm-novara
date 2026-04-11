"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, UserCheck, UserX, AlertTriangle, Loader2 } from "lucide-react";

type User = {
  id: string;
  short_name: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  phone: string | null;
  created_at: Date;
};

const ACTIVE_ROLES = [
  { value: "Admin", label: "Admin" },
  { value: "Sales", label: "Sales" },
  { value: "Operations", label: "Sage Operations" },
];

const ALL_ROLES = [
  { value: "Admin", label: "Admin" },
  { value: "Sales", label: "Sales" },
  { value: "Operations", label: "Sage Operations" },
  { value: "Manager", label: "Manager (Legacy)" },
  { value: "Viewer", label: "Viewer (Legacy)" },
];

const ROLE_COLORS: Record<string, string> = {
  Admin: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  Sales: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  Operations: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  Manager: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  Viewer: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

function roleLabel(role: string) {
  return ALL_ROLES.find(r => r.value === role)?.label ?? role;
}

interface UserManagementClientProps {
  users: User[];
}

export function UserManagementClient({ users: initialUsers }: UserManagementClientProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ short_name: "", name: "", email: "", password: "", role: "Sales", phone: "" });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Reassignment state
  const [reassignUserId, setReassignUserId] = useState<string | null>(null);
  const [reassignWorkload, setReassignWorkload] = useState<{ leadCount: number; taskCount: number } | null>(null);
  const [reassignTo, setReassignTo] = useState("");
  const [reassigning, setReassigning] = useState(false);

  const activeUsers = initialUsers.filter((u) => u.is_active);

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!form.short_name.trim()) errors.short_name = "Short name is required";
    if (!form.name.trim() || form.name.trim().length < 2) errors.name = "Full name must be at least 2 characters";
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = "Valid email is required";
    if (!form.password || form.password.length < 8) errors.password = "Password must be at least 8 characters";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreate = async () => {
    if (!validateForm()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await res.json();
      if (!res.ok) {
        toast.error(typeof result.error === "string" ? result.error : "Failed to create user");
        return;
      }
      toast.success("User created successfully");
      setCreateOpen(false);
      setForm({ short_name: "", name: "", email: "", password: "", role: "Sales", phone: "" });
      setFormErrors({});
      router.refresh();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setCreating(false);
    }
  };

  const handleRoleChange = async (userId: string, role: string) => {
    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) { toast.error("Failed to update role"); return; }
    toast.success("Role updated");
    router.refresh();
  };

  const initiateDeactivate = async (user: User) => {
    try {
      const res = await fetch(`/api/users/${user.id}/reassign`);
      const data = await res.json();
      const workload = data.data as { leadCount: number; taskCount: number };

      if (workload.leadCount > 0 || workload.taskCount > 0) {
        setReassignUserId(user.id);
        setReassignWorkload(workload);
        setReassignTo("");
      } else {
        await doDeactivate(user.id);
      }
    } catch {
      toast.error("Failed to check user workload");
    }
  };

  const handleReassignAndDeactivate = async () => {
    if (!reassignUserId) return;
    setReassigning(true);
    try {
      if (reassignTo) {
        const res = await fetch(`/api/users/${reassignUserId}/reassign`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reassign_to: reassignTo }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error("Failed to reassign"); return; }
        toast.success(`Reassigned ${data.data.leadsReassigned} leads and ${data.data.tasksReassigned} tasks`);
      }
      await doDeactivate(reassignUserId);
      setReassignUserId(null);
      setReassignWorkload(null);
    } catch {
      toast.error("Something went wrong");
    } finally {
      setReassigning(false);
    }
  };

  const doDeactivate = async (userId: string) => {
    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: false }),
    });
    if (!res.ok) { toast.error("Failed to deactivate user"); return; }
    toast.success("User deactivated");
    router.refresh();
  };

  const handleActivate = async (userId: string) => {
    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: true }),
    });
    if (!res.ok) { toast.error("Failed to activate user"); return; }
    toast.success("User activated");
    router.refresh();
  };

  const reassignUser = reassignUserId ? initialUsers.find(u => u.id === reassignUserId) : null;

  return (
    <div className="space-y-4">
      {/* Reassign modal */}
      <Dialog open={!!reassignUserId} onOpenChange={(open) => { if (!open) { setReassignUserId(null); setReassignWorkload(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Deactivate {reassignUser?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="rounded-lg bg-orange-50 dark:bg-orange-950/30 p-3 text-sm">
              <p className="font-medium text-orange-700 dark:text-orange-400">This user has active work:</p>
              <ul className="mt-1 text-orange-600 dark:text-orange-400 list-disc list-inside">
                {(reassignWorkload?.leadCount ?? 0) > 0 && <li>{reassignWorkload?.leadCount} active lead(s)</li>}
                {(reassignWorkload?.taskCount ?? 0) > 0 && <li>{reassignWorkload?.taskCount} open task(s)</li>}
              </ul>
              <p className="mt-2 text-orange-600 dark:text-orange-400">Reassign their work before deactivating:</p>
            </div>
            <div className="space-y-1.5">
              <Label>Reassign to</Label>
              <Select
                value={reassignTo || "__none__"}
                onValueChange={(v) => setReassignTo(!v || v === "__none__" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select user to reassign to..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    <span className="text-muted-foreground">Skip reassignment</span>
                  </SelectItem>
                  {activeUsers
                    .filter(u => u.id !== reassignUserId)
                    .map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name} ({roleLabel(u.role)})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setReassignUserId(null); setReassignWorkload(null); }}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={handleReassignAndDeactivate}
                disabled={reassigning}
              >
                {reassigning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {reassignTo ? "Reassign & Deactivate" : "Deactivate Anyway"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) setFormErrors({}); }}>
          <DialogTrigger render={
            <Button>
              <Plus className="h-4 w-4 mr-1" /> Add User
            </Button>
          } />
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Short Name <span className="text-destructive">*</span></Label>
                  <Input
                    value={form.short_name}
                    onChange={(e) => setForm((f) => ({ ...f, short_name: e.target.value }))}
                    placeholder="e.g. Nazim"
                    maxLength={20}
                  />
                  {formErrors.short_name && <p className="text-xs text-destructive">{formErrors.short_name}</p>}
                  <p className="text-[10px] text-muted-foreground">Used in avatars & compact views</p>
                </div>
                <div className="space-y-1.5">
                  <Label>User Group <span className="text-destructive">*</span></Label>
                  <Select
                    value={form.role}
                    onValueChange={(v) => v && setForm((f) => ({ ...f, role: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTIVE_ROLES.map((r) => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Full Name <span className="text-destructive">*</span></Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Full legal name"
                />
                {formErrors.name && <p className="text-xs text-destructive">{formErrors.name}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Email <span className="text-destructive">*</span></Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="user@novara.in"
                />
                {formErrors.email && <p className="text-xs text-destructive">{formErrors.email}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Password <span className="text-destructive">*</span></Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Min 8 characters"
                />
                {formErrors.password && <p className="text-xs text-destructive">{formErrors.password}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+91..."
                />
              </div>
              <Button onClick={handleCreate} disabled={creating} className="w-full">
                {creating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</> : "Create User"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="divide-y">
            {initialUsers.map((user) => (
              <div key={user.id} className={`flex items-center justify-between p-4 gap-4 ${!user.is_active ? "opacity-60" : ""}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
                      {user.short_name ? user.short_name.charAt(0).toUpperCase() : user.name.charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="font-medium text-sm">{user.name}</p>
                        {user.short_name && user.short_name !== user.name.split(" ")[0] && (
                          <span className="text-xs text-muted-foreground">({user.short_name})</span>
                        )}
                        {!user.is_active && <span className="text-xs text-muted-foreground">(Inactive)</span>}
                      </div>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[user.role] ?? ROLE_COLORS["Viewer"]}`}>
                    {roleLabel(user.role)}
                  </span>

                  {user.is_active && (
                    <Select
                      defaultValue={user.role}
                      onValueChange={(v) => v && handleRoleChange(user.id, v)}
                    >
                      <SelectTrigger className="w-36 h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ALL_ROLES.map((r) => (
                          <SelectItem key={r.value} value={r.value} className="text-xs">{r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => user.is_active ? initiateDeactivate(user) : handleActivate(user.id)}
                    className={user.is_active ? "text-muted-foreground hover:text-destructive" : "text-green-600"}
                    title={user.is_active ? "Deactivate" : "Activate"}
                  >
                    {user.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
