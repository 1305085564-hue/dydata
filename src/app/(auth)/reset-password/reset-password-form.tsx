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
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="glass-card-static w-full max-w-md shadow-[var(--shadow-heavy)]">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold tracking-tight">设置新密码</CardTitle>
          <CardDescription>输入并确认你的新密码</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="password">新密码</Label>
              <div className="input-focus-line">
                <Input
                  autoComplete="new-password"
                  className="h-10 transition-all duration-200 focus-visible:ring-primary/30"
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
                  className="h-10 transition-all duration-200 focus-visible:ring-primary/30"
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
            <Button className="w-full" disabled={submitting} type="submit">
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
  );
}
