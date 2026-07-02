"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { createAccount } from "./actions";

export function AddAccountDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [contentDirection, setContentDirection] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const submittedName = name;
    const submittedDirection = contentDirection;

    feedbackToast.success("账号添加已提交");
    setOpen(false);
    setName("");
    setContentDirection("");

    startTransition(async () => {
      const result = await createAccount(submittedName, submittedDirection);
      if (result?.error) {
        setName(submittedName);
        setContentDirection(submittedDirection);
        setOpen(true);
        feedbackToast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" variant="outline" size="sm" className="h-10" />
        }
      >
        <Plus className="size-4 stroke-[1.5]" />
        添加账号
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[18px] font-semibold tracking-tight text-zinc-800">添加新账号</DialogTitle>
          <DialogDescription className="text-[13px] leading-[1.7] text-zinc-500">
            一个用户可以管理多个账号，这里填写你自己看得懂的账号备注名，方便切换提交
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="account-name" className="text-[13px] font-medium text-zinc-800">账号备注名</Label>
            <Input
              id="account-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：主账号、矩阵号A、出镜号"
              required
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="content-direction" className="text-[13px] font-medium text-zinc-800">出镜 / 图文方向（选填）</Label>
            <Input
              id="content-direction"
              value={contentDirection}
              onChange={(e) => setContentDirection(e.target.value)}
              placeholder="例如：出镜、图文、财经口播"
              disabled={isPending}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              取消
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "添加中..." : "确认添加"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
