import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { SubmitForm } from "../components/submit-form";
import type { ViolationAccount } from "../components/types";
import { getSafeAccountDisplayName } from "@/lib/loaders/shared";

export default async function SubmitViolationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();
  const userDisplayName =
    profile?.name?.trim() || user.email?.split("@")[0] || "我";

  const { data } = await supabase
    .from("accounts")
    .select("id, name, content_direction")
    .eq("profile_id", user.id)
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
  const resolvedSearchParams = await searchParams;
  const initialAccountId =
    typeof resolvedSearchParams.account_id === "string" ? resolvedSearchParams.account_id : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 py-8">
      <Breadcrumb
        items={[
          { label: "话术案例库", href: "/violations" },
          { label: "提交新案例" },
        ]}
      />
      <div>
        <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">Submit Case</p>
        <h1 className="mt-2 text-[24px] font-semibold leading-[1.33] tracking-tight text-zinc-800">提交话术案例</h1>
        <p className="mt-2 max-w-2xl text-[13px] leading-[1.7] text-zinc-500">
          账号只能从你已有账号里选择，可留空。提交后先进入待验证，由管理员复核结论。
        </p>
      </div>
      <SubmitForm accounts={accounts} initialAccountId={initialAccountId} />
    </div>
  );
}
