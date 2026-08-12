"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import {
  buildAuthPathWithNext,
  buildLoginPath,
  getResetPasswordErrorMessage,
  sanitizeNextPath,
} from "@/lib/auth-password";
import { createClient } from "@/lib/supabase/client";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { AuthShell } from "../_components/auth-shell";

function isRecoverySession(accessToken: string): boolean {
  try {
    const part = accessToken.split(".")[1];
    const padded = part
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(part.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded)) as {
      amr?: Array<{ method: string }>;
    };
    return (
      Array.isArray(payload.amr) && payload.amr.some((a) => a.method === "otp")
    );
  } catch {
    return false;
  }
}

export function ResetPasswordErrorNotice({
  href,
  message,
}: {
  href: string;
  message: string;
}) {
  return (
    <div
      aria-live="polite"
      className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-100 px-3 py-2.5 text-[13px] text-red-700"
      role="alert"
    >
      <p>{message}</p>
      <Link className="font-medium underline underline-offset-4" href={href}>
        重新发送重置邮件
      </Link>
    </div>
  );
}

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const next = sanitizeNextPath(searchParams?.get("next"), "");
  const loginHref = buildLoginPath(next);
  const forgotPasswordHref = buildAuthPathWithNext("/forgot-password", next);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [recoveryState, setRecoveryState] = useState<
    "checking" | "ready" | "invalid"
  >("checking");
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void createClient()
      .auth.getSession()
      .then(({ data, error }) => {
        if (!active) return;
        const valid =
          !error &&
          data.session != null &&
          isRecoverySession(data.session.access_token);
        setRecoveryState(valid ? "ready" : "invalid");
      })
      .catch(() => {
        if (active) setRecoveryState("invalid");
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (recoveryState !== "ready") {
      feedbackToast.error("重置链接已失效，请重新发送");
      return;
    }

    if (password.length < 6) {
      feedbackToast.error("密码至少需要 6 位。");
      return;
    }

    if (password !== confirmPassword) {
      feedbackToast.error("两次输入的密码不一致");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      await supabase.auth.signOut();
      window.location.assign(buildLoginPath(next, { reset: "success" }));
    } catch (error) {
      const message = getResetPasswordErrorMessage(
        error instanceof Error ? error.message : null,
      );
      setSubmitError(message);
      feedbackToast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (recoveryState === "checking") {
    return (
      <AuthShell title="设置新密码" subtitle="正在确认重置链接是否有效">
        <p
          aria-live="polite"
          className="text-center text-[13px] text-zinc-500"
          role="status"
        >
          正在验证重置链接...
        </p>
      </AuthShell>
    );
  }

  if (recoveryState === "invalid") {
    return (
      <AuthShell
        title="重置链接已失效"
        subtitle="请重新发送重置邮件后再设置新密码"
      >
        <div className="space-y-5 text-center">
          <ResetPasswordErrorNotice
            href={forgotPasswordHref}
            message="重置链接无效或已过期，请重新发送重置邮件"
          />
          <p className="text-[13px] text-zinc-500">
            <Link
              className="text-zinc-700 underline underline-offset-4"
              href={loginHref}
            >
              返回登录
            </Link>
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="设置新密码" subtitle="输入并确认你的新密码">
      <form className="space-y-5" onSubmit={handleSubmit}>
        {submitError ? (
          <ResetPasswordErrorNotice
            href={forgotPasswordHref}
            message={submitError}
          />
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="password">新密码</Label>
          <Input
            autoComplete="new-password"
            id="password"
            name="password"
            onChange={(event) => {
              setPassword(event.target.value);
              setSubmitError(null);
            }}
            placeholder="至少 6 位密码"
            required
            type="password"
            value={password}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">确认新密码</Label>
          <Input
            autoComplete="new-password"
            id="confirmPassword"
            name="confirmPassword"
            onChange={(event) => {
              setConfirmPassword(event.target.value);
              setSubmitError(null);
            }}
            placeholder="请再次输入新密码"
            required
            type="password"
            value={confirmPassword}
          />
        </div>
        <Button className="w-full" disabled={submitting} type="submit">
          {submitting ? "提交中" : "确认重置密码"}
        </Button>
        <p className="text-center text-[13px] text-zinc-500">
          <Link
            className="text-zinc-700 underline underline-offset-4"
            href={loginHref}
          >
            返回登录
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
