import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { defaultLandingPath } from "@/lib/rbac";

export default async function RootPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  redirect(defaultLandingPath(session.user.role));
}
