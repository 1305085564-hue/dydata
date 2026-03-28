"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import ActionDetailDrawer from "./action-detail-drawer";

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
    return "操作历史暂不可用，后台审计表还没初始化";
  }
  return errorMessage;
}

function resultLabel(result: string) {
  switch (result) {
    case "success":
      return { label: "成功", variant: "default" as const };
    case "failed":
      return { label: "失败", variant: "destructive" as const };
    case "cancelled":
      return { label: "已取消", variant: "outline" as const };
    case "pending_confirm":
      return { label: "待确认", variant: "secondary" as const };
    default:
      return { label: result, variant: "outline" as const };
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
    <div className="flex h-full flex-col">
      <div className="border-b p-4">
        <h2 className="mb-3 font-semibold">操作历史</h2>
        <div className="flex flex-wrap gap-2 text-xs">
          {FILTERS.map((item) => (
            <Button
              key={item.value}
              size="sm"
              variant={filter === item.value ? "default" : "outline"}
              onClick={() => onChangeFilter(item.value)}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            正在加载历史...
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
            <div className="text-sm text-muted-foreground">{error}</div>
            <Button size="sm" variant="outline" onClick={onRetry}>
              重试
            </Button>
          </div>
        ) : records.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
            还没有操作历史。先发一条指令，执行记录会出现在这里。
          </div>
        ) : (
          <div className="space-y-2">
            {records.map((record) => {
              const badge = resultLabel(record.result);
              return (
                <button
                  key={record.id}
                  onClick={() => onSelect(record.id)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted ${
                    selectedId === record.id ? "border-primary bg-muted" : "border-transparent"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{record.description}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {record.adminName} · {new Date(record.createdAt).toLocaleString("zh-CN")}
                      </div>
                    </div>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </div>
                </button>
              );
            })}
            {canLoadMore ? (
              <Button variant="outline" className="w-full" onClick={onLoadMore} disabled={loadingMore}>
                {loadingMore ? "加载中..." : `加载更多（已显示 ${records.length}/${total}）`}
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

export default function HistorySidebar({
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
          throw new Error(data.error || "历史加载失败");
        }

        setRecords((prev) => (append ? [...prev, ...(data.actions || [])] : data.actions || []));
        setTotal(data.total || 0);
        setHasShownErrorToast(false);
      } catch (fetchError) {
        const rawMessage = fetchError instanceof Error ? fetchError.message : "历史加载失败";
        const errorMessage = getHistoryErrorMessage(rawMessage);
        setError(errorMessage);
        if (!hasShownErrorToast) {
          toast.error(errorMessage);
          setHasShownErrorToast(true);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filter, hasShownErrorToast, records.length]
  );

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory, refreshKey]);

  useEffect(() => {
    setSelectedId(null);
  }, [filter]);

  if (mobile) {
    return (
      <>
        <Dialog open={mobileOpen} onOpenChange={onMobileOpenChange}>
          <DialogContent
            showCloseButton={false}
            className="left-auto right-0 top-0 flex h-full w-full max-w-sm translate-x-0 translate-y-0 flex-col rounded-none border-l p-0 data-open:slide-in-from-right-[20px] data-closed:slide-out-to-right-[20px]"
          >
            <DialogHeader className="border-b px-4 py-3">
              <DialogTitle>操作历史</DialogTitle>
            </DialogHeader>
            <div className="min-h-0 flex-1">
              <SidebarContent
                loading={loading}
                records={records}
                filter={filter}
                total={total}
                selectedId={selectedId}
                loadingMore={loadingMore}
                error={error}
                onChangeFilter={(value) => setFilter(value)}
                onSelect={setSelectedId}
                onRetry={() => void fetchHistory()}
                onLoadMore={() => void fetchHistory({ append: true })}
              />
            </div>
          </DialogContent>
        </Dialog>

        <ActionDetailDrawer
          actionId={selectedId}
          open={!!selectedId}
          onClose={() => setSelectedId(null)}
        />
      </>
    );
  }

  return (
    <>
      <div className="h-full">
        <SidebarContent
          loading={loading}
          records={records}
          filter={filter}
          total={total}
          selectedId={selectedId}
          loadingMore={loadingMore}
          error={error}
          onChangeFilter={(value) => setFilter(value)}
          onSelect={setSelectedId}
          onRetry={() => void fetchHistory()}
          onLoadMore={() => void fetchHistory({ append: true })}
        />
      </div>

      <ActionDetailDrawer
        actionId={selectedId}
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
      />
    </>
  );
}
