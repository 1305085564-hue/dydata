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

type RegisterFormState = {
  error: string | null;
};

type RegisterFormProps = {
  action: (state: RegisterFormState, formData: FormData) => Promise<RegisterFormState>;
};

const initialState: RegisterFormState = {
  error: null,
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button className="w-full" disabled={pending} type="submit">
      {pending ? "注册中..." : "创建账号"}
    </Button>
  );
}

export function RegisterForm({ action }: RegisterFormProps) {
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
          <CardTitle className="text-xl">注册 DYData</CardTitle>
          <CardDescription>使用邀请码创建团队账号</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">姓名</Label>
              <Input
                autoComplete="name"
                id="name"
                name="name"
                placeholder="请输入姓名"
                required
                type="text"
              />
            </div>
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
                autoComplete="new-password"
                id="password"
                name="password"
                placeholder="至少 6 位密码"
                required
                type="password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inviteCode">邀请码</Label>
              <Input
                id="inviteCode"
                name="inviteCode"
                placeholder="请输入邀请码"
                required
                type="text"
              />
            </div>
            <SubmitButton />
            <p className="text-center text-sm text-muted-foreground">
              已有账号？
              <Link className="ml-1 underline underline-offset-4" href="/login">
                去登录
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
