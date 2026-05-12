"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { feedbackToast } from "@/components/ui/feedback-toast";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AdviceAction, AdviceSource, AdviceStatus, Profile } from "@/types";

import { AdviceDetailDialog } from "./advice-detail-dialog";
import { AdviceFilters, type AdviceFilterValue } from "./advice-filters";
import type { AdviceRow } from "./page";

type FilterOption = Pick<Profile, "id" | "name">;
type AccountOption = { id: string; name: string };

interface AdviceListProps {
  advice: AdviceRow[];
  profiles: FilterOption[];
  accounts: AccountOption[];
  currentUserId: string;
}

const INITIAL_FILTERS: AdviceFilterValue = {
  profileId: "all",
  accountId: "all",
  status: "all",
  source: "all",
  startDate: "",
  endDate: "",
};

const STATUS_STYLES: Record<AdviceStatus, string> = {
  待查看: "border-zinc-200 bg-zinc-100 text-zinc-700",
  已查看: "border-zinc-200 bg-zinc-100 text-zinc-600",
  待执行: "border-zinc-200 bg-[#D99E55]/10 text-[#D99E55]",
  已执行: "border-zinc-200 bg-[#6FAA7D]/10 text-[#6FAA7D]",
  已忽略: "border-zinc-200 bg-zinc-50 text-zinc-500",
  已复核: "border-zinc-200 bg-zinc-100 text-zinc-700",
};

const SOURCE_LABELS: Record<AdviceSource, string> = {
  ai: "AI",
  manager: "管理员",
};

function pickSingle<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function formatDateTime(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function buildSummary(content: string) {
  const firstLine = content.split("\n").find((line) => line.trim());
  const summary = (firstLine || content).trim();
  return summary.length > 34 ? `${summary.slice(0, 34)}…` : summary;
}

function matchesDateRange(item: AdviceAction, filters: AdviceFilterValue) {
  const createdDate = item.created_at ? item.created_at.slice(0, 10) : "";
  if (filters.startDate && (!createdDate || createdDate < filters.startDate)) return false;
  if (filters.endDate && (!createdDate || createdDate > filters.endDate)) return false;
  return true;
}

export function AdviceList({ advice, profiles, accounts, currentUserId }: AdviceListProps) {
  const router = useRouter();
  const [filters, setFilters] = useState<AdviceFilterValue>(INITIAL_FILTERS);
  const [rows, setRows] = useState(advice);
  const [selectedAdviceId, setSelectedAdviceId] = useState<string | null>(null);
  const [isBatchRunning, startBatchRun] = useTransition();

  const filteredRows = useMemo(() => {
    return rows.filter((item) => {
      if (filters.profileId !== "all" && item.target_user_id !== filters.profileId) return false;
      if (filters.accountId !== "all" && item.target_account_id !== filters.accountId) return false;
      if (filters.status !== "all" && item.status !== filters.status) return false;
      if (filters.source !== "all" && item.advice_source !== filters.source) return false;
      return matchesDateRange(item, filters);
    });
  }, [filters, rows]);

  const stats = useMemo(() => {
    return {
      待查看: filteredRows.filter((item) => item.status === "待查看").length,
      待执行: filteredRows.filter((item) => item.status === "待执行").length,
      已执行: filteredRows.filter((item) => item.status === "已执行").length,
      已复核: filteredRows.filter((item) => item.status === "已复核").length,
    };
  }, [filteredRows]);

  const selectedAdvice = useMemo(
    () => filteredRows.find((item) => item.id === selectedAdviceId) ?? rows.find((item) => item.id === selectedAdviceId) ?? null,
    [filteredRows, rows, selectedAdviceId]
  );

  function handleAdviceUpdated(updated: AdviceRow) {
    setRows((current) => current.map((item) => (item.id === updated.id ? updated : item)));
  }

  function handleGenerateBatch() {
    startBatchRun(async () => {
      try {
        const body = {
          user_id: filters.profileId !== "all" ? filters.profileId : undefined,
          account_id: filters.accountId !== "all" ? filters.accountId : undefined,
          days: 7,
          limit: 20,
        };

        const response = await fetch("/api/video-diagnose/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || "批量生成失败");
        }

        const failedCount = Array.isArray(result.failed) ? result.failed.length : 0;
        feedbackToast.success(`已生成 ${result.diagnosed} 条建议${failedCount ? `，失败 ${failedCount} 条` : ""}`);
        router.refresh();
      } catch (error) {
        feedbackToast.error(error instanceof Error ? error.message : "批量生成失败");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-4 text-[12px] text-zinc-500">
          <span>共 {filteredRows.length} 条</span>
          <span>待查看 {stats.待查看}</span>
          <span>待执行 {stats.待执行}</span>
          <span>已执行 {stats.已执行}</span>
          <span>已复核 {stats.已复核}</span>
        </div>
        <Button
          onClick={handleGenerateBatch}
          disabled={isBatchRunning}
          className="h-9 rounded-xl bg-zinc-900 px-4 text-[13px] text-white hover:bg-zinc-800"
        >
          {isBatchRunning ? "生成中..." : "一键生成建议"}
        </Button>
      </div>

      <AdviceFilters profiles={profiles} accounts={accounts} onFilter={setFilters} />

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-9 px-4 text-[12px] font-medium text-zinc-500">目标员工</TableHead>
              <TableHead className="h-9 text-[12px] font-medium text-zinc-500">账号</TableHead>
              <TableHead className="h-9 text-[12px] font-medium text-zinc-500">建议摘要</TableHead>
              <TableHead className="h-9 text-[12px] font-medium text-zinc-500">来源</TableHead>
              <TableHead className="h-9 text-[12px] font-medium text-zinc-500">状态</TableHead>
              <TableHead className="h-9 text-[12px] font-medium text-zinc-500">创建时间</TableHead>
              <TableHead className="h-9 px-4 text-right text-[12px] font-medium text-zinc-500">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.length ? (
              filteredRows.map((item) => {
                const targetProfile = pickSingle(item.target_profile);
                const targetAccount = pickSingle(item.target_account);

                return (
                  <TableRow key={item.id} className="h-10">
                    <TableCell className="px-4 text-[13px] font-medium text-zinc-800">{targetProfile?.name || "-"}</TableCell>
                    <TableCell className="text-[13px] text-zinc-600">{targetAccount?.name || "-"}</TableCell>
                    <TableCell className="max-w-[360px] whitespace-normal align-top">
                      <div className="line-clamp-2 text-[13px] text-zinc-700">{buildSummary(item.advice_content)}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="border-zinc-200 bg-zinc-50 text-[12px] text-zinc-600">
                        {SOURCE_LABELS[item.advice_source]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[12px] ${STATUS_STYLES[item.status]}`}>
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[12px] text-zinc-500">{formatDateTime(item.created_at)}</TableCell>
                    <TableCell className="px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedAdviceId(item.id)}
                        className="text-[12px] text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline"
                      >
                        查看详情
                      </button>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="px-4 py-16 text-center text-[13px] text-zinc-500">
                  当前筛选条件下暂无建议数据。
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <AdviceDetailDialog
        advice={selectedAdvice}
        currentUserId={currentUserId}
        open={selectedAdvice !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedAdviceId(null);
          }
        }}
        onUpdated={handleAdviceUpdated}
      />
    </div>
  );
}
