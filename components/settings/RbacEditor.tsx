"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ROLES,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  PERMISSION_DESCRIPTIONS,
  GUARDED_PERMISSIONS,
  type Permission,
  type Role,
} from "@/lib/rbac-constants";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Shield, ShieldAlert, RotateCcw, Save, Lock } from "lucide-react";

interface Props {
  initialConfig: Record<string, Permission[]>;
  defaultConfig: Record<string, Permission[]>;
  /** Record-visibility scope per role, generated from the enforcement code (lead-visibility.ts). */
  recordScopeByRole: Record<string, string>;
}

const GUARDED = GUARDED_PERMISSIONS as Permission[];
const isGuarded = (perm: Permission) => GUARDED.includes(perm);
const has = (config: Record<string, Permission[]>, role: string, perm: Permission) =>
  (config[role] ?? []).includes(perm);

export function RbacEditor({ initialConfig, defaultConfig, recordScopeByRole }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [config, setConfig] = useState<Record<string, Permission[]>>(
    () => structuredClone(initialConfig)
  );
  const [isDirty, setIsDirty] = useState(false);

  // Guarded-grant confirmation dialog state.
  const [pending, setPending] = useState<{ role: Role; perm: Permission } | null>(null);
  const [typed, setTyped] = useState("");

  const matrixGroups = PERMISSION_GROUPS.filter((g) => !g.guarded);
  const guardedGroup = PERMISSION_GROUPS.find((g) => g.guarded);

  // Standing banner: which non-Admin roles currently hold any guarded permission.
  const nonAdminHoldingGuarded = useMemo(
    () =>
      ROLES.filter(
        (role) => role !== "Admin" && GUARDED.some((perm) => has(config, role, perm))
      ),
    [config]
  );

  function applyToggle(role: Role, perm: Permission) {
    setConfig((prev) => {
      const current = prev[role] ?? [];
      const next = current.includes(perm)
        ? current.filter((p) => p !== perm)
        : [...current, perm];
      return { ...prev, [role]: next };
    });
    setIsDirty(true);
  }

  function toggle(role: Role, perm: Permission) {
    // Admin's guarded switches are locked on — cannot be toggled at all.
    if (isGuarded(perm) && role === "Admin") return;
    // Granting a guarded permission to a non-Admin requires typed confirmation. Revoking is free.
    if (isGuarded(perm) && role !== "Admin" && !has(config, role, perm)) {
      setPending({ role, perm });
      setTyped("");
      return;
    }
    applyToggle(role, perm);
  }

  function confirmGrant() {
    if (!pending || typed.trim() !== pending.role) return;
    applyToggle(pending.role, pending.perm);
    setPending(null);
    setTyped("");
  }

  function reset() {
    setConfig(structuredClone(defaultConfig));
    setIsDirty(true);
  }

  function save() {
    // Server re-checks, but declare intent: a guarded grant vs the stored config needs confirm:true.
    const guardedGrant = ROLES.some(
      (role) =>
        role !== "Admin" &&
        GUARDED.some((perm) => has(config, role, perm) && !has(initialConfig, role, perm))
    );
    startTransition(async () => {
      const res = await fetch("/api/settings/rbac", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, confirm: guardedGrant }),
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
      {/* Standing banner — a protection is currently switched off for a non-Admin role. */}
      {nonAdminHoldingGuarded.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-start gap-2">
          <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
          <p>
            <strong>Restricted Data Access is granted beyond Admin.</strong>{" "}
            {nonAdminHoldingGuarded.join(", ")} can currently bypass a lead-visibility protection.
            Revoke it below once the reason has passed.
          </p>
        </div>
      )}

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

      {/* Read-only Data Access panel — generated from the enforcement code, not hand-written. */}
      <div className="rounded-lg border bg-card overflow-x-auto">
        <div className="px-4 py-2.5 border-b bg-muted/40">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Data Access (enforced in code — not editable here)
          </p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/20 text-left text-xs text-muted-foreground">
              <th className="px-4 py-2 font-medium">Role</th>
              <th className="px-4 py-2 font-medium">Records visible</th>
              <th className="px-4 py-2 font-medium">Hidden leads</th>
            </tr>
          </thead>
          <tbody>
            {ROLES.map((role) => {
              const hiddenAccess =
                role === "Admin"
                  ? "Full (unrestricted)"
                  : has(config, role, "lead:view_hidden")
                    ? "Full (via grant)"
                    : "Restricted";
              return (
                <tr key={role} className="border-t">
                  <td className="px-4 py-2 font-medium">{role}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {recordScopeByRole[role] ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{hiddenAccess}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Matrix table — the seven standard groups, unchanged. */}
      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground w-64">Permission</th>
              {ROLES.map((role) => (
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
            {matrixGroups.map((group) => (
              <Fragment key={group.label}>
                <tr className="bg-muted/20 border-t">
                  <td colSpan={ROLES.length + 1} className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </td>
                </tr>
                {group.perms.map((perm) => (
                  <tr key={perm} className="border-t hover:bg-muted/10 transition-colors">
                    <td className="px-4 py-2.5 text-sm">{PERMISSION_LABELS[perm]}</td>
                    {ROLES.map((role) => {
                      const enabled = has(config, role, perm);
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
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Guarded group — a separate warning-toned card, never more rows of switches. */}
      {guardedGroup && (
        <div className="rounded-lg border border-amber-300 bg-amber-50/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-amber-200 bg-amber-100/60">
            <p className="text-sm font-semibold text-amber-900 flex items-center gap-1.5">
              <ShieldAlert className="h-4 w-4" />
              {guardedGroup.label}
            </p>
            {guardedGroup.blurb && (
              <p className="text-xs text-amber-800 mt-1">{guardedGroup.blurb}</p>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-amber-200 bg-amber-100/30">
                  <th className="text-left px-4 py-2 font-medium text-amber-900 w-72">Protection to switch off</th>
                  {ROLES.map((role) => (
                    <th key={role} className="px-4 py-2 font-medium text-center min-w-[100px] text-amber-900">
                      {role}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {guardedGroup.perms.map((perm) => (
                  <tr key={perm} className="border-t border-amber-200">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-amber-900">{PERMISSION_LABELS[perm]}</div>
                      {PERMISSION_DESCRIPTIONS[perm] && (
                        <div className="text-xs text-amber-800/90">{PERMISSION_DESCRIPTIONS[perm]}</div>
                      )}
                    </td>
                    {ROLES.map((role) => {
                      const enabled = has(config, role, perm);
                      const adminLocked = role === "Admin";
                      return (
                        <td key={role} className="px-4 py-2.5 text-center">
                          {adminLocked ? (
                            <span
                              className="inline-flex items-center justify-center text-amber-700"
                              title="Admin always holds this permission"
                            >
                              <Lock className="h-3.5 w-3.5" />
                            </span>
                          ) : (
                            <Switch
                              checked={enabled}
                              onCheckedChange={() => toggle(role, perm)}
                              disabled={isPending}
                              aria-label={`${role} — ${PERMISSION_LABELS[perm]}`}
                              className="mx-auto"
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isDirty && (
        <p className="text-xs text-amber-600 font-medium">You have unsaved changes.</p>
      )}

      {/* Typed-confirmation dialog for granting a guarded permission. */}
      <Dialog open={pending !== null} onOpenChange={(open) => { if (!open) { setPending(null); setTyped(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              Turn off a protection?
            </DialogTitle>
            <DialogDescription>
              {pending
                ? `Granting "${PERMISSION_LABELS[pending.perm]}" to ${pending.role} turns off a lead-visibility protection.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {pending && (
            <div className="space-y-2 text-sm">
              {PERMISSION_DESCRIPTIONS[pending.perm] && (
                <p className="text-muted-foreground">{PERMISSION_DESCRIPTIONS[pending.perm]}</p>
              )}
              <p>
                Type <strong>{pending.role}</strong> to confirm.
              </p>
            </div>
          )}
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={pending?.role ?? ""}
            autoFocus
            aria-label="Type the role name to confirm"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPending(null); setTyped(""); }}>
              Cancel
            </Button>
            <Button
              onClick={confirmGrant}
              disabled={!pending || typed.trim() !== pending.role}
              className="bg-amber-600 hover:bg-amber-700"
            >
              Grant permission
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
