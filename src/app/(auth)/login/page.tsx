import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { LoginForm } from "./login-form";

type LoginFormState = {
  error: string | null;
};

export default function LoginPage() {
  async function loginAction(_: LoginFormState, formData: FormData): Promise<LoginFormState> {
    "use server";

    const email = formData.get("email")?.toString().trim() ?? "";
    const password = formData.get("password")?.toString() ?? "";

    if (!email || !password) {
      return { error: "请输入邮箱和密码。" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      return { error: error?.message ?? "登录失败，请检查邮箱和密码。" };
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();

    if (profileError || !profile) {
      return { error: "未找到账号资料，请联系管理员。" };
    }

    redirect(profile.role === "admin" ? "/admin" : "/dashboard");
  }

  return <LoginForm action={loginAction} />;
}
