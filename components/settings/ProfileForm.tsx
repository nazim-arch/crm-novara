"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

interface ProfileFormProps {
  userId: string;
  name: string;
  email: string;
}

export function ProfileForm({ userId, name, email }: ProfileFormProps) {
  const router = useRouter();
  const [profileForm, setProfileForm] = useState({ name, phone: "" });
  const [passwordForm, setPasswordForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: profileForm.name, phone: profileForm.phone || undefined }),
      });
      if (!res.ok) {
        toast.error("Failed to update profile");
        return;
      }
      toast.success("Profile updated");
      router.refresh();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      toast.error("Passwords do not match");
      return;
    }
    setSavingPassword(true);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_password: passwordForm.current_password,
          new_password: passwordForm.new_password,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        toast.error(typeof result.error === "string" ? result.error : "Failed to change password");
        return;
      }
      toast.success("Password changed");
      setPasswordForm({ current_password: "", new_password: "", confirm_password: "" });
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Personal Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={email} disabled className="bg-muted" />
            <p className="text-xs text-muted-foreground">Email cannot be changed</p>
          </div>
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input
              value={profileForm.name}
              onChange={(e) => setProfileForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input
              value={profileForm.phone}
              onChange={(e) => setProfileForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="+91..."
            />
          </div>
          <Button onClick={handleSaveProfile} disabled={savingProfile}>
            {savingProfile ? "Saving..." : "Save Profile"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Change Password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Current Password</Label>
            <Input
              type="password"
              value={passwordForm.current_password}
              onChange={(e) => setPasswordForm((f) => ({ ...f, current_password: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>New Password</Label>
            <Input
              type="password"
              value={passwordForm.new_password}
              onChange={(e) => setPasswordForm((f) => ({ ...f, new_password: e.target.value }))}
              placeholder="Min 8 characters"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Confirm New Password</Label>
            <Input
              type="password"
              value={passwordForm.confirm_password}
              onChange={(e) => setPasswordForm((f) => ({ ...f, confirm_password: e.target.value }))}
            />
          </div>
          <Button onClick={handleChangePassword} disabled={savingPassword} variant="outline">
            {savingPassword ? "Changing..." : "Change Password"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
