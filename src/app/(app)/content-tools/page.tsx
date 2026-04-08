import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadContentToolsPageData } from "@/lib/loaders/content-tools-page";
import { ContentToolsClient } from "./content-tools-client";

export default async function ContentToolsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const data = await loadContentToolsPageData({
    supabase,
    userId: user.id,
  });

  return <ContentToolsClient accounts={data.accounts} summary={data.summary} />;
}
