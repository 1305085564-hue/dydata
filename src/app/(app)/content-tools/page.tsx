import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { ContentToolsClient } from "./content-tools-client";
import type { ContentToolAccount } from "./types";

export default async function ContentToolsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, name, content_direction")
    .eq("user_id", user.id)
    .order("name", { ascending: true });

  const normalizedAccounts: ContentToolAccount[] = (accounts ?? []).map((account) => ({
    id: account.id,
    name: account.name,
    contentDirection: account.content_direction,
  }));

  return <ContentToolsClient accounts={normalizedAccounts} />;
}
