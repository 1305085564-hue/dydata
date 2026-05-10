"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { feedbackToast } from "@/components/ui/feedback-toast";

import { Button } from "@/components/ui/button";
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
  color: string;
}> = [
  { label: "弱", level: "weak", color: "#D99E55" },
  { label: "中", level: "medium", color: "#8AA8C7" },
  { label: "强", level: "strong", color: "#6FAA7D" },
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
    <Button className="w-full" disabled={pending} type="submit">
      {pending ? "注册中" : "创建账号"}
    </Button>
  );
}

export function RegisterForm({ action, teams }: RegisterFormProps) {
  const [state, formAction] = useActionState(action, initialState);
  const [password, setPassword] = useState("");
  const passwordStrengthLevel = useMemo(() => getPasswordStrengthLevel(password), [password]);
  const passwordStrengthIndex = getPasswordStrengthIndex(passwordStrengthLevel);
  const activeConfig = passwordStrengthLevel
    ? passwordStrengthConfig.find((item) => item.level === passwordStrengthLevel)
    : null;

  useEffect(() => {
    if (state.error) {
      feedbackToast.error(state.error);
    }
  }, [state.error]);

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-10 space-y-3 text-center">
          <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">
            Invite Registration
          </p>
          <h1 className="text-[20px] font-semibold tracking-tight text-zinc-800">
            创建 DYData 账号
          </h1>
          <p className="text-[13px] leading-[1.7] text-zinc-500">
            使用邀请码加入团队
          </p>
        </div>

        <form action={formAction} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name">姓名</Label>
            <Input autoComplete="name" id="name" name="name" placeholder="请输入姓名" required type="text" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">邮箱</Label>
            <Input autoComplete="email" id="email" name="email" placeholder="name@example.com" required type="email" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="teamId">所属团队</Label>
            <select
              id="teamId"
              name="teamId"
              className="flex h-8 w-full rounded-lg border border-transparent bg-zinc-100/70 px-3 text-[13px] text-zinc-800 outline-none transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] focus-visible:bg-white focus-visible:border-zinc-200 focus-visible:shadow-sm focus-visible:ring-1 focus-visible:ring-zinc-950/5"
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

          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
            <Input
              autoComplete="new-password"
              id="password"
              name="password"
              placeholder="至少 6 位密码"
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {password ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-1 gap-1">
                  {passwordStrengthConfig.map((item, idx) => (
                    <span
                      key={item.level}
                      className="h-[3px] flex-1 rounded-full bg-zinc-100 transition-[background-color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
                      style={
                        idx < passwordStrengthIndex
                          ? { backgroundColor: activeConfig?.color }
                          : undefined
                      }
                    />
                  ))}
                </div>
                <span
                  className="text-[12px] font-medium tracking-tight"
                  style={activeConfig ? { color: activeConfig.color } : undefined}
                >
                  {activeConfig?.label ?? ""}
                </span>
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="inviteCode">邀请码</Label>
            <Input id="inviteCode" name="inviteCode" placeholder="请输入邀请码" required type="text" />
          </div>

          <SubmitButton />

          <Link
            className="flex w-full items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 py-2 text-[13px] font-medium tracking-tight text-zinc-500 transition-[background-color,color,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-[1px] hover:bg-zinc-100 hover:text-zinc-800 active:translate-y-0"
            href="/demo"
          >
            先看演示站
          </Link>

          <p className="text-center text-[13px] text-zinc-500">
            已有账号？
            <Link className="ml-1 text-zinc-800 underline underline-offset-4" href="/login">
              去登录
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
