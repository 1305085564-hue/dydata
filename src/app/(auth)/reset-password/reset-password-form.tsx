"use client";

import Link from "next/link";
import { useState } from "react";

import { getResetPasswordErrorMessage } from "@/lib/auth-password";
import { createClient } from "@/lib/supabase/client";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { AuthShell } from "../_components/auth-shell";

export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

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
      feedbackToast.success("密码已重置，请重新登录");
      window.location.assign("/login?reset=success");
    } catch (error) {
      feedbackToast.error(getResetPasswordErrorMessage((error as Error).message));
    } finally {
      setSubmitting(false);
    }
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
          <p className="text-center text-[13px] text-zinc-500">
            <Link className="text-zinc-800 underline underline-offset-4" href="/login">
              返回登录
            </Link>
          </p>
        </form>
    </AuthShell>
  );
}
