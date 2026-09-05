"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState, useCallback, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { buildLoginPath, sanitizeNextPath } from "@/lib/auth-password";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eye, EyeOff, Loader2, RefreshCw, Users } from "lucide-react";
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
  { label: "弱", level: "weak", barColor: "#B98A54", textColor: "#8F641B" },
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
    <Button
      className="w-full h-10 text-[13.5px] font-medium relative overflow-hidden rounded-md transition-colors duration-100 active:scale-[0.99] active:duration-120 shadow-sm hover:shadow"
      disabled={pending || disabled}
      type="submit"
    >
      {pending ? (
        <span className="flex items-center justify-center gap-1.5">
          <Loader2 className="size-3.5 animate-spin" />
          <span>正在提交申请...</span>
        </span>
      ) : (
        "提交加入申请"
      )}
    </Button>
  );
}

export function RegisterForm({ action, initialTeams }: RegisterFormProps) {
  const searchParams = useSearchParams();
  const loginHref = buildLoginPath(sanitizeNextPath(searchParams?.get("next"), ""));
  const [state, formAction] = useActionState(action, initialState);
  const [teams, setTeams] = useState(initialTeams);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [isLoadingTeams, setIsLoadingTeams] = useState(initialTeams.length === 0);
  const [teamLoadError, setTeamLoadError] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const passwordStrengthLevel = useMemo(() => getPasswordStrengthLevel(password), [password]);
  const passwordStrengthIndex = getPasswordStrengthIndex(passwordStrengthLevel);
  const activeConfig = passwordStrengthLevel
    ? passwordStrengthConfig.find((item) => item.level === passwordStrengthLevel)
    : null;

  const fetchTeams = useCallback(() => {
    setIsLoadingTeams(true);
    setTeamLoadError(false);
    fetch("/api/register-teams", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("load teams failed");
        return response.json() as Promise<{ teams: TeamOption[] }>;
      })
      .then((payload) => {
        setTeams(payload.teams);
        setTeamLoadError(payload.teams.length === 0);
      })
      .catch(() => {
        setTeamLoadError(true);
      })
      .finally(() => {
        setIsLoadingTeams(false);
      });
  }, []);

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
    <AuthShell
      eyebrow="DYData 组织准入"
      title="申请加入团队"
      subtitle="创建账号并绑定所属内容团队，提交后由管理员授权开通"
    >
      <form action={formAction} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-[13px] text-[#292524]">真实姓名</Label>
          <Input
            autoComplete="name"
            id="name"
            name="name"
            placeholder="请输入您的真实姓名"
            required
            type="text"
            className="focus:bg-white border-[#E5E0D6] text-[13px]"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-[13px] text-[#292524]">工作邮箱</Label>
          <Input
            autoComplete="email"
            id="email"
            name="email"
            placeholder="name@example.com"
            required
            type="email"
            className="focus:bg-white border-[#E5E0D6] text-[13px]"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="teamId" className="text-[13px] text-[#292524]">申请归属团队</Label>
            {teamLoadError && (
              <button
                type="button"
                onClick={fetchTeams}
                className="flex items-center gap-1 text-[11px] text-[#D97757] hover:underline"
              >
                <RefreshCw className="size-3" />
                重新加载
              </button>
            )}
          </div>
          <input type="hidden" name="teamId" value={selectedTeamId} required />
          <Select
            value={selectedTeamId}
            onValueChange={(val) => setSelectedTeamId(val ?? "")}
            disabled={isLoadingTeams || teams.length === 0}
          >
            <SelectTrigger className="flex h-9 w-full rounded-lg border border-[#E5E0D6] px-3 text-[13px] text-[#292524] outline-none transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] focus-visible:bg-white focus-visible:border-[#78716C] focus-visible:shadow-2xs focus-visible:ring-1 focus-visible:ring-[#1C1917]/10 data-placeholder:text-[#78716C]">
              <SelectValue placeholder={isLoadingTeams ? "正在获取可选团队列表..." : "请选择您所属的目标团队"} />
            </SelectTrigger>
            <SelectContent className="rounded-xl border border-[#E5E0D6] shadow-claude-float max-h-60">
              {teams.map((team) => (
                <SelectItem key={team.id} value={team.id} className="text-[13px]">
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[12px] leading-relaxed text-[#78716C]">
            {teamLoadError
              ? "团队列表暂时加载失败，请点击上方重新加载。"
              : "请准确选择所属团队，管理员审核通过后将拥有该团队的数据权限。"}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-[13px] text-[#292524]">设置登录密码</Label>
          <div className="relative">
            <Input
              autoComplete="new-password"
              id="password"
              name="password"
              placeholder="至少 6 位字符"
              required
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="focus:bg-white border-[#E5E0D6] pr-9 text-[13px]"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[#78716C] transition-colors hover:text-[#292524] focus:outline-none"
              aria-label={showPassword ? "隐藏密码" : "显示密码"}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </button>
          </div>
          {password ? (
            <div className="flex items-center justify-between gap-3 pt-1">
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

        {/* 审批流程提示卡 */}
        <div className="rounded-lg border border-[#ECE7DE]/60 bg-transparent p-3 text-[12px] text-[#78716C]">
          <div className="flex items-center gap-1.5 font-medium text-[#292524]">
            <Users className="size-3.5 text-[#D97757]" />
            <span>入团审批流程</span>
          </div>
          <p className="mt-1 text-[11.5px] leading-relaxed text-[#78716C]">
            提交后将向该团队管理员发送入团待办。审批通过前，账号暂时无法查看团队业务数据。
          </p>
        </div>

        <div className="pt-2">
          <SubmitButton disabled={isLoadingTeams || teams.length === 0} />
        </div>

        <p className="text-center text-[13px] text-[#78716C]">
          已有账号？
          <Link className="ml-1 text-[#292524] underline underline-offset-4 hover:text-[#D97757]" href={loginHref}>
            返回登录
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
