import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { AIConfigShell, type AIConfigTabKey } from "./ai-config-shell";
import AIRewriteClient from "../ai-rewrite/ai-rewrite-client";

interface Props {
  searchParams: Promise<{ tab?: string }>;
}

function normalizeTab(value: string | undefined): AIConfigTabKey {
  return value === "rewrite" ? "rewrite" : "channels";
}

export default async function AIChannelsPage({ searchParams }: Props) {
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

  const params = await searchParams;
  const initialTab = normalizeTab(params.tab);

  return (
    <AdminWorkspaceLayout
      eyebrow="AI Config Center"
      title="AI 配置中心"
      description="渠道、功能绑定、文案改写集中维护。"
      indexItems={[]}
      actions={<AIRewriteClient embedded />}
    >
      <AIConfigShell initialTab={initialTab} />
    </AdminWorkspaceLayout>
  );
}
