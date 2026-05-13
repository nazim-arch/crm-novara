import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { hasPermissionAsync } from "@/lib/rbac";

export default async function PodcastStudioLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await hasPermissionAsync(session.user.role, "podcast_studio:manage"))) redirect("/dashboard/crm");
  return <>{children}</>;
}
