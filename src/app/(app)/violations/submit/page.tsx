import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { SubmitContainer } from "./submit-container";

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

  const resolvedSearchParams = await searchParams;
  const initialAccountId =
    typeof resolvedSearchParams.account_id === "string" ? resolvedSearchParams.account_id : null;

  return (
    <div className="space-y-4">
      <Breadcrumb
        items={[
          { label: "导粉中心", href: "/violations" },
          { label: "提交新案例" },
        ]}
      />
      <AdminWorkspaceLayout
        eyebrow="Submit Case"
        title="提交话术案例"
        description="账号只能从你已有账号里选择，可留空。提交后先进入待验证，由管理员复核结论。"
        indexItems={[]}
        width="wide"
      >
        <Suspense fallback={<div className="h-48 rounded-xl bg-stone-50/50 animate-pulse border border-stone-200" />}>
          <SubmitContainer userId={user.id} userEmail={user.email} initialAccountId={initialAccountId} />
        </Suspense>
      </AdminWorkspaceLayout>
    </div>
  );
}
