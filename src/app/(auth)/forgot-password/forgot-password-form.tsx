"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import {
  buildLoginPath,
  buildPasswordRecoveryRedirectUrl,
  FORGOT_PASSWORD_SUCCESS_MESSAGE,
  getForgotPasswordErrorMessage,
  sanitizeNextPath,
} from "@/lib/auth-password";
import { createClient } from "@/lib/supabase/client";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { AuthShell } from "../_components/auth-shell";

export function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const next = sanitizeNextPath(searchParams?.get("next"), "");
  const loginHref = buildLoginPath(next);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      feedbackToast.error("请输入邮箱");
      return;
    }

    setSubmitting(true);

    try {
      const supabase = createClient();
      const redirectTo = buildPasswordRecoveryRedirectUrl(window.location.origin, next);
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo });
      if (error) throw error;
      setSuccessMessage(FORGOT_PASSWORD_SUCCESS_MESSAGE);
      feedbackToast.success(FORGOT_PASSWORD_SUCCESS_MESSAGE);
    } catch (error) {
      setSuccessMessage(null);
      feedbackToast.error(getForgotPasswordErrorMessage((error as Error).message));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title="找回密码" subtitle="输入邮箱，我们会发送重置密码邮件">
      <form className="space-y-5" onSubmit={handleSubmit}>
          {successMessage ? (
            <div
              aria-live="polite"
              className="rounded-lg border border-[#6FAA7D]/30 bg-[#6FAA7D]/10 px-3 py-2.5 text-[12px] font-medium text-[#4F7E59]"
              role="status"
            >
              {successMessage}
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="email">邮箱</Label>
            <Input
              autoComplete="email"
              id="email"
              name="email"
              onChange={(event) => {
                setEmail(event.target.value);
                setSuccessMessage(null);
              }}
              placeholder="name@example.com"
              required
              type="email"
              value={email}
            />
          </div>
          <Button className="w-full" disabled={submitting} type="submit">
            {submitting ? "发送中" : "发送重置邮件"}
          </Button>
          <p className="text-center text-[13px] text-stone-500">
            <Link className="text-stone-700 underline underline-offset-4" href={loginHref}>
              返回登录
            </Link>
          </p>
        </form>
    </AuthShell>
  );
}
