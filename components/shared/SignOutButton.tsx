"use client";

import { signOut } from "next-auth/react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { LogOut } from "lucide-react";

export function SignOutButton() {
  return (
    <DropdownMenuItem
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="text-destructive focus:text-destructive cursor-pointer"
    >
      <LogOut className="mr-2 h-4 w-4" />
      Sign out
    </DropdownMenuItem>
  );
}
