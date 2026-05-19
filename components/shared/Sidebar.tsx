"use client";

import { useState } from "react";
import React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  BarChart3, Users, Building2, CheckSquare, CalendarClock,
  Settings, LayoutDashboard, Radar, Menu, Briefcase, Mic2, SlidersHorizontal,
  TrendingUp, FileText, ShieldCheck, Target, ClipboardCheck, CalendarDays, History,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type NavChild = { href: string; label: string; tab: string; roles: string[] };
type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; roles: string[]; tab?: string; children?: NavChild[] };
type NavSection = { label: string; items: NavItem[] };

const NAV_CONFIG: NavSection[] = [
  {
    label: "Dashboards",
    items: [
      { href: "/dashboard/sales", label: "Sales Dashboard", icon: Users, roles: ["Admin", "Manager", "Sales", "Viewer"] },
      { href: "/dashboard/crm", label: "CRM Overview", icon: LayoutDashboard, roles: ["Admin", "Manager", "Viewer"] },
      { href: "/dashboard/tasks", label: "Task Overview", icon: BarChart3, roles: ["Admin", "Manager", "Sales", "Operations", "Viewer"] },
      { href: "/dashboard/activity", label: "Activity Calendar", icon: CalendarDays, roles: ["Admin", "Manager", "Sales"] },
      { href: "/follow-ups?tab=focus_queue", tab: "focus_queue", label: "Focus Queue", icon: Target, roles: ["Admin", "Manager", "Sales"] },
      { href: "/follow-ups?tab=review_queue", tab: "review_queue", label: "Review Queue", icon: ClipboardCheck, roles: ["Admin"] },
    ],
  },
  {
    label: "CRM",
    items: [
      { href: "/leads", label: "Leads", icon: Users, roles: ["Admin", "Manager", "Sales", "Viewer"] },
      { href: "/opportunities", label: "Opportunities", icon: Building2, roles: ["Admin", "Manager", "Sales", "Viewer"] },
      { href: "/follow-ups", label: "Follow-ups", icon: CalendarClock, roles: ["Admin", "Manager", "Sales", "Operations", "Viewer"] },
    ],
  },
  {
    label: "Tasks",
    items: [
      { href: "/tasks", label: "Tasks", icon: CheckSquare, roles: ["Admin", "Manager", "Sales", "Operations", "Viewer"] },
    ],
  },
  {
    label: "Podcast Studio",
    items: [
      { href: "/podcast-studio", label: "Dashboard", icon: Mic2, roles: ["Admin"] },
      { href: "/podcast-studio/calendar", label: "Availability", icon: CalendarClock, roles: ["Admin"] },
      { href: "/podcast-studio/bookings", label: "Bookings", icon: BarChart3, roles: ["Admin"] },
      { href: "/podcast-studio/settings", label: "Studio Settings", icon: SlidersHorizontal, roles: ["Admin"] },
    ],
  },
  {
    label: "Commission",
    items: [
      { href: "/sales-commission", label: "My Commission", icon: TrendingUp, roles: ["Sales"] },
      { href: "/sales-commission", label: "Commission Overview", icon: TrendingUp, roles: ["Admin"] },
      { href: "/sales-commission/targets", label: "Set Targets", icon: BarChart3, roles: ["Admin"] },
      { href: "/sales-commission/report", label: "Commission Report", icon: BarChart3, roles: ["Admin"] },
    ],
  },
  {
    label: "Reports",
    items: [
      { href: "/reports", label: "Revenue & Net Profit", icon: FileText, roles: ["Admin"] },
    ],
  },
  {
    label: "IntentRadar",
    items: [
      { href: "/intentradar", label: "IntentRadar", icon: Radar, roles: ["Admin"] },
    ],
  },
  {
    label: "Settings",
    items: [
      { href: "/settings/users", label: "Users", icon: Settings, roles: ["Admin"] },
      { href: "/settings/clients", label: "Clients", icon: Briefcase, roles: ["Admin"] },
      { href: "/settings/roles", label: "Role Permissions", icon: ShieldCheck, roles: ["Admin"] },
      { href: "/reports/audit-log", label: "Audit Log", icon: History, roles: ["Admin", "Manager"] },
    ],
  },
];

interface NavProps {
  role: string;
  onNavigate?: () => void;
}

function SidebarNav({ role, onNavigate }: NavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab") ?? "";

  const visibleNav = NAV_CONFIG
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.roles.includes(role)),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <nav className="flex-1 overflow-y-auto py-4 px-2">
      {visibleNav.map((section) => (
        <div key={section.label} className="mb-4">
          <p className="px-2 mb-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            {section.label}
          </p>
          {section.items.map((item) => {
            const Icon = item.icon;
            const isActive = item.tab
              ? pathname === "/follow-ups" && currentTab === item.tab
              : pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            const visibleChildren = item.children?.filter((c) => c.roles.includes(role)) ?? [];

            return (
              <div key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-2.5 px-2 py-2 rounded-md text-sm transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
                {isActive && visibleChildren.length > 0 && (
                  <div className="ml-4 mt-0.5 mb-1 border-l border-border pl-3 space-y-0.5">
                    {visibleChildren.map((child) => {
                      const isChildActive = pathname === "/follow-ups" && currentTab === child.tab;
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={onNavigate}
                          className={cn(
                            "block py-1.5 px-2 rounded-md text-xs transition-colors",
                            isChildActive
                              ? "text-primary font-medium bg-primary/5"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted"
                          )}
                        >
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

const Logo = () => (
  <div className="flex items-center gap-2">
    <div className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
      D
    </div>
    <span className="font-semibold text-sm">DealStack</span>
  </div>
);

// ── Desktop sidebar (hidden on mobile) ───────────────────────────────────────
export function Sidebar({ role }: { role: string }) {
  return (
    <aside className="hidden md:flex w-56 shrink-0 border-r bg-card flex-col h-full">
      <div className="h-14 flex items-center px-4 border-b">
        <Logo />
      </div>
      <SidebarNav role={role} />
    </aside>
  );
}

// ── Mobile hamburger + sheet ──────────────────────────────────────────────────
export function MobileSidebarTrigger({ role }: { role: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors">
        <Menu className="h-5 w-5" />
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0 flex flex-col">
        <div className="h-14 flex items-center px-4 border-b">
          <Logo />
        </div>
        <SidebarNav role={role} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
