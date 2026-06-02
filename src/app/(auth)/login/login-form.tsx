"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { feedbackToast } from "@/components/ui/feedback-toast";

import { AuthShell } from "../_components/auth-shell";

type LoginFormState = {
  error: string | null;
  email: string;
};

type LoginFormProps = {
  action: (state: LoginFormState, formData: FormData) => Promise<LoginFormState>;
  initialEmail?: string;
  notice?: string | null;
};

const STORAGE_KEY = "dydata.rememberedEmail";

const initialState: LoginFormState = {
  error: null,
  email: "",
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button className="w-full" disabled={pending} type="submit">
      {pending ? "登录中" : "登录"}
    </Button>
  );
}

export function LoginForm({ action, initialEmail = "", notice = null }: LoginFormProps) {
  const searchParams = useSearchParams();
  const isExpired = searchParams?.get("expired") === "1";
  const [showExpiredAlert, setShowExpiredAlert] = useState(isExpired);

  const [state, formAction] = useActionState(action, { ...initialState, email: initialEmail });
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [rememberEmail, setRememberEmail] = useState(Boolean(initialEmail));

  useEffect(() => {
    setShowExpiredAlert(isExpired);
  }, [isExpired]);

  useEffect(() => {
    const savedEmail = window.localStorage.getItem(STORAGE_KEY);
    if (!initialEmail && savedEmail) {
      setEmail(savedEmail);
      setRememberEmail(true);
    }
  }, [initialEmail]);

  useEffect(() => {
    if (state.email) setEmail(state.email);
  }, [state.email]);

  useEffect(() => {
    if (rememberEmail) {
      if (email.trim()) window.localStorage.setItem(STORAGE_KEY, email.trim());
      return;
    }
    window.localStorage.removeItem(STORAGE_KEY);
  }, [email, rememberEmail]);

  useEffect(() => {
    if (state.error) {
      setPassword("");
      feedbackToast.error(state.error);
    }
  }, [state.error]);

  useEffect(() => {
    if (notice) feedbackToast.success(notice);
  }, [notice]);

  return (
    <AuthShell title="回到工作台">
      <form action={formAction} className="space-y-5">
        {showExpiredAlert && (
          <div className="flex items-start gap-2 rounded-lg border border-[#D99E55]/30 bg-[#D99E55]/10 px-3 py-2.5">
            <span className="mt-0.5 text-[12px] font-medium text-[#D99E55]">
              登录会话已过期，请重新登录
            </span>
            <button
              type="button"
              onClick={() => setShowExpiredAlert(false)}
              className="ml-auto mt-0.5 shrink-0 text-[#D99E55] transition-colors hover:text-[#B88448]"
              aria-label="关闭提示"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="email">邮箱</Label>
          <Input
            autoComplete="email"
            id="email"
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@dydata.cc"
            required
            type="email"
            value={email}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="password">密码</Label>
            <Link
              className="active:translate-y-0 text-[12px] text-zinc-500 hover:text-zinc-800"
              href="/forgot-password"
            >
              忘记密码
            </Link>
          </div>
          <Input
            autoComplete="current-password"
            id="password"
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="请输入密码"
            required
            type="password"
            value={password}
          />
        </div>

        <label
          className="flex items-center gap-2 text-[13px] text-zinc-500"
          htmlFor="remember-email"
        >
          <Checkbox
            checked={rememberEmail}
            id="remember-email"
            name="rememberEmail"
            onCheckedChange={(checked) => setRememberEmail(checked === true)}
          />
          记住邮箱
        </label>

        <SubmitButton />

        <Link
          className="flex w-full items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 py-2 text-[13px] font-medium tracking-tight text-zinc-500 transition-[background-color,color,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-[1px] hover:bg-zinc-100 hover:text-zinc-800 active:translate-y-0"
          href="/demo"
        >
          先看演示站
        </Link>

        <p className="text-center text-[13px] text-zinc-500">
          还没有账号？
          <Link className="ml-1 text-zinc-800 underline underline-offset-4" href="/register">
            去注册
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
