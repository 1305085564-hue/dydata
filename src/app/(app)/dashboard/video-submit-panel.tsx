"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Video } from "@/types";
import { VideoSubmitForm } from "./video-submit-form";

interface VideoSubmitPanelProps {
  accounts: { id: string; name: string; content_direction: string | null }[];
  userId: string;
  today: string;
}

export function VideoSubmitPanel({ accounts, userId, today }: VideoSubmitPanelProps) {
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id ?? "");
  const [submittedAccountIds, setSubmittedAccountIds] = useState<string[]>([]);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) ?? accounts[0] ?? null,
    [accounts, selectedAccountId]
  );

  function handleSubmitted(video: Video) {
    setSubmittedAccountIds((current) =>
      current.includes(video.account_id) ? current : [...current, video.account_id]
    );
  }

  if (!accounts.length) {
    return (
      <Card className="overflow-hidden rounded-3xl border-orange-200 bg-orange-50/80 shadow-sm backdrop-blur-sm">
        <CardContent className="px-6 py-5 text-sm text-orange-700">
          当前暂无可提交的视频账号，请联系管理员分配账号后再提交。
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
      className="space-y-5"
    >
      <Card className="overflow-hidden rounded-3xl border-border/60 bg-background/85 shadow-sm backdrop-blur-md">
        <CardHeader className="space-y-4 pb-4">
          <div className="space-y-1">
            <CardTitle className="text-xl font-semibold tracking-tight">视频提交</CardTitle>
            <p className="text-sm text-muted-foreground">
              选择账号后提交视频 24h 数据，系统会同时补写日报兼容记录。
            </p>
          </div>

          {accounts.length > 1 ? (
            <div className="space-y-2">
              <Label htmlFor="video-account-select">提交账号</Label>
              <Select value={selectedAccountId} onValueChange={(v) => v && setSelectedAccountId(v)}>
                <SelectTrigger
                  id="video-account-select"
                  className="h-11 rounded-2xl bg-muted/40"
                >
                  <SelectValue placeholder="请选择账号" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {accounts.map((account) => {
              const isSelected = account.id === (selectedAccount?.id ?? "");
              const isSubmitted = submittedAccountIds.includes(account.id);

              return (
                <div
                  key={account.id}
                  className={[
                    "rounded-2xl border px-4 py-3 transition-colors",
                    isSelected
                      ? "border-primary/30 bg-primary/5"
                      : "border-border/60 bg-muted/20",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-sm font-medium text-foreground">{account.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {account.content_direction?.trim() || "未设置内容方向"}
                      </div>
                    </div>
                    <Badge
                      variant={isSubmitted ? "default" : "secondary"}
                      className={isSubmitted ? "bg-emerald-600 text-white" : ""}
                    >
                      {isSubmitted ? "今日已提交" : "今日未提交"}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>

          {selectedAccount ? (
            <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              当前账号：
              <span className="font-medium text-foreground">{selectedAccount.name}</span>
              <span className="mx-2 text-border">×</span>
              日期：
              <span className="font-medium text-foreground">{today}</span>
              <span className="mx-2 text-border">×</span>
              状态：
              <span className={submittedAccountIds.includes(selectedAccount.id) ? "text-emerald-600" : "text-orange-600"}>
                {submittedAccountIds.includes(selectedAccount.id) ? "已提交" : "待提交"}
              </span>
            </div>
          ) : null}

          <VideoSubmitForm
            account={selectedAccount}
            userId={userId}
            today={today}
            onSubmitted={handleSubmitted}
          />
        </CardContent>
      </Card>
    </motion.div>
  );
}
