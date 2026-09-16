import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardOverview } from "@/components/dashboard/overview";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { loadDashboardData } from "@/lib/dashboard/overview";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export const metadata: Metadata = {
  title: "Dashboard · Precious Promises",
  robots: { index: false, follow: false },
};
export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(LOGIN_PATH);
  const data = await loadDashboardData();
  return <DashboardOverview data={data} email={user.email ?? null} />;
}
