"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ROLES, PERMISSION_GROUPS, PERMISSION_LABELS, type Permission, type Role } from "@/lib/rbac-constants";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Shield, RotateCcw, Save } from "lucide-react";

interface Props {
  initialConfig: Record<string, Permission[]>;
  defaultConfig: Record<string, Permission[]>;
}

export function RbacEditor({ initialConfig, defaultConfig }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [config, setConfig] = useState<Record<string, Permission[]>>(
    () => structuredClone(initialConfig)
  );
  const [isDirty, setIsDirty] = useState(false);

  function toggle(role: Role, perm: Permission) {
    setConfig(prev => {
      const current = prev[role] ?? [];
      const next = current.includes(perm)
        ? current.filter(p => p !== perm)
        : [...current, perm];
      return { ...prev, [role]: next };
    });
    setIsDirty(true);
  }

  function reset() {
    setConfig(structuredClone(defaultConfig));
    setIsDirty(true);
  }

  function save() {
    startTransition(async () => {
      const res = await fetch("/api/settings/rbac", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      if (res.ok) {
        toast.success("Role permissions saved");
        setIsDirty(false);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to save permissions");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Header actions */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Toggle permissions for each role. Changes take effect within 30 seconds across all sessions.
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={reset} disabled={isPending}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Reset to defaults
          </Button>
          <Button size="sm" onClick={save} disabled={isPending || !isDirty}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      {/* Matrix table */}
      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground w-64">Permission</th>
              {ROLES.map(role => (
                <th key={role} className="px-4 py-3 font-medium text-center min-w-[100px]">
                  <span className="flex items-center justify-center gap-1.5">
                    <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                    {role}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_GROUPS.map(group => (
              <>
                <tr key={group.label} className="bg-muted/20 border-t">
                  <td colSpan={ROLES.length + 1} className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </td>
                </tr>
                {group.perms.map(perm => (
                  <tr key={perm} className="border-t hover:bg-muted/10 transition-colors">
                    <td className="px-4 py-2.5 text-sm">
                      {PERMISSION_LABELS[perm]}
                    </td>
                    {ROLES.map(role => {
                      const enabled = (config[role] ?? []).includes(perm);
                      return (
                        <td key={role} className="px-4 py-2.5 text-center">
                          <Switch
                            checked={enabled}
                            onCheckedChange={() => toggle(role, perm)}
                            disabled={isPending}
                            aria-label={`${role} — ${PERMISSION_LABELS[perm]}`}
                            className="mx-auto"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {isDirty && (
        <p className="text-xs text-amber-600 font-medium">
          You have unsaved changes.
        </p>
      )}
    </div>
  );
}
