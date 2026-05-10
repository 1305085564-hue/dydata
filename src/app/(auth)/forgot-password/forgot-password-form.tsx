"use client";

import Link from "next/link";
import { useState } from "react";

import { FORGOT_PASSWORD_SUCCESS_MESSAGE } from "@/lib/auth-password";
import { createClient } from "@/lib/supabase/client";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { Button } from "@/components/ui/button";
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
      if (error) throw error;
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
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-10 space-y-3 text-center">
          <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">
            Account Recovery
          </p>
          <h1 className="text-[20px] font-semibold tracking-tight text-zinc-800">
            找回密码
          </h1>
          <p className="text-[13px] leading-[1.7] text-zinc-500">
            输入邮箱，我们会发送重置密码邮件
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="email">邮箱</Label>
            <Input
              autoComplete="email"
              id="email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              required
              type="email"
              value={email}
            />
          </div>
          <Button className="w-full" disabled={submitting} type="submit">
            {submitting ? "发送中" : "发送重置邮件"}
          </Button>
          <p className="text-center text-[13px] text-zinc-500">
            <Link className="text-zinc-800 underline underline-offset-4" href="/login">
              返回登录
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
