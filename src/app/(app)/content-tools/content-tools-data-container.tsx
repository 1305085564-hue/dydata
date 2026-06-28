import { createClient } from "@/lib/supabase/server";
import { loadContentToolsPageData } from "@/lib/loaders/content-tools-page";
import { ContentToolsClient } from "./content-tools-client";

interface ContentToolsDataContainerProps {
  userId: string;
}

export async function ContentToolsDataContainer({ userId }: ContentToolsDataContainerProps) {
  const supabase = await createClient();
  const data = await loadContentToolsPageData({
    supabase,
    userId,
  });

  return <ContentToolsClient accounts={data.accounts} summary={data.summary} />;
}
