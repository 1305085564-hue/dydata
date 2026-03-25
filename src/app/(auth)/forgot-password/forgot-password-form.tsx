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
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="glass-card-static w-full max-w-md shadow-[var(--shadow-heavy)]">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold tracking-tight">找回密码</CardTitle>
          <CardDescription>输入邮箱，我们会发送重置密码邮件</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <div className="input-focus-line">
                <Input
                  autoComplete="email"
                  className="h-10 transition-all duration-200 focus-visible:ring-primary/30"
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
            <Button className="w-full" disabled={submitting} type="submit">
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
  );
}
