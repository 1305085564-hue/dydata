"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { getApiErrorMessage } from "@/lib/violations/errors";
import type { ViolationAccount } from "./types";

export function TestRecordForm({
  caseId,
  accounts,
}: {
  caseId: string;
  accounts: ViolationAccount[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "none");
  const [passed, setPassed] = useState("true");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch(`/api/violations/${caseId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: accountId === "none" ? null : accountId,
          passed: passed === "true",
          note: String(form.get("note") ?? "").trim() || null,
        }),
      });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(getApiErrorMessage(payload, "追加测试失败"));

      feedbackToast.success("测试记录已追加");
      setOpen(false);
      router.replace(`/violations/${caseId}?t=${Date.now()}`);
    } catch (error) {
      feedbackToast.error(error instanceof Error ? error.message : "追加测试失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" className="h-11 rounded-2xl border-zinc-300 text-zinc-700 hover:bg-zinc-50" />}>
        <Plus className="size-4" />
        我也测了
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>追加测试记录</DialogTitle>
          <DialogDescription>选择自己的账号，记录这条话术在你这里是否通过。</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">测试账号</Label>
              <Select value={accountId} onValueChange={(value) => value && setAccountId(value)}>
                <SelectTrigger className="h-11 w-full rounded-2xl">
                  <SelectValue placeholder="选择账号" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">不关联账号</SelectItem>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.display_name || account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">结果</Label>
              <Select value={passed} onValueChange={(value) => value && setPassed(value)}>
                <SelectTrigger className="h-11 w-full rounded-2xl">
                  <SelectValue placeholder="测试结果" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">通过</SelectItem>
                  <SelectItem value="false">未通过</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="note" className="text-sm font-semibold">
              备注
            </Label>
            <Textarea id="note" name="note" rows={4} placeholder="补充账号情况、发布时间或审核结果" className="rounded-2xl" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="rounded-2xl" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="submit" disabled={isSubmitting} className="rounded-2xl bg-zinc-900 text-white hover:bg-zinc-800">
              {isSubmitting ? "提交中..." : "提交记录"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
