import { redirect } from "next/navigation";

import { getLoginNotice } from "@/lib/auth-password";
import { createClient } from "@/lib/supabase/server";

import { LoginForm } from "./login-form";
import { getPostLoginRedirectPath } from "./post-login-redirect";

type LoginFormState = {
  error: string | null;
  email: string;
};

interface LoginPageProps {
  searchParams: Promise<{
    registered?: string;
    reset?: string;
    from?: string;
    next?: string;
  }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  async function loginAction(_: LoginFormState, formData: FormData): Promise<LoginFormState> {
    "use server";

    const email = formData.get("email")?.toString().trim() ?? "";
    const password = formData.get("password")?.toString() ?? "";

    if (!email || !password) {
      return { error: "请输入邮箱和密码。", email };
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      return { error: error?.message ?? "登录失败，请检查邮箱和密码。", email };
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();

    if (profileError || !profile) {
      return { error: "未找到账号资料，请联系管理员。", email };
    }

    redirect(getPostLoginRedirectPath(profile.role, params.next));
  }

  return <LoginForm action={loginAction} notice={getLoginNotice(params)} />;
}
