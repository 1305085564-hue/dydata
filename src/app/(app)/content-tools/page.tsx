import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import ContentToolsLoading from "./loading";
import { ContentToolsDataContainer } from "./content-tools-data-container";

export const metadata: Metadata = {
  title: "文案助手",
  description: "管理文案素材并使用 AI 辅助改写抖音内容。",
};

export default async function ContentToolsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <Suspense fallback={<ContentToolsLoading />}>
      <ContentToolsDataContainer userId={user.id} />
    </Suspense>
  );
}
