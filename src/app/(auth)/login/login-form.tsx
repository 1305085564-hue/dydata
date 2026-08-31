"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { buildAuthPathWithNext, getLoginErrorMessage, sanitizeNextPath } from "@/lib/auth-password";

import { AuthShell } from "../_components/auth-shell";

type LoginFormState = {
  error: string | null;
  email: string;
};

type LoginFormProps = {
  action: (state: LoginFormState, formData: FormData) => Promise<LoginFormState>;
  initialEmail?: string;
  notice?: string | null;
  archived?: boolean;
};

const initialState: LoginFormState = {
  error: null,
  email: "",
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button className="w-full h-10 text-[13.5px] font-medium relative overflow-hidden rounded-md transition-colors duration-100 active:scale-[0.99] active:duration-120 shadow-sm hover:shadow" disabled={pending} type="submit">
      {pending ? (
        <span className="inline-flex items-center gap-2">
          <Loader2 className="size-4 animate-spin text-white" />
          <span>正在开启工作台...</span>
        </span>
      ) : (
        "登录"
      )}
    </Button>
  );
}

export function LoginForm({
  action,
  initialEmail = "",
  notice,
  archived = false,
}: LoginFormProps) {
  const searchParams = useSearchParams();
  const next = sanitizeNextPath(searchParams?.get("next"), "");
  const forgotPasswordHref = buildAuthPathWithNext("/forgot-password", next);
  const registerHref = buildAuthPathWithNext("/register", next);

  const [state, formAction] = useActionState(action, {
    ...initialState,
    email: initialEmail,
  });

  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [keepLoggedIn, setKeepLoggedIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showArchivedAlert, setShowArchivedAlert] = useState(archived);
  const [showExpiredAlert, setShowExpiredAlert] = useState(
    searchParams?.get("error") === "expired"
  );
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (state.email) setEmail(state.email);
  }, [state.email]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (state.error) {
      setPassword("");
      passwordInputRef.current?.focus();
      feedbackToast.error(getLoginErrorMessage(state.error));
    }
  }, [state.error]);

  useEffect(() => {
    if (notice) feedbackToast.success(notice);
  }, [notice]);

  return (
    <AuthShell title="回到工作台" subtitle="翻开今日篇章，记录每一次真实表达">
      <form action={formAction} className="space-y-5">
        {showArchivedAlert && (
          <Alert variant="error">
            <span className="text-[12.5px] font-medium text-[#292524]">
              账号已归档，请联系 owner 恢复
            </span>
            <button
              type="button"
              onClick={() => setShowArchivedAlert(false)}
              className="shrink-0 text-[#78716C] transition-colors hover:text-[#1C1917] p-0.5 cursor-pointer"
              aria-label="关闭提示"
            >
              <X className="size-3.5" />
            </button>
          </Alert>
        )}
        {showExpiredAlert && (
          <Alert variant="warning">
            <span className="text-[12.5px] font-medium text-[#8F641B] dark:text-[#D99E55]">
              登录会话已过期，请重新登录
            </span>
            <button
              type="button"
              onClick={() => setShowExpiredAlert(false)}
              className="shrink-0 text-[#8F641B] hover:text-[#6F4D13] dark:text-[#D99E55] dark:hover:text-[#E2B46F] p-0.5 cursor-pointer"
              aria-label="关闭提示"
            >
              <X className="size-3.5" />
            </button>
          </Alert>
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
            className="h-9 text-[13px]"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">密码</Label>
            <Link
              className="text-[12px] text-[#78716C] hover:text-[#D97757] transition-colors"
              href={forgotPasswordHref}
            >
              忘记密码
            </Link>
          </div>
          <div className="relative">
            <Input
              autoComplete="current-password"
              id="password"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="输入密码"
              required
              type={showPassword ? "text" : "password"}
              value={password}
              ref={passwordInputRef}
              aria-invalid={Boolean(state.error)}
              className="h-9 pr-9 text-[13px]"
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
          {state.error ? (
            <p className="text-[12px] font-medium text-[#C0685C] animate-in fade-in duration-200" role="alert">
              {getLoginErrorMessage(state.error)}
            </p>
          ) : null}
        </div>

        <label
          className="flex items-center gap-2 text-[13px] text-[#78716C] cursor-pointer select-none"
          htmlFor="keep-logged-in"
        >
          <Checkbox
            checked={keepLoggedIn}
            id="keep-logged-in"
            name="keepLoggedIn"
            onCheckedChange={(checked) => setKeepLoggedIn(checked === true)}
          />
          保持登录状态（30天免密）
        </label>

        <SubmitButton />

        <p className="text-center text-[13px] text-[#78716C]">
          还没有账号？
          <Link className="ml-1 text-[#292524] hover:text-[#D97757] underline underline-offset-4 transition-colors" href={registerHref}>
            去注册
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
