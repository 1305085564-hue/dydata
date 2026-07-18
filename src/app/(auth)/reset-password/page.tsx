import type { Metadata } from "next";
import { Suspense } from "react";

import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "重置密码",
  description: "设置新的 DYData 登录密码。",
};

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
