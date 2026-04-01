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
    startTransition(async () => {
      const result = await createAccount(name, contentDirection);
      if (result?.error) {
        feedbackToast.error(result.error);
      } else {
        feedbackToast.success("账号添加成功");
        setOpen(false);
        setName("");
        setContentDirection("");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" variant="outline" size="sm" className="h-10 rounded-xl" />
        }
      >
        <Plus className="size-4" />
        添加账号
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>添加新账号</DialogTitle>
          <DialogDescription>
            一个用户可以管理多个账号，这里填写你自己看得懂的账号备注名，方便切换提交
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="account-name">账号备注名</Label>
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
            <Label htmlFor="content-direction">出镜 / 图文方向（选填）</Label>
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
