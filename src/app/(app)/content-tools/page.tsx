import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import ContentToolsLoading from "./loading";
import { ContentToolsDataContainer } from "./content-tools-data-container";

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
