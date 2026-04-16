"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Search, X } from "lucide-react";
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

function resultLabel(result: string) {
  switch (result) {
    case "success":
      return { label: "成功", color: "text-primary", border: "border-primary/30", bg: "bg-primary/10" };
    case "failed":
      return { label: "失败", color: "text-destructive", border: "border-destructive/30", bg: "bg-destructive/10" };
    case "cancelled":
      return { label: "中止", color: "text-muted-foreground", border: "border-border", bg: "bg-muted/50" };
    case "pending_confirm":
      return { label: "待确认", color: "text-amber-500", border: "border-amber-900", bg: "bg-amber-950/30" };
    default:
      return { label: result.substring(0,4).toUpperCase(), color: "text-muted-foreground", border: "border-border", bg: "bg-muted/50" };
  }
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
    <div className="flex h-full flex-col  text-sm antialiased">
      <div className="border-b border-border p-3 space-y-3 shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input 
            type="text" 
            placeholder="搜索记录..." 
            className="w-full w-full bg-background/50 border border-border rounded-md py-1.5 pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              onClick={() => onChangeFilter(item.value)}
              className={cn(
                "px-2 py-0.5 text-[10px] font-semibold tracking-wider rounded-sm transition-all border",
                filter === item.value 
                  ? "bg-primary text-primary-foreground border-primary" 
                  : "bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 custom-scrollbar relative">
        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-xs text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span>同步记录中...</span>
          </div>
        ) : error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center">
            <div className="text-xs text-destructive">{error}</div>
            <button 
              onClick={onRetry}
              className="px-3 py-1 text-xs border border-border text-foreground hover:bg-muted rounded-sm transition-colors"
            >
              重新同步
            </button>
          </div>
        ) : records.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-muted-foreground uppercase tracking-widest">
            暂无记录
          </div>
        ) : (
          <div className="space-y-1">
            {records.map((record) => {
              const badge = resultLabel(record.result);
              return (
                <button
                  key={record.id}
                  onClick={() => onSelect(record.id)}
                  className={cn(
                    "w-full text-left p-2 transition-all border-l-2 relative group",
                    selectedId === record.id 
                      ? "bg-muted border-primary" 
                      : "bg-transparent border-transparent hover:bg-muted/50 hover:border-border"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs text-foreground font-medium group-hover:text-primary transition-colors">{record.description}</div>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="text-muted-foreground">{record.adminName.substring(0, 8)}</span>
                        <span>{new Date(record.createdAt).toLocaleTimeString("en-GB", { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}</span>
                      </div>
                    </div>
                    <div className={cn(
                      "px-1.5 py-0.5 text-[9px] font-bold rounded-sm border shrink-0 uppercase tracking-wider",
                      badge.color, badge.border, badge.bg
                    )}>
                      {badge.label}
                    </div>
                  </div>
                </button>
              );
            })}
            {canLoadMore && (
              <button 
                onClick={onLoadMore} 
                disabled={loadingMore}
                className="w-full mt-2 py-2 text-xs border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors rounded-sm uppercase tracking-widest flex items-center justify-center gap-2"
              >
                {loadingMore ? (
                  <><Loader2 className="h-3 w-3 animate-spin" /> 加载中...</>
                ) : (
                  `加载更多 [${records.length}/${total}]`
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
  const [records, setRecords] = useState<ActionRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ActionType>("all");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [hasShownErrorToast, setHasShownErrorToast] = useState(false);

  const fetchHistory = useCallback(
    async (options?: { append?: boolean }) => {
      const append = options?.append ?? false;
      const nextOffset = append ? records.length : 0;

      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: String(nextOffset),
        });
        if (filter !== "all") {
          params.set("actionType", filter);
        }

        const res = await fetch(`/api/admin/ai-assistant/history?${params.toString()}`);
        const data = await res.json();

        if (!res.ok || data.error) {
          throw new Error(data.error || "Failed to fetch logs");
        }

        setRecords((prev) => (append ? [...prev, ...(data.actions || [])] : data.actions || []));
        setTotal(data.total || 0);
      } catch (err) {
        const rawMessage = err instanceof Error ? err.message : "Fetch error";
        const message = getHistoryErrorMessage(rawMessage);
        setError(message);
        if (!hasShownErrorToast) {
          toast.error(`LOG_SYS_ERR: ${message}`);
          setHasShownErrorToast(true);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
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
        <DialogContent className="h-[85vh] w-full max-w-md p-0 flex flex-col bg-background/95 backdrop-blur-xl border-border rounded-md overflow-hidden text-foreground ">
          <DialogHeader className="px-4 py-3 border-b border-border bg-background/80 shrink-0 flex flex-row items-center justify-between">
            <DialogTitle className="text-sm font-semibold uppercase tracking-wider text-foreground">历史记录</DialogTitle>
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
