"use client";

import { motion, useAnimationControls, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
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

type RegisterFormState = {
  error: string | null;
};

type RegisterFormProps = {
  action: (state: RegisterFormState, formData: FormData) => Promise<RegisterFormState>;
};

type PasswordStrengthLevel = "weak" | "medium" | "strong";

const initialState: RegisterFormState = {
  error: null,
};

const passwordStrengthConfig: Array<{
  label: string;
  level: PasswordStrengthLevel;
  activeClassName: string;
}> = [
  { label: "弱", level: "weak", activeClassName: "bg-amber-400" },
  { label: "中", level: "medium", activeClassName: "bg-sky-400" },
  { label: "强", level: "strong", activeClassName: "bg-emerald-400" },
];

function getPasswordStrengthLevel(password: string): PasswordStrengthLevel | null {
  if (!password) return null;

  let score = 0;

  if (password.length >= 6) score += 1;
  if (password.length >= 10) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 2) return "weak";
  if (score <= 4) return "medium";
  return "strong";
}

function getPasswordStrengthIndex(level: PasswordStrengthLevel | null) {
  if (!level) return 0;
  return passwordStrengthConfig.findIndex((item) => item.level === level) + 1;
}

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
          注册中
        </>
      ) : (
        "创建账号"
      )}
    </Button>
  );
}

export function RegisterForm({ action }: RegisterFormProps) {
  const [state, formAction] = useActionState(action, initialState);
  const formControls = useAnimationControls();
  const shouldReduceMotion = useReducedMotion();
  const [password, setPassword] = useState("");
  const passwordStrengthLevel = useMemo(() => getPasswordStrengthLevel(password), [password]);
  const passwordStrengthIndex = getPasswordStrengthIndex(passwordStrengthLevel);

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
              注册 DYData
            </CardTitle>
            <CardDescription>使用邀请码创建团队账号</CardDescription>
          </CardHeader>
          <CardContent>
            <motion.form action={formAction} animate={formControls} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">姓名</Label>
                <div className="input-focus-line">
                  <Input
                    autoComplete="name"
                    className="h-10 transition-all duration-200 focus-visible:ring-primary/30"
                    id="name"
                    name="name"
                    placeholder="请输入姓名"
                    required
                    type="text"
                  />
                </div>
              </div>
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
                    autoComplete="new-password"
                    className="h-10 transition-all duration-200 focus-visible:ring-primary/30"
                    id="password"
                    name="password"
                    placeholder="至少 6 位密码"
                    required
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>密码强度</span>
                    <span>{passwordStrengthLevel ? passwordStrengthConfig[passwordStrengthIndex - 1]?.label : "未输入"}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {passwordStrengthConfig.map((item, index) => {
                      const isActive = index < passwordStrengthIndex;
                      const isCurrent = passwordStrengthLevel === item.level;

                      return (
                        <motion.div
                          key={item.level}
                          animate={{ opacity: isActive ? 1 : 0.35, scaleY: isCurrent ? 1 : 0.92 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                          className="h-2 overflow-hidden rounded-full bg-primary/10"
                        >
                          <motion.div
                            className={`h-full rounded-full ${isActive ? item.activeClassName : "bg-transparent"}`}
                            initial={false}
                            animate={{ width: isActive ? "100%" : "0%" }}
                            transition={{ duration: 0.22, ease: "easeOut" }}
                          />
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="inviteCode">邀请码</Label>
                <div className="input-focus-line">
                  <Input
                    className="h-10 transition-all duration-200 focus-visible:ring-primary/30"
                    id="inviteCode"
                    name="inviteCode"
                    placeholder="请输入邀请码"
                    required
                    type="text"
                  />
                </div>
              </div>
              <SubmitButton />
              <p className="text-center text-sm text-muted-foreground">
                已有账号？
                <Link className="ml-1 underline underline-offset-4" href="/login">
                  去登录
                </Link>
              </p>
            </motion.form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
