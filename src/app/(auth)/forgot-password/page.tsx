import type { Metadata } from "next";
import { Suspense } from "react";

import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = {
  title: "找回密码",
  description: "通过邮箱找回 DYData 登录密码。",
};

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotPasswordForm />
    </Suspense>
  );
}
