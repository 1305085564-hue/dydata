"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { buildLoginPath, sanitizeNextPath } from "@/lib/auth-password";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff } from "lucide-react";
import type { TeamOption } from "@/lib/teams";

import { AuthShell } from "../_components/auth-shell";

type RegisterFormState = {
  error: string | null;
};

type RegisterFormProps = {
  action: (state: RegisterFormState, formData: FormData) => Promise<RegisterFormState>;
  initialTeams: TeamOption[];
};

type PasswordStrengthLevel = "weak" | "medium" | "strong";

const initialState: RegisterFormState = {
  error: null,
};

const passwordStrengthConfig: Array<{
  label: string;
  level: PasswordStrengthLevel;
  barColor: string;
  textColor: string;
}> = [
  { label: "弱", level: "weak", barColor: "#D99E55", textColor: "#8F641B" },
  { label: "中", level: "medium", barColor: "#43718E", textColor: "#355B72" },
  { label: "强", level: "strong", barColor: "#6FAA7D", textColor: "#3F7A4E" },
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

function SubmitButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button className="w-full" disabled={pending || disabled} type="submit">
      {pending ? "注册中" : "创建账号"}
    </Button>
  );
}

export function RegisterForm({ action, initialTeams }: RegisterFormProps) {
  const searchParams = useSearchParams();
  const loginHref = buildLoginPath(sanitizeNextPath(searchParams?.get("next"), ""));
  const [state, formAction] = useActionState(action, initialState);
  const [teams, setTeams] = useState(initialTeams);
  const [isLoadingTeams, setIsLoadingTeams] = useState(initialTeams.length === 0);
  const [teamLoadError, setTeamLoadError] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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

  useEffect(() => {
    if (initialTeams.length > 0) return;

    let alive = true;
    fetch("/api/register-teams", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("load teams failed");
        return response.json() as Promise<{ teams: TeamOption[] }>;
      })
      .then((payload) => {
        if (!alive) return;
        setTeams(payload.teams);
        setTeamLoadError(payload.teams.length === 0);
      })
      .catch(() => {
        if (!alive) return;
        setTeamLoadError(true);
      })
      .finally(() => {
        if (alive) setIsLoadingTeams(false);
      });

    return () => {
      alive = false;
    };
  }, [initialTeams.length]);

  return (
    <AuthShell title="创建 DYData 账号" subtitle="注册后提交入团申请，管理员审核通过即可查看团队数据">
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
            <Label htmlFor="teamId">申请加入团队</Label>
            <select
              id="teamId"
              name="teamId"
              className="flex h-8 w-full rounded-lg border border-[#E5E0D6] bg-[#FBF9F5] px-3 text-[13px] text-[#292524] outline-none transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] focus-visible:bg-white focus-visible:border-[#78716C] focus-visible:shadow-sm focus-visible:ring-1 focus-visible:ring-[#1C1917]/10"
              defaultValue=""
              disabled={isLoadingTeams || teams.length === 0}
              required
            >
              <option value="" disabled>
                {isLoadingTeams ? "正在加载团队" : "请选择目标团队"}
              </option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
            <p className="text-[12px] text-[#78716C]">
              {teamLoadError ? "团队列表暂时加载失败，请刷新后重试" : "提交后由管理员审核，通过后将归属该团队"}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
            <div className="relative">
              <Input
                autoComplete="new-password"
                id="password"
                name="password"
                placeholder="至少 6 位密码"
                required
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#78716C] hover:text-[#292524] focus:outline-none transition-colors p-0.5 rounded"
                aria-label={showPassword ? "隐藏密码" : "显示密码"}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </button>
            </div>
            {password ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-1 gap-1">
                  {passwordStrengthConfig.map((item, idx) => (
                    <span
                      key={item.level}
                      className="h-[3px] flex-1 rounded-full bg-[#F5F3EE] transition-[background-color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
                      style={
                        idx < passwordStrengthIndex
                          ? { backgroundColor: activeConfig?.barColor }
                          : undefined
                      }
                    />
                  ))}
                </div>
                <span
                  className="text-[12px] font-medium tracking-tight"
                  style={activeConfig ? { color: activeConfig.textColor } : undefined}
                >
                  {activeConfig?.label ?? ""}
                </span>
              </div>
            ) : null}
          </div>

          <SubmitButton disabled={isLoadingTeams || teams.length === 0} />



          <p className="text-center text-[13px] text-[#78716C]">
            已有账号？
            <Link className="ml-1 text-[#292524] underline underline-offset-4" href={loginHref}>
              去登录
            </Link>
          </p>
        </form>
    </AuthShell>
  );
}
