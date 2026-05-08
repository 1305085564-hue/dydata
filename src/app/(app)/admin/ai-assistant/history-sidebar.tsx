"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Search } from "lucide-react";
import ActionDetailDrawer from "./action-detail-drawer";
import { cn } from "@/lib/utils";

type ActionType = "all" | "query" | "modify" | "delete" | "retry_task" | "config_change" | "diagnosis";

type ActionRecord = {
  id: string;
  adminName: string;
  actionType: Exclude<ActionType, "all">;
  description: string;
  result: string;
  createdAt: string;
};

type HistorySidebarProps = {
  actorRole: "admin" | "owner";
  refreshKey: number;
  mobile?: boolean;
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
};

const PAGE_SIZE = 20;
const FILTERS: Array<{ value: ActionType; label: string }> = [
  { value: "all", label: "全部" },
  { value: "query", label: "查询" },
  { value: "modify", label: "修改" },
  { value: "delete", label: "删除" },
  { value: "retry_task", label: "重试" },
  { value: "config_change", label: "配置" },
  { value: "diagnosis", label: "诊断" },
];

export function getHistoryErrorMessage(errorMessage: string) {
  if (errorMessage.includes("public.admin_actions") && errorMessage.includes("schema cache")) {
    return "Audit logs unavailable (schema missing)";
  }
  return errorMessage;
}

function dotColor(result: string) {
  switch (result) {
    case "success":
      return "bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.12)]";
    case "failed":
      return "bg-red-500 shadow-[0_0_0_3px_rgba(239,68,68,0.12)]";
    case "cancelled":
      return "bg-zinc-300";
    case "pending_confirm":
      return "bg-amber-500 shadow-[0_0_0_3px_rgba(234,179,8,0.12)] animate-pulse";
    default:
      return "bg-zinc-300";
  }
}

