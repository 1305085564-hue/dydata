"use client";

import Link from "next/link";
import { useState } from "react";

import { getResetPasswordErrorMessage } from "@/lib/auth-password";
import { createClient } from "@/lib/supabase/client";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

      if (error) {
        throw error;
      }

      feedbackToast.success("密码已重置，请重新登录");
      window.location.assign("/login?reset=success");
    } catch (error) {
      feedbackToast.error(getResetPasswordErrorMessage((error as Error).message));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-6">
      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <section className="hidden rounded-[32px] border border-white/65 bg-white/55 p-8 shadow-[var(--shadow-float)] backdrop-blur-[18px] lg:block">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">Reset Password</p>
          <h1 className="mt-4 text-[2rem] font-semibold tracking-[-0.03em] text-[var(--color-text-primary)]">设置新的登录密码</h1>
          <p className="mt-3 max-w-md text-sm leading-7 text-[var(--color-text-secondary)]">
            重新设置密码后，你会回到登录页。这里只改访问口令，不影响账号、日报和分析数据。
          </p>
          <div className="mt-8 space-y-3">
            {[
              "至少 6 位，建议字母和数字混用",
              "确认后立即写入原有认证系统",
              "完成后直接返回登录重新进入工作台",
            ].map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/75 px-4 py-3 text-sm text-[var(--color-text-secondary)] shadow-[var(--shadow-light)]">
                <span className="size-2 rounded-full bg-[var(--color-primary)]" />
                {item}
              </div>
            ))}
          </div>
        </section>

        <Card className="glass-card-static w-full max-w-md justify-self-center border-white/70 bg-white/78 shadow-[var(--shadow-heavy)] backdrop-blur-[18px]">
          <CardHeader className="space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/12 text-lg font-semibold text-primary">
              DY
            </div>
            <div className="space-y-2">
              <CardTitle className="text-2xl font-semibold tracking-[-0.03em]">设置新密码</CardTitle>
              <CardDescription className="text-sm leading-6">输入并确认你的新密码</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="password">新密码</Label>
                <div className="input-focus-line">
                  <Input
                    autoComplete="new-password"
                    className="h-11 rounded-xl transition-all duration-200 focus-visible:ring-primary/25"
                    id="password"
                    name="password"
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="至少 6 位密码"
                    required
                    type="password"
                    value={password}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">确认新密码</Label>
                <div className="input-focus-line">
                  <Input
                    autoComplete="new-password"
                    className="h-11 rounded-xl transition-all duration-200 focus-visible:ring-primary/25"
                    id="confirmPassword"
                    name="confirmPassword"
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="请再次输入新密码"
                    required
                    type="password"
                    value={confirmPassword}
                  />
                </div>
              </div>
              <Button className="h-11 w-full rounded-xl" disabled={submitting} type="submit">
                {submitting ? "提交中" : "确认重置密码"}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                <Link className="underline underline-offset-4" href="/login">
                  返回登录
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
