import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function IntentRadarLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "Admin") {
    redirect("/dashboard/crm");
  }
  return <>{children}</>;
}
