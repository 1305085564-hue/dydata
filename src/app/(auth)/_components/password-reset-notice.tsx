import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { buildLoginPath, PASSWORD_RESET_UNAVAILABLE_MESSAGE } from "@/lib/auth-password";

import { AuthShell } from "./auth-shell";

export function PasswordResetNotice({ next }: { next?: string }) {
  return (
    <AuthShell title="找回密码">
      <div className="space-y-5">
        <Alert>{PASSWORD_RESET_UNAVAILABLE_MESSAGE}</Alert>
        <p className="text-center text-[14px] text-[#78716C]">
          <Link className="text-[#1F1E1D] underline underline-offset-4" href={buildLoginPath(next)}>
            返回登录
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
