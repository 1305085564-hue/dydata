"use client";

import { motion, useAnimationControls, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { feedbackToast } from "@/components/ui/feedback-toast";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    <Button
      className="w-full transition-transform hover:scale-[1.02]"
      disabled={pending}
      type="submit"
    >
      {pending ? (
        <>
          <svg
            aria-hidden="true"
            className="size-4 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-90"
              d="M22 12a10 10 0 0 0-10-10"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </svg>
          登录中
        </>
      ) : (
        "登录"
      )}
    </Button>
  );
}

export function LoginForm({ action, initialEmail = "", notice = null }: LoginFormProps) {
  const [state, formAction] = useActionState(action, { ...initialState, email: initialEmail });
  const formControls = useAnimationControls();
  const shouldReduceMotion = useReducedMotion();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [rememberEmail, setRememberEmail] = useState(Boolean(initialEmail));

  useEffect(() => {
    const savedEmail = window.localStorage.getItem(STORAGE_KEY);
    if (!initialEmail && savedEmail) {
      setEmail(savedEmail);
      setRememberEmail(true);
    }
  }, [initialEmail]);

  useEffect(() => {
    if (state.email) {
      setEmail(state.email);
    }
  }, [state.email]);

  useEffect(() => {
    if (rememberEmail) {
      if (email.trim()) {
        window.localStorage.setItem(STORAGE_KEY, email.trim());
      }
      return;
    }

    window.localStorage.removeItem(STORAGE_KEY);
  }, [email, rememberEmail]);

  useEffect(() => {
    if (state.error) {
      setPassword("");
      feedbackToast.error(state.error);
      void formControls.start({
        x: [0, -8, 8, -4, 4, 0],
        transition: { duration: 0.4 },
      });
    }
  }, [formControls, state.error]);

  useEffect(() => {
    if (notice) {
      feedbackToast.success(notice);
    }
  }, [notice]);

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-6">
      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <section className="hidden rounded-[32px] border border-white/65 bg-white/55 p-8 shadow-[var(--shadow-float)] backdrop-blur-[18px] lg:block">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">Mac Auth Template</p>
          <h1 className="mt-4 text-[2rem] font-semibold tracking-[-0.03em] text-[var(--color-text-primary)]">回到 DYData 工作台</h1>
          <p className="mt-3 max-w-md text-sm leading-7 text-[var(--color-text-secondary)]">
            登录后继续处理日报、经营分析和成长复盘。界面统一了，但登录逻辑、账号权限和数据流程都保持原样。
          </p>
          <div className="mt-8 space-y-3">
            {[
              "同一账号直接进入原来的后台权限范围",
              "支持记住邮箱，减少重复输入",
              "忘记密码可无缝跳到重置流程",
            ].map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/75 px-4 py-3 text-sm text-[var(--color-text-secondary)] shadow-[var(--shadow-light)]">
                <span className="size-2 rounded-full bg-[var(--color-primary)]" />
                {item}
              </div>
            ))}
          </div>
          <Link
            href="/demo"
            className="mt-6 inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/14"
          >
            不登录，进入演示站（右上角可退出）
          </Link>
        </section>

        <motion.div
          animate={{ opacity: 1, y: 0, scale: 1, filter: shouldReduceMotion ? "none" : "blur(0px)" }}
          initial={{ opacity: 0, y: 20, scale: 0.98, filter: shouldReduceMotion ? "none" : "blur(8px)" }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="w-full max-w-md justify-self-center"
        >
          <Card className="glass-card-static w-full border-white/70 bg-white/78 shadow-[var(--shadow-heavy)] backdrop-blur-[18px]">
            <CardHeader className="space-y-4 text-center">
              <motion.div
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/12 text-lg font-semibold text-primary"
              >
                DY
              </motion.div>
              <div className="space-y-2">
                <CardTitle className="text-center text-2xl font-semibold tracking-[-0.03em]">登录 DYData</CardTitle>
                <CardDescription className="text-sm leading-6">抖音数据日报平台</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <motion.form action={formAction} animate={formControls} className="space-y-5">
                {notice ? (
                  <p className="rounded-2xl border border-emerald-500/18 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-700">
                    {notice}
                  </p>
                ) : null}
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
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="password">密码</Label>
                    <Link className="text-sm text-muted-foreground underline underline-offset-4" href="/forgot-password">
                      忘记密码？
                    </Link>
                  </div>
                  <div className="input-focus-line">
                    <Input
                      autoComplete="current-password"
                      className="h-11 rounded-xl transition-all duration-200 focus-visible:ring-primary/25"
                      id="password"
                      name="password"
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="请输入密码"
                      required
                      type="password"
                      value={password}
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm text-muted-foreground" htmlFor="remember-email">
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
                  className="flex w-full items-center justify-center rounded-xl border border-primary/20 bg-primary/8 px-4 py-3 text-sm font-medium text-primary transition-colors hover:bg-primary/12"
                  href="/demo"
                >
                  先看演示站（右上角可退出）
                </Link>
                <p className="text-center text-sm text-muted-foreground">
                  还没有账号？
                  <Link className="ml-1 underline underline-offset-4" href="/register">
                    去注册
                  </Link>
                </p>
              </motion.form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
