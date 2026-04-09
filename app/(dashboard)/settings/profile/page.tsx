import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/settings/ProfileForm";

export default async function ProfileSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="p-6 max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Profile Settings</h1>
        <p className="text-sm text-muted-foreground">Update your name, phone, and password</p>
      </div>
      <ProfileForm
        userId={session.user.id}
        name={session.user.name ?? ""}
        email={session.user.email ?? ""}
      />
    </div>
  );
}
