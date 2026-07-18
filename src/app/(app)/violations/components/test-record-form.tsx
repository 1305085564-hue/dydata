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
import { Input } from "@/components/ui/input";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { getApiErrorMessage } from "@/lib/violations/errors";
import type { ViolationAccount } from "./types";
import { renderAccountLabel } from "./format";

function todayISODate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

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
  const [resultFlag, setResultFlag] = useState<"pass" | "fail">("pass");
  const [usedAt, setUsedAt] = useState(() => todayISODate());
  const [views, setViews] = useState("0");
  const [follows, setFollows] = useState("0");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const v = Number(views);
    const f = Number(follows);
    if (!Number.isFinite(v) || v < 0 || !Number.isFinite(f) || f < 0) {
      feedbackToast.warning("展示和涨粉必须是 ≥0 的数字");
      return;
    }
    if (f > v) {
      feedbackToast.warning("涨粉数量 × 能大于展示数量");
      return;
    }

    setIsSubmitting(true);
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch(`/api/conversion-hub/usage-records`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_id: caseId,
          script_format: "oral",
          account_id: accountId === "none" ? null : accountId,
          used_at: usedAt,
          views: Math.round(v),
          follows: Math.round(f),
          source: "manual",
          note: String(form.get("note") ?? "").trim() || null,
          result_flag: resultFlag,
        }),
      });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(getApiErrorMessage(payload, "记录效果失败"));

      feedbackToast.success("使用记录已保存");
      setOpen(false);
      router.replace(`/violations/${caseId}?t=${Date.now()}`);
    } catch (error) {
      feedbackToast.error(error instanceof Error ? error.message : "记录效果失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" className="h-11 rounded-lg border-stone-300 text-stone-700 hover:bg-stone-50" />}>
        <Plus className="size-4" />
        记录效果
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>记录使用效果</DialogTitle>
          <DialogDescription>选择账号 + 实际数据，让团队判断这条话术是否值得继续使用。</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-[13px] font-medium">账号</Label>
              <Select value={accountId} onValueChange={(value) => value && setAccountId(value)}>
                <SelectTrigger className="h-11 w-full rounded-xl">
                  <SelectValue placeholder="选择账号">
                    {accountId === "none"
                      ? "不关联账号"
                      : (() => {
                          const idx = accounts.findIndex((account) => account.id === accountId);
                          return idx >= 0
                            ? renderAccountLabel(accounts[idx], idx, accounts.length)
                            : "选择账号";
                        })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">不关联账号</SelectItem>
                  {accounts.map((account, index) => (
                    <SelectItem key={account.id} value={account.id}>
                      {renderAccountLabel(account, index, accounts.length)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[13px] font-medium">使用日期</Label>
              <Input
                type="date"
                value={usedAt}
                onChange={(event) => setUsedAt(event.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label className="text-[13px] font-medium">结果</Label>
              <Select value={resultFlag} onValueChange={(value) => value && setResultFlag(value as "pass" | "fail")}>
                <SelectTrigger className="h-11 w-full rounded-xl">
                  <SelectValue placeholder="测试结果" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pass">通过</SelectItem>
                  <SelectItem value="fail">未通过</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[13px] font-medium">展示</Label>
              <Input
                type="number"
                min={0}
                value={views}
                onChange={(event) => setViews(event.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[13px] font-medium">涨粉</Label>
              <Input
                type="number"
                min={0}
                value={follows}
                onChange={(event) => setFollows(event.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="note" className="text-[13px] font-medium">备注</Label>
            <Textarea id="note" name="note" rows={3} placeholder="补充账号情况、发布时间或审核结果" className="rounded-xl" />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="rounded-lg" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="submit" disabled={isSubmitting} className="rounded-lg bg-[#D97757] text-white hover:bg-[#C96442] active:translate-y-0">
              {isSubmitting ? "提交中..." : "保存记录"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
