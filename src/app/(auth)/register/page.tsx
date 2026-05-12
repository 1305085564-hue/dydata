import { redirect } from "next/navigation";

import { getTeamOptions } from "@/lib/teams";
import { createClient } from "@/lib/supabase/server";
import { ensureDefaultDashboardAccount } from "@/lib/dashboard-account-provisioning";

import { RegisterForm } from "./register-form";

type RegisterFormState = {
  error: string | null;
};

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const teams = await getTeamOptions();

  async function registerAction(
    _: RegisterFormState,
    formData: FormData,
  ): Promise<RegisterFormState> {
    "use server";

    const name = formData.get("name")?.toString().trim() ?? "";
    const email = formData.get("email")?.toString().trim() ?? "";
    const password = formData.get("password")?.toString() ?? "";
    const teamId = formData.get("teamId")?.toString().trim() ?? "";
    const selectedTeam = teams.find((team) => team.id === teamId);

    if (!name || !email || !password) {
      return { error: "请完整填写姓名、邮箱和密码。" };
    }

    if (password.length < 6) {
      return { error: "密码至少需要 6 位。" };
    }

    if (!selectedTeam) {
      return { error: "请选择要申请加入的团队。" };
    }

    const supabase = await createClient();

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          pending_team_id: selectedTeam.id,
          pending_team_name: selectedTeam.name,
        },
      },
    });

    if (signUpError || !signUpData.user) {
      return { error: signUpError?.message ?? "注册失败，请稍后重试。" };
    }

    const userId = signUpData.user.id;

    const { error: profileError } = await supabase.from("profiles").insert({
      id: userId,
      name,
      role: "member",
      team_id: null,
      permissions: {},
    });

    if (profileError) {
      return { error: "创建资料失败，请联系管理员检查 profiles 表权限。" };
    }

    try {
      await ensureDefaultDashboardAccount({
        adminSupabase: supabase as never,
        profileId: userId,
        preferredName: name,
      });
    } catch {
      return { error: "创建默认账号失败，请联系管理员检查 accounts 表权限。" };
    }

    const { error: joinRequestError } = await supabase.from("team_join_requests").insert({
      applicant_user_id: userId,
      target_team_id: selectedTeam.id,
    });

    if (joinRequestError) {
      console.error("team_join_requests insert failed", joinRequestError);
    }

    if (!signUpData.session) {
      redirect(`/login?registered=1&pending=${encodeURIComponent(selectedTeam.name)}`);
    }

    redirect("/dashboard?just_registered=1");
  }

  return <RegisterForm action={registerAction} teams={teams} />;
}
