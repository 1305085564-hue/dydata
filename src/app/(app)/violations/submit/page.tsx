import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SubmitForm } from "../components/submit-form";
import type { ViolationAccount } from "../components/types";

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

  const { data } = await supabase
    .from("accounts")
    .select("id, name, content_direction")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: true });
  const accounts = ((data ?? []) as Array<{ id: string; name: string | null; content_direction: string | null }>).map(
    (account) => ({
      id: account.id,
      name: account.name ?? "未命名账号",
      display_name: account.name ?? "未命名账号",
      content_direction: account.content_direction,
    }),
  ) satisfies ViolationAccount[];
  const resolvedSearchParams = await searchParams;
  const initialAccountId =
    typeof resolvedSearchParams.account_id === "string" ? resolvedSearchParams.account_id : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-8">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-400">Submit Case</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-zinc-950 sm:text-3xl">提交话术案例</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
          账号只能从你已有账号里选择，可留空。提交后先进入待验证，由管理员复核结论。
        </p>
      </div>
      <SubmitForm accounts={accounts} initialAccountId={initialAccountId} />
    </div>
  );
}
