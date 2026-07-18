import type { Metadata } from "next";
import { RegisterForm } from "./register-form";
import { registerUser } from "@/lib/auth-registration";

export const metadata: Metadata = {
  title: "注册",
  description: "创建 DYData 账号，加入团队并开始记录抖音运营数据。",
};

type RegisterFormState = {
  error: string | null;
};

interface RegisterPageProps {
  searchParams: Promise<{ next?: string }>;
}

export const dynamic = "force-dynamic";

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const params = await searchParams;

  async function registerAction(
    state: RegisterFormState,
    formData: FormData,
  ): Promise<RegisterFormState> {
    "use server";
    return registerUser(state, formData, undefined, params.next);
  }

  return <RegisterForm action={registerAction} initialTeams={[]} />;
}
