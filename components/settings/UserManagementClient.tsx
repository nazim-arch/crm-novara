"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/utils";
import { Plus, UserCheck, UserX } from "lucide-react";

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  phone: string | null;
  created_at: Date;
};

const ROLES = ["Admin", "Manager", "Sales", "Operations", "Viewer"];
const ROLE_COLORS: Record<string, string> = {
  Admin: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  Manager: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  Sales: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  Operations: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  Viewer: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

interface UserManagementClientProps {
  users: User[];
}

export function UserManagementClient({ users: initialUsers }: UserManagementClientProps) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "Sales", phone: "" });

  const handleCreate = async () => {
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
      toast.success("User created");
      setCreateOpen(false);
      setForm({ name: "", email: "", password: "", role: "Sales", phone: "" });
      router.refresh();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !currentActive }),
    });
    if (!res.ok) {
      toast.error("Failed to update user");
      return;
    }
    toast.success(currentActive ? "User deactivated" : "User activated");
    router.refresh();
  };

  const handleRoleChange = async (userId: string, role: string) => {
    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) {
      toast.error("Failed to update role");
      return;
    }
    toast.success("Role updated");
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="h-4 w-4 mr-1" />
            Add User
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Full name"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="user@novara.in"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Password *</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Min 8 characters"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+91..."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select
                  value={form.role}
                  onValueChange={(v) => v && setForm((f) => ({ ...f, role: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleCreate} disabled={creating} className="w-full">
                {creating ? "Creating..." : "Create User"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="divide-y">
            {users.map((user) => (
              <div key={user.id} className="flex items-center justify-between p-4 gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm">{user.name}</p>
                    {!user.is_active && (
                      <span className="text-xs text-muted-foreground">(Inactive)</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                  {user.phone && <p className="text-xs text-muted-foreground">{user.phone}</p>}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Select
                    defaultValue={user.role}
                    onValueChange={(v) => v && handleRoleChange(user.id, v)}
                  >
                    <SelectTrigger className="w-32 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggleActive(user.id, user.is_active)}
                    className={user.is_active ? "text-muted-foreground" : "text-green-600"}
                  >
                    {user.is_active ? (
                      <UserX className="h-4 w-4" />
                    ) : (
                      <UserCheck className="h-4 w-4" />
                    )}
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
