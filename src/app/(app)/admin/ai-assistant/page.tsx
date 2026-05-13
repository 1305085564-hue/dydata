import { createClient } from "@/lib/supabase/server";
import { getUserPermissions } from "@/lib/permissions";
import { canUseAiManagement } from "@/lib/permission-utils";
import { redirect } from "next/navigation";
import AIAssistantClient from "./ai-assistant-client";

export default async function AIAssistantPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const permissionInfo = await getUserPermissions();

  if (!permissionInfo || !canUseAiManagement(permissionInfo.businessRole, permissionInfo.permissions)) {
    redirect("/dashboard");
  }

  return <AIAssistantClient actorRole={permissionInfo.role} />;
}
