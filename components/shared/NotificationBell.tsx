"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn, formatRelativeTime } from "@/lib/utils";
import Link from "next/link";

type Notification = {
  id: string;
  message: string;
  read: boolean;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
};

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=10");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.data ?? []);
      }
    } catch {
      // Silent fail
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markRead = async (id: string) => {
    await fetch(`/api/notifications/${id}`, { method: "PATCH" });
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const getEntityUrl = (n: Notification) => {
    if (!n.entity_type || !n.entity_id) return null;
    const map: Record<string, string> = {
      Lead: `/leads/${n.entity_id}`,
      Task: `/tasks/${n.entity_id}`,
      Opportunity: `/opportunities/${n.entity_id}`,
    };
    return map[n.entity_type] ?? null;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-[10px] font-bold text-white flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <p className="font-semibold text-sm">Notifications</p>
          {unreadCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {unreadCount} new
            </Badge>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No notifications
            </p>
          ) : (
            notifications.map((n) => {
              const url = getEntityUrl(n);
              const content = (
                <div
                  className={cn(
                    "px-4 py-3 border-b last:border-0 cursor-pointer hover:bg-muted/50 transition-colors",
                    !n.read && "bg-primary/5"
                  )}
                  onClick={() => markRead(n.id)}
                >
                  <p className={cn("text-sm", !n.read && "font-medium")}>
                    {n.message}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatRelativeTime(n.created_at)}
                  </p>
                </div>
              );
              return url ? (
                <Link key={n.id} href={url} onClick={() => setOpen(false)}>
                  {content}
                </Link>
              ) : (
                <div key={n.id}>{content}</div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
