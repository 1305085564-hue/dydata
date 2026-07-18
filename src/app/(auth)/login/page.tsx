import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { getLoginErrorMessage, getLoginNotice } from "@/lib/auth-password";
import { createClient } from "@/lib/supabase/server";
import {
  KEEP_LOGGED_IN_COOKIE_NAME,
  KEEP_LOGGED_IN_COOKIE_VALUE,
  KEEP_LOGGED_IN_MAX_AGE,
} from "@/lib/supabase/session-cookie";

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
    const keepLoggedIn = formData.get("keepLoggedIn") === "on";

    if (!email || !password) {
      return { error: "请输入邮箱和密码。", email };
    }

    const supabase = await createClient({ keepLoggedIn });
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      return { error: getLoginErrorMessage(error?.message), email };
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();

    if (profileError || !profile) {
      return { error: "未找到账号资料，请联系管理员。", email };
    }

    const cookieStore = await cookies();
    if (keepLoggedIn) {
      cookieStore.set(KEEP_LOGGED_IN_COOKIE_NAME, KEEP_LOGGED_IN_COOKIE_VALUE, {
        httpOnly: true,
        maxAge: KEEP_LOGGED_IN_MAX_AGE,
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
    } else {
      cookieStore.delete(KEEP_LOGGED_IN_COOKIE_NAME);
    }

    redirect(getPostLoginRedirectPath(profile.role, params.next));
  }

  return <LoginForm action={loginAction} notice={getLoginNotice(params)} />;
}
