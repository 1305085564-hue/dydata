import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import AIFeaturesClient from "./ai-features-client";

export default async function AIFeaturesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "owner") {
    redirect("/admin");
  }

  return <AIFeaturesClient />;
}
