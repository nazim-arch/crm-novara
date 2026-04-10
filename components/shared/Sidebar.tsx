"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Users,
  Building2,
  CheckSquare,
  CalendarClock,
  Settings,
  LayoutDashboard,
} from "lucide-react";

const navItems = [
  {
    label: "Dashboards",
    items: [
      { href: "/dashboard/crm", label: "CRM Overview", icon: LayoutDashboard },
      { href: "/dashboard/tasks", label: "Task Overview", icon: BarChart3 },
    ],
  },
  {
    label: "CRM",
    items: [
      { href: "/leads", label: "Leads", icon: Users },
      { href: "/opportunities", label: "Opportunities", icon: Building2 },
      { href: "/follow-ups", label: "Follow-ups", icon: CalendarClock },
    ],
  },
  {
    label: "Tasks",
    items: [
      { href: "/tasks", label: "Tasks", icon: CheckSquare },
    ],
  },
  {
    label: "Settings",
    items: [
      { href: "/settings/users", label: "Users", icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 shrink-0 border-r bg-card flex flex-col h-full">
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
            D
          </div>
          <span className="font-semibold text-sm">DealStack</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        {navItems.map((section) => (
          <div key={section.label} className="mb-4">
            <p className="px-2 mb-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              {section.label}
            </p>
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
