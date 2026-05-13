import { createClient } from "@/lib/supabase/server";
import { canUseAiManagement } from "@/lib/permission-utils";
import { redirect } from "next/navigation";
import AIAssistantClient from "./ai-assistant-client";
import type { Permissions, UserRole } from "@/types";

export default async function AIAssistantPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, permissions")
    .eq("id", user.id)
    .single();

  const role = (profile?.role ?? "member") as UserRole;
  const permissions = (profile?.permissions ?? {}) as Permissions;

  if (!canUseAiManagement(role, permissions)) {
    redirect("/dashboard");
  }

  return <AIAssistantClient actorRole={role} />;
}
