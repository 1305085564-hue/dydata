"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

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
  待查看: "border-sky-200 bg-sky-50 text-sky-700",
  已查看: "border-slate-200 bg-slate-100 text-slate-600",
  待执行: "border-amber-200 bg-amber-50 text-amber-700",
  已执行: "border-emerald-200 bg-emerald-50 text-emerald-700",
  已忽略: "border-slate-200 bg-slate-50 text-slate-500",
  已复核: "border-violet-200 bg-violet-50 text-violet-700",
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
        toast.success(`已生成 ${result.diagnosed} 条建议${failedCount ? `，失败 ${failedCount} 条` : ""}`);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "批量生成失败");
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "待查看", value: stats.待查看, tone: "border-sky-200 bg-sky-50/80 text-sky-700" },
          { label: "待执行", value: stats.待执行, tone: "border-amber-200 bg-amber-50/80 text-amber-700" },
          { label: "已执行", value: stats.已执行, tone: "border-emerald-200 bg-emerald-50/80 text-emerald-700" },
          { label: "已复核", value: stats.已复核, tone: "border-violet-200 bg-violet-50/80 text-violet-700" },
        ].map((card) => (
          <div key={card.label} className={`rounded-[28px] border p-5 shadow-sm ring-1 ring-foreground/5 backdrop-blur-xl ${card.tone}`}>
            <div className="text-sm font-medium">{card.label}</div>
            <div className="mt-3 text-3xl font-semibold tracking-tight">{card.value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-[28px] border border-border/60 bg-background/80 p-4 shadow-sm ring-1 ring-foreground/5 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-medium text-foreground">建议池</div>
          <div className="text-xs text-muted-foreground">当前共 {filteredRows.length} 条建议</div>
        </div>
        <Button onClick={handleGenerateBatch} disabled={isBatchRunning} className="h-11 rounded-2xl px-5">
          {isBatchRunning ? "生成中..." : "一键生成建议"}
        </Button>
      </div>

      <AdviceFilters profiles={profiles} accounts={accounts} onFilter={setFilters} />

      <div className="overflow-x-auto rounded-[28px] border border-border/60 bg-background/80 shadow-sm ring-1 ring-foreground/5 backdrop-blur-xl">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-4">目标员工</TableHead>
              <TableHead>账号</TableHead>
              <TableHead>建议摘要</TableHead>
              <TableHead>来源</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead className="px-4 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.length ? (
              filteredRows.map((item) => {
                const targetProfile = pickSingle(item.target_profile);
                const targetAccount = pickSingle(item.target_account);

                return (
                  <TableRow key={item.id}>
                    <TableCell className="px-4 font-medium">{targetProfile?.name || "-"}</TableCell>
                    <TableCell>{targetAccount?.name || "-"}</TableCell>
                    <TableCell className="max-w-[360px] whitespace-normal align-top">
                      <div className="space-y-1">
                        <div className="line-clamp-2 font-medium text-foreground">{buildSummary(item.advice_content)}</div>
                        <div className="text-xs text-muted-foreground">{item.id.slice(0, 8)}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="border-border/60 bg-muted/40 text-foreground">
                        {SOURCE_LABELS[item.advice_source]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_STYLES[item.status]}>
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDateTime(item.created_at)}</TableCell>
                    <TableCell className="px-4 text-right">
                      <Button variant="outline" className="rounded-2xl bg-muted/40" onClick={() => setSelectedAdviceId(item.id)}>
                        查看详情
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="px-4 py-16 text-center text-sm text-muted-foreground">
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
