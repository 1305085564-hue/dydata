import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AIAssistantClient from "./ai-assistant-client";

export default async function AIAssistantPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role !== "admin" && profile.role !== "owner")) {
    redirect("/dashboard");
  }

  return <AIAssistantClient />;
}
