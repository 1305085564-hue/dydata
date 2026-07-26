"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useSearchParams } from "next/navigation";
import { Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { buildAuthPathWithNext, getLoginErrorMessage, sanitizeNextPath } from "@/lib/auth-password";

import { AuthShell } from "../_components/auth-shell";

const FEISHU_JSSDK_URL =
  "https://lf1-cdn-tos.bytegoofy.com/goofy/lark/op/h5-js-sdk-1.5.33/h5-js-sdk-lark.js";

/** 动态加载飞书 JSSDK */
function loadFeishuSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && (window as any).h5sdk) {
      resolve();
      return;
    }

    const existing = document.querySelector(`script[src="${FEISHU_JSSDK_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("JSSDK 加载失败")));
      return;
    }

    const script = document.createElement("script");
    script.src = FEISHU_JSSDK_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("JSSDK 加载失败"));
    document.head.appendChild(script);
  });
}

type LoginFormState = {
  error: string | null;
  email: string;
};

type LoginFormProps = {
  action: (state: LoginFormState, formData: FormData) => Promise<LoginFormState>;
  initialEmail?: string;
  notice?: string | null;
};

const initialState: LoginFormState = {
  error: null,
  email: "",
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button className="w-full relative overflow-hidden transition-all duration-150 active:scale-[0.98]" disabled={pending} type="submit">
      {pending ? (
        <span className="flex items-center justify-center gap-1.5">
          <Loader2 className="size-3.5 animate-spin" />
          <span>验证凭证中...</span>
        </span>
      ) : (
        "进入工作台"
      )}
    </Button>
  );
}

export function LoginForm({ action, initialEmail = "", notice = null }: LoginFormProps) {
  const searchParams = useSearchParams();
  const isExpired = searchParams?.get("expired") === "1";
  const next = sanitizeNextPath(searchParams?.get("next"), "");
  const forgotPasswordHref = buildAuthPathWithNext("/forgot-password", next);
  const registerHref = buildAuthPathWithNext("/register", next);
  const [showExpiredAlert, setShowExpiredAlert] = useState(isExpired);

  const [state, formAction] = useActionState(action, { ...initialState, email: initialEmail });
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [keepLoggedIn, setKeepLoggedIn] = useState(false);
  const [feishuLoading, setFeishuLoading] = useState(false);
  const feishuAbortRef = useRef(false);

  const handleFeishuLogin = useCallback(async () => {
    setFeishuLoading(true);
    feishuAbortRef.current = false;

    try {
      // 1. 加载飞书 JSSDK
      await loadFeishuSdk();

      const h5sdk = (window as any).h5sdk;
      if (!h5sdk) {
        feedbackToast.error("飞书 SDK 加载失败，请用邮箱密码登录");
        return;
      }

      // 2. 获取 JSSDK 鉴权签名
      const configResp = await fetch("/api/feishu/jssdk-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: window.location.href.split("#")[0] }),
      });

      if (!configResp.ok) {
        feedbackToast.error("飞书鉴权失败，请用邮箱密码登录");
        return;
      }

      const config = await configResp.json();

      // 3. 配置 JSSDK
      await new Promise<void>((resolve, reject) => {
        h5sdk.ready(() => {
          h5sdk.config({
            appId: config.appId,
            timestamp: config.timestamp,
            nonceStr: config.nonceStr,
            signature: config.signature,
            jsApiList: ["requestAuthCode"],
            onSuccess: () => resolve(),
            onFail: (err: any) => reject(new Error(JSON.stringify(err))),
          });
        });
      });

      if (feishuAbortRef.current) return;

      // 4. 获取授权码
      const authResult = await new Promise<{ code: string }>((resolve, reject) => {
        h5sdk.ready(() => {
          h5sdk.requestAuthCode({
            appId: config.appId,
            onSuccess: (res: { code: string }) => resolve(res),
            onFail: (err: any) => reject(new Error(JSON.stringify(err))),
          });
        });
      });

      if (feishuAbortRef.current) return;

      // 5. 用授权码换取 Supabase session token
      const ssoResp = await fetch("/api/feishu/sso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: authResult.code }),
      });

      const ssoData = await ssoResp.json();

      if (!ssoResp.ok) {
        feedbackToast.error(ssoData.hint || ssoData.error || "飞书登录失败");
        return;
      }

      // 6. 用 token 创建 Supabase session
      const { createBrowserClient } = await import("@supabase/ssr");
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );

      const { error: otpError } = await supabase.auth.verifyOtp({
        type: "magiclink",
        token_hash: ssoData.hashed_token,
      });

      if (otpError) {
        console.error("verifyOtp 失败:", otpError);
        feedbackToast.error("登录失败，请用邮箱密码登录");
        return;
      }

      // 7. 登录成功，跳转
      window.location.href = next || "/dashboard";
    } catch (err) {
      console.error("飞书登录异常:", err);
      feedbackToast.error("飞书登录失败，请用邮箱密码登录");
    } finally {
      setFeishuLoading(false);
    }
  }, [next]);

  // 组件卸载时中断飞书登录流程
  useEffect(() => {
    return () => {
      feishuAbortRef.current = true;
    };
  }, []);

  useEffect(() => {
    setShowExpiredAlert(isExpired);
  }, [isExpired]);

  useEffect(() => {
    if (state.email) setEmail(state.email);
  }, [state.email]);

  useEffect(() => {
    if (state.error) {
      setPassword("");
      feedbackToast.error(getLoginErrorMessage(state.error));
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
            <span className="mt-0.5 text-[12px] font-medium text-[#8F641B] dark:text-[#D99E55]">
              登录会话已过期，请重新登录
            </span>
            <button
              type="button"
              onClick={() => setShowExpiredAlert(false)}
              className="ml-auto mt-0.5 shrink-0 text-[#8F641B] transition-colors hover:text-[#6F4D13] dark:text-[#D99E55] dark:hover:text-[#E2B46F]"
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
          <div className="flex flex-col gap-2 relative">
            <Label htmlFor="password">密码</Label>
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
            <Link
              className="absolute right-0 top-0 active:translate-y-0 text-[12px] text-zinc-500 hover:text-zinc-700"
              href={forgotPasswordHref}
            >
              忘记密码
            </Link>
          </div>
        </div>

        <label
          className="flex items-center gap-2 text-[13px] text-zinc-500"
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

        <div className="relative my-2">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-200" />
          </div>
          <div className="relative flex justify-center text-[12px]">
            <span className="bg-white px-3 text-zinc-400">或</span>
          </div>
        </div>

        <Button
          className="w-full bg-[#3370FF] text-white hover:bg-[#2860E1] active:scale-[0.98] transition-all duration-150"
          disabled={feishuLoading}
          onClick={handleFeishuLogin}
          type="button"
          variant="outline"
        >
          {feishuLoading ? (
            <span className="flex items-center justify-center gap-1.5">
              <Loader2 className="size-3.5 animate-spin" />
              <span>飞书授权中...</span>
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <span className="flex items-center justify-center size-4 rounded-sm bg-white/20 text-[10px] font-bold">
                飞
              </span>
              飞书一键登录
            </span>
          )}
        </Button>



        <p className="text-center text-[13px] text-zinc-500">
          还没有账号？
          <Link className="ml-1 text-zinc-700 underline underline-offset-4" href={registerHref}>
            去注册
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
