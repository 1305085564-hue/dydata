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
import type { TeamOption } from "@/lib/teams";

type RegisterFormState = {
  error: string | null;
};

type RegisterFormProps = {
  action: (state: RegisterFormState, formData: FormData) => Promise<RegisterFormState>;
  teams: TeamOption[];
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
          注册中...
        </>
      ) : (
        "创建账号"
      )}
    </Button>
  );
}

export function RegisterForm({ action, teams }: RegisterFormProps) {
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
    <div className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-6">
      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <section className="hidden rounded-[32px] border border-white/65 bg-white/55 p-8 shadow-[var(--shadow-float)] backdrop-blur-[18px] lg:block">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">
            Invite Registration
          </p>
          <h1 className="mt-4 text-[2rem] font-semibold tracking-[-0.03em] text-[var(--color-text-primary)]">
            创建你的 DYData 账号
          </h1>
          <p className="mt-3 max-w-md text-sm leading-7 text-[var(--color-text-secondary)]">
            用邀请码加入团队，并在注册时选择你的所属团队。团队名称由后台统一维护，已有员工默认归属深圳二部。
          </p>
          <div className="mt-8 space-y-3">
            {[
              "姓名、邮箱、密码、邀请码仍然是原有注册字段",
              "新增团队选择，便于后续按团队管理成员与数据",
              "注册完成后仍按原流程进入系统",
            ].map((item) => (
              <div
                key={item}
                className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/75 px-4 py-3 text-sm text-[var(--color-text-secondary)] shadow-[var(--shadow-light)]"
              >
                <span className="size-2 rounded-full bg-[var(--color-primary)]" />
                {item}
              </div>
            ))}
          </div>
          <Link
            href="/demo"
            className="mt-6 inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/14"
          >
            先看演示站（右上角可退出）
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
                <CardTitle className="text-center text-2xl font-semibold tracking-[-0.03em]">
                  注册 DYData
                </CardTitle>
                <CardDescription className="text-sm leading-6">
                  使用邀请码创建团队账号
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <motion.form action={formAction} animate={formControls} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="name">姓名</Label>
                  <div className="input-focus-line">
                    <Input
                      autoComplete="name"
                      className="h-11 rounded-xl transition-all duration-200 focus-visible:ring-primary/25"
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
                      className="h-11 rounded-xl transition-all duration-200 focus-visible:ring-primary/25"
                      id="email"
                      name="email"
                      placeholder="name@example.com"
                      required
                      type="email"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="teamId">所属团队</Label>
                  <div className="input-focus-line">
                    <select
                      id="teamId"
                      name="teamId"
                      className="flex h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
                      defaultValue={teams[0]?.id ?? ""}
                      required
                    >
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">密码</Label>
                  <div className="input-focus-line">
                    <Input
                      autoComplete="new-password"
                      className="h-11 rounded-xl transition-all duration-200 focus-visible:ring-primary/25"
                      id="password"
                      name="password"
                      placeholder="至少 6 位密码"
                      required
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2 rounded-2xl border border-white/70 bg-white/78 p-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>密码强度</span>
                      <span>
                        {passwordStrengthLevel
                          ? passwordStrengthConfig[passwordStrengthIndex - 1]?.label
                          : "未输入"}
                      </span>
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
                      className="h-11 rounded-xl transition-all duration-200 focus-visible:ring-primary/25"
                      id="inviteCode"
                      name="inviteCode"
                      placeholder="请输入邀请码"
                      required
                      type="text"
                    />
                  </div>
                </div>

                <SubmitButton />

                <Link
                  className="flex w-full items-center justify-center rounded-xl border border-primary/20 bg-primary/8 px-4 py-3 text-sm font-medium text-primary transition-colors hover:bg-primary/12"
                  href="/demo"
                >
                  先看演示站（右上角可退出）
                </Link>

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
    </div>
  );
}