function timeLabel(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

function SidebarContent({
  loading,
  records,
  filter,
  total,
  selectedId,
  loadingMore,
  error,
  onChangeFilter,
  onSelect,
  onRetry,
  onLoadMore,
}: {
  loading: boolean;
  records: ActionRecord[];
  filter: ActionType;
  total: number;
  selectedId: string | null;
  loadingMore: boolean;
  error: string | null;
  onChangeFilter: (value: ActionType) => void;
  onSelect: (id: string) => void;
  onRetry: () => void;
  onLoadMore: () => void;
}) {
  const canLoadMore = records.length < total;

  return (
    <div className="flex h-full flex-col">
      {/* Header — Claude style */}
      <div className="shrink-0 px-3 pt-3 pb-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-[9px] font-semibold uppercase tracking-[0.25em] text-zinc-400">
            History
          </span>
          <span className="text-[10px] tabular-nums text-zinc-400">{total}</span>
        </div>
      </div>

      {/* Filter chips */}
      <div className="shrink-0 px-3 pb-2.5">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              onClick={() => onChangeFilter(item.value)}
              className={cn(
                "rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                filter === item.value
                  ? "bg-[#D97757] text-white"
                  : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Records */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-2">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-[11px] text-zinc-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
            <span className="tracking-wide">同步中</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
            <Search className="h-3.5 w-3.5 text-zinc-300" />
            <div className="text-[11px] text-zinc-500">{error}</div>
            <button
              onClick={onRetry}
              className="mt-1 rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-900"
            >
              重新同步
            </button>
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1.5 px-4 py-10 text-center">
            <span className="inline-flex h-1 w-1 rounded-full bg-zinc-300" />
            <div className="text-[11px] italic tracking-wide text-zinc-400">暂无记录</div>
          </div>
        ) : (
          <div className="space-y-px">
            {records.map((record) => {
              const selected = selectedId === record.id;
              return (
                <button
                  key={record.id}
                  onClick={() => onSelect(record.id)}
                  className={cn(
                    "group w-full rounded-lg px-2 py-1.5 text-left transition-colors",
                    selected
                      ? "bg-white shadow-[0_1px_0_rgba(0,0,0,0.04)] ring-1 ring-zinc-200"
                      : "hover:bg-white/60"
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={cn("h-1 w-1 shrink-0 rounded-full", dotColor(record.result))} />
                    <span
                      className={cn(
                        "flex-1 truncate text-[11.5px] leading-tight tracking-tight",
                        selected ? "font-semibold text-zinc-950" : "font-medium text-zinc-700 group-hover:text-zinc-950"
                      )}
                    >
                      {record.description}
                    </span>
                    <span className="shrink-0 text-[9px] tabular-nums text-zinc-400">
                      {timeLabel(record.createdAt)}
                    </span>
                  </div>
                </button>
              );
            })}

            {canLoadMore && (
              <button
                onClick={onLoadMore}
                disabled={loadingMore}
                className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] text-zinc-400 transition-colors hover:bg-white/60 hover:text-zinc-700 disabled:opacity-50"
              >
                {loadingMore ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <span className="tracking-[0.2em] uppercase">Load more</span>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function HistorySidebar({
  actorRole,
  refreshKey,
  mobile = false,
  mobileOpen = false,
  onMobileOpenChange,
}: HistorySidebarProps) {
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [records, setRecords] = useState<ActionRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<ActionType>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasShownErrorToast, setHasShownErrorToast] = useState(false);

  const fetchHistory = useCallback(
    async ({ append }: { append?: boolean } = {}) => {
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError(null);
        setHasShownErrorToast(false);
      }

      try {
        const params = new URLSearchParams();
        if (filter !== "all") params.set("actionType", filter);
        params.set("limit", String(PAGE_SIZE));
        if (append) params.set("offset", String(records.length));

        const response = await fetch(`/api/admin/ai-assistant/history?${params.toString()}`);
        const data = await response.json();

        if (!response.ok || data.error) {
          throw new Error(data.error || "获取历史失败");
        }

        const rows = (data.records || []) as ActionRecord[];
        setRecords((prev) => (append ? [...prev, ...rows] : rows));
        setTotal(data.total || 0);
      } catch (err) {
        const raw = err instanceof Error ? err.message : "获取历史失败";
        const friendly = getHistoryErrorMessage(raw);
        setError(friendly);
        if (!hasShownErrorToast && !append) {
          toast.error(friendly);
          setHasShownErrorToast(true);
        }
      } finally {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    },
    [filter, records.length, hasShownErrorToast]
  );

  useEffect(() => {
    fetchHistory();
  }, [filter, refreshKey]);

  if (mobile) {
    return (
      <Dialog open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <DialogContent className="h-[85vh] w-full max-w-md p-0 flex flex-col bg-[#F9F9FB] border border-zinc-200 rounded-2xl shadow-lg overflow-hidden">
          <DialogHeader className="px-4 py-3 border-b border-zinc-200 bg-white shrink-0 flex flex-row items-center justify-between">
            <DialogTitle className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
              操作历史
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            <SidebarContent
              loading={loading}
              records={records}
              filter={filter}
              total={total}
              selectedId={selectedId}
              loadingMore={loadingMore}
              error={error}
              onChangeFilter={setFilter}
              onSelect={setSelectedId}
              onRetry={() => fetchHistory()}
              onLoadMore={() => fetchHistory({ append: true })}
            />
          </div>
        </DialogContent>
        {selectedId && (
          <ActionDetailDrawer
            id={selectedId}
            actorRole={actorRole}
            onClose={() => setSelectedId(null)}
          />
        )}
      </Dialog>
    );
  }

  return (
    <>
      <SidebarContent
        loading={loading}
        records={records}
        filter={filter}
        total={total}
        selectedId={selectedId}
        loadingMore={loadingMore}
        error={error}
        onChangeFilter={setFilter}
        onSelect={setSelectedId}
        onRetry={() => fetchHistory()}
        onLoadMore={() => fetchHistory({ append: true })}
      />
      {selectedId && (
        <ActionDetailDrawer
          id={selectedId}
          actorRole={actorRole}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  );
}
