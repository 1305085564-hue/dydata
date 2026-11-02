import type { Metadata } from "next";

import { PasswordResetNotice } from "../_components/password-reset-notice";

export const metadata: Metadata = {
  title: "重置密码",
  description: "请联系管理员为你重置 DYData 登录密码。",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  return <PasswordResetNotice next={typeof next === "string" ? next : undefined} />;
}
