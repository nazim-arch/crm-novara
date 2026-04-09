import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/shared/Sidebar";
import { NotificationBell } from "@/components/shared/NotificationBell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getInitials } from "@/lib/utils";
import { SignOutButton } from "@/components/shared/SignOutButton";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const user = session.user;
  const initials = getInitials(user.name ?? user.email ?? "U");

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top header */}
        <header className="h-14 border-b bg-card flex items-center justify-between px-4 shrink-0">
          <div />
          <div className="flex items-center gap-2">
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Avatar className="h-8 w-8 cursor-pointer">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium truncate">{user.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {user.email}
                  </p>
                  <p className="text-xs text-muted-foreground">{user.role}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <a href="/settings/profile" className="w-full">Profile</a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <SignOutButton />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-auto bg-muted/30">
          {children}
        </main>
      </div>
    </div>
  );
}
