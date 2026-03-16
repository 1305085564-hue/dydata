"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { toast } from "sonner";

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
    <Button className="w-full" disabled={pending} type="submit">
      {pending ? "登录中..." : "登录"}
    </Button>
  );
}

export function LoginForm({ action }: LoginFormProps) {
  const [state, formAction] = useActionState(action, initialState);

  useEffect(() => {
    if (state.error) {
      toast.error(state.error);
    }
  }, [state.error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground text-xl font-bold">
            DY
          </div>
          <CardTitle className="text-xl">登录 DYData</CardTitle>
          <CardDescription>抖音数据日报平台</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <Input
                autoComplete="email"
                id="email"
                name="email"
                placeholder="name@example.com"
                required
                type="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                autoComplete="current-password"
                id="password"
                name="password"
                placeholder="请输入密码"
                required
                type="password"
              />
            </div>
            <SubmitButton />
            <p className="text-center text-sm text-muted-foreground">
              还没有账号？
              <Link className="ml-1 underline underline-offset-4" href="/register">
                去注册
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
