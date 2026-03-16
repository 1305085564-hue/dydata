import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { RegisterForm } from "./register-form";

type RegisterFormState = {
  error: string | null;
};

export default function RegisterPage() {
  async function registerAction(
    _: RegisterFormState,
    formData: FormData,
  ): Promise<RegisterFormState> {
    "use server";

    const name = formData.get("name")?.toString().trim() ?? "";
    const email = formData.get("email")?.toString().trim() ?? "";
    const password = formData.get("password")?.toString() ?? "";
    const inviteCode = formData.get("inviteCode")?.toString().trim() ?? "";

    if (!name || !email || !password || !inviteCode) {
      return { error: "请完整填写姓名、邮箱、密码和邀请码。" };
    }

    if (password.length < 6) {
      return { error: "密码至少需要 6 位。" };
    }

    const supabase = await createClient();

    const { data: inviteId, error: inviteError } = await supabase
      .rpc("validate_invite_code", { p_code: inviteCode });

    if (inviteError || !inviteId) {
      return { error: "邀请码无效或已被使用。" };
    }

    // 检查有效期
    const { data: inviteRow } = await supabase
      .from("invite_codes")
      .select("expires_at")
      .eq("id", inviteId)
      .single();

    if (inviteRow?.expires_at && new Date(inviteRow.expires_at) < new Date()) {
      return { error: "邀请码已过期，请联系管理员获取新的邀请码。" };
    }

    const invite = { id: inviteId as string };

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
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
    });

    if (profileError) {
      return { error: "创建资料失败，请联系管理员检查 profiles 表权限。" };
    }

    const { error: updateInviteError } = await supabase
      .from("invite_codes")
      .update({
        used_by: userId,
        used_at: new Date().toISOString(),
      })
      .eq("id", invite.id)
      .is("used_by", null);

    if (updateInviteError) {
      return { error: "邀请码回写失败，请联系管理员检查 invite_codes 权限。" };
    }

    if (!signUpData.session) {
      redirect("/login?registered=1");
    }

    redirect("/dashboard");
  }

  return <RegisterForm action={registerAction} />;
}
