import type { Metadata } from "next";

import { PasswordResetNotice } from "../_components/password-reset-notice";

const title = "找回密码";

export const metadata: Metadata = {
  title,
  description: "请联系管理员为你重置 DYData 登录密码。",
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  return <PasswordResetNotice title={title} next={typeof next === "string" ? next : undefined} />;
}
