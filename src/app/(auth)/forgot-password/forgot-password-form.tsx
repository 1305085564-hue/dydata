"use client";

import Link from "next/link";
import { useState } from "react";

import { FORGOT_PASSWORD_SUCCESS_MESSAGE } from "@/lib/auth-password";
import { createClient } from "@/lib/supabase/client";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
      const redirectTo = `${window.location.origin}/auth/callback?next=/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo });

      if (error) {
        throw error;
      }

      feedbackToast.success(FORGOT_PASSWORD_SUCCESS_MESSAGE);
      window.location.assign("/login");
    } catch {
      feedbackToast.success(FORGOT_PASSWORD_SUCCESS_MESSAGE);
      window.location.assign("/login");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-6">
      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <section className="hidden rounded-[32px] border border-white/65 bg-white/55 p-8 shadow-[var(--shadow-float)] backdrop-blur-[18px] lg:block">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">Account Recovery</p>
          <h1 className="mt-4 text-[2rem] font-semibold tracking-[-0.03em] text-[var(--color-text-primary)]">找回账号访问权</h1>
          <p className="mt-3 max-w-md text-sm leading-7 text-[var(--color-text-secondary)]">
            输入你的登录邮箱，我们会发送重置密码邮件。先把入口找回来，再继续回到数据台处理今天的内容。
          </p>
          <div className="mt-8 space-y-3">
            {[
              "邮箱验证后可直接跳到重置页",
              "不改账号资料和历史数据",
              "全流程仍走原有 Supabase 认证逻辑",
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
              <CardTitle className="text-2xl font-semibold tracking-[-0.03em]">找回密码</CardTitle>
              <CardDescription className="text-sm leading-6">输入邮箱，我们会发送重置密码邮件</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="email">邮箱</Label>
                <div className="input-focus-line">
                  <Input
                    autoComplete="email"
                    className="h-11 rounded-xl transition-all duration-200 focus-visible:ring-primary/25"
                    id="email"
                    name="email"
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="name@example.com"
                    required
                    type="email"
                    value={email}
                  />
                </div>
              </div>
              <Button className="h-11 w-full rounded-xl" disabled={submitting} type="submit">
                {submitting ? "发送中" : "发送重置邮件"}
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
