"use client";

import { motion, useAnimationControls, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useActionState, useEffect } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LoginFormState = {
  error: string | null;
};

type LoginFormProps = {
  action: (state: LoginFormState, formData: FormData) => Promise<LoginFormState>;
};

const initialState: LoginFormState = {
  error: null,
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

export function LoginForm({ action }: LoginFormProps) {
  const [state, formAction] = useActionState(action, initialState);
  const formControls = useAnimationControls();
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (state.error) {
      feedbackToast.error(state.error);
      void formControls.start({
        x: [0, -8, 8, -4, 4, 0],
        transition: { duration: 0.4 },
      });
    }
  }, [formControls, state.error]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <motion.div
        animate={{ opacity: 1, y: 0, scale: 1, filter: shouldReduceMotion ? "none" : "blur(0px)" }}
        initial={{ opacity: 0, y: 20, scale: 0.98, filter: shouldReduceMotion ? "none" : "blur(8px)" }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        <Card className="glass-card-static w-full shadow-[var(--shadow-heavy)]">
          <CardHeader className="text-center">
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-xl font-bold text-primary-foreground"
            >
              DY
            </motion.div>
            <CardTitle className="text-center text-2xl font-bold tracking-tight">
              登录 DYData
            </CardTitle>
            <CardDescription>抖音数据日报平台</CardDescription>
          </CardHeader>
          <CardContent>
            <motion.form action={formAction} animate={formControls} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">邮箱</Label>
                <div className="input-focus-line">
                  <Input
                    autoComplete="email"
                    className="h-10 transition-all duration-200 focus-visible:ring-primary/30"
                    id="email"
                    name="email"
                    placeholder="name@example.com"
                    required
                    type="email"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">密码</Label>
                <div className="input-focus-line">
                  <Input
                    autoComplete="current-password"
                    className="h-10 transition-all duration-200 focus-visible:ring-primary/30"
                    id="password"
                    name="password"
                    placeholder="请输入密码"
                    required
                    type="password"
                  />
                </div>
              </div>
              <SubmitButton />
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
  );
}
