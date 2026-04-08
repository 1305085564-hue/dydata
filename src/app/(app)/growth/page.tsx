import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadGrowthPageData } from "@/lib/loaders/growth-page";
import { GrowthClientShell } from "./growth-client";

export default async function GrowthPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const data = await loadGrowthPageData({
    supabase,
    userId: user.id,
    userEmail: user.email,
  });

  return <GrowthClientShell {...data} />;
}
