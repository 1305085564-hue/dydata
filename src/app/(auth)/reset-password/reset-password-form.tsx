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

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const next = sanitizeNextPath(searchParams?.get("next"), "");
  const loginHref = buildLoginPath(next);
  const forgotPasswordHref = buildAuthPathWithNext("/forgot-password", next);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [recoveryState, setRecoveryState] = useState<"checking" | "ready" | "invalid">("checking");

  useEffect(() => {
    let active = true;

    void createClient().auth.getSession()
      .then(({ data, error }) => {
        if (!active) return;
        setRecoveryState(!error && data.session ? "ready" : "invalid");
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

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        feedbackToast.error("密码已重置，但当前会话退出失败，请关闭页面后重新登录");
        return;
      }
      window.location.assign(buildLoginPath(next, { reset: "success" }));
    } catch (error) {
      feedbackToast.error(getResetPasswordErrorMessage((error as Error).message));
    } finally {
      setSubmitting(false);
    }
  }

  if (recoveryState === "checking") {
    return (
      <AuthShell title="设置新密码" subtitle="正在确认重置链接是否有效">
        <p aria-live="polite" className="text-center text-[13px] text-stone-500" role="status">
          正在验证重置链接...
        </p>
      </AuthShell>
    );
  }

  if (recoveryState === "invalid") {
    return (
      <AuthShell title="重置链接已失效" subtitle="请重新发送重置邮件后再设置新密码">
        <div className="space-y-5 text-center">
          <Link className="text-[13px] text-stone-700 underline underline-offset-4" href={forgotPasswordHref}>
            重新发送重置邮件
          </Link>
          <p className="text-[13px] text-stone-500">
            <Link className="text-stone-700 underline underline-offset-4" href={loginHref}>
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
          <div className="space-y-2">
            <Label htmlFor="password">新密码</Label>
            <Input
              autoComplete="new-password"
              id="password"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
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
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="请再次输入新密码"
              required
              type="password"
              value={confirmPassword}
            />
          </div>
          <Button className="w-full" disabled={submitting} type="submit">
            {submitting ? "提交中" : "确认重置密码"}
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
