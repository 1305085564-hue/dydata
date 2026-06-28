import { createClient } from "@/lib/supabase/server";
import { getSafeAccountDisplayName } from "@/lib/loaders/shared";
import { SubmitForm } from "../components/submit-form";
import type { ViolationAccount } from "../components/types";

interface SubmitContainerProps {
  userId: string;
  userEmail: string | undefined;
  initialAccountId: string | null;
}

export async function SubmitContainer({ userId, userEmail, initialAccountId }: SubmitContainerProps) {
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", userId)
    .single();
  const userDisplayName =
    profile?.name?.trim() || userEmail?.split("@")[0] || "我";

  const { data } = await supabase
    .from("accounts")
    .select("id, name, content_direction")
    .eq("profile_id", userId)
    .order("created_at", { ascending: true });

  const rawAccounts = (data ?? []) as Array<{
    id: string;
    name: string | null;
    content_direction: string | null;
  }>;

  const accounts = rawAccounts.map((account, index, list) => ({
    id: account.id,
    name: account.name ?? "未命名账号",
    display_name: getSafeAccountDisplayName({
      rawName: account.name,
      userDisplayName,
      contentDirection: account.content_direction,
      index,
      total: list.length,
    }),
    content_direction: account.content_direction,
  })) satisfies ViolationAccount[];

  return <SubmitForm accounts={accounts} initialAccountId={initialAccountId} />;
}
