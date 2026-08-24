"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCircle2, Search, X, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type RemindLogRow = {
  id: string;
  target_date: string;
  user_id: string;
  user_name: string | null;
  channel: string;
  status: "success" | "failed";
  is_exempted: boolean;
  exempt_reason: string | null;
  sent_at: string;
};

interface RemindLogDialogProps {
  date: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RemindLogDialog({ date, open, onOpenChange }: RemindLogDialogProps) {
  const [logs, setLogs] = useState<RemindLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(
    async (targetPage: number, targetSearch: string) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          date,
          page: String(targetPage),
          pageSize: String(pageSize),
        });
        if (targetSearch.trim()) {
          params.set("search", targetSearch.trim());
        }
        const res = await fetch(`/api/admin/cockpit/remind-logs?${params.toString()}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as {
          data: RemindLogRow[];
          total: number;
          page: number;
          pageSize: number;
        };
        setLogs(json.data ?? []);
        setTotal(json.total ?? 0);
        setPage(json.page ?? 1);
      } catch (e) {
        setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        setLoading(false);
      }
    },
    [date, pageSize],
  );

  useEffect(() => {
    if (!open) return;
    setPage(1);
    setSearch("");
    fetchLogs(1, "");
  }, [open, date, fetchLogs]);

  useEffect(() => {
    if (!open) return;
    const timeout = setTimeout(() => {
      fetchLogs(page, search);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search, page, open, fetchLogs]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl border border-[#E5E0D6] bg-white p-0 shadow-claude-dialog sm:max-w-3xl">
        <DialogHeader className="px-6 pb-2 pt-6">
          <DialogTitle className="text-lg font-semibold tracking-tight text-[#1C1917]">
            催交记录
          </DialogTitle>
          <p className="text-[13px] text-[#78716C]">{date} 的催交历史</p>
        </DialogHeader>

        <div className="space-y-4 px-6 pb-6">
          {/* 搜索 */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 stroke-[1.5] text-[#78716C]" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="搜索成员姓名..."
              className="h-10 w-full rounded-lg border border-[#E5E0D6] bg-white pl-9 pr-4 text-[13px] text-[#1C1917] transition-[border-color,box-shadow] duration-150 placeholder:text-[#78716C] focus:outline-none focus-visible:border-[#78716C] focus-visible:shadow-sm focus-visible:ring-1 focus-visible:ring-[#1C1917]/5"
            />
          </div>

          {loading && logs.length === 0 ? (
            <div className="space-y-2">
              <div className="h-12 rounded-lg bg-[#F5F3EE]" />
              <div className="h-12 rounded-lg bg-[#F5F3EE]" />
              <div className="h-12 rounded-lg bg-[#F5F3EE]" />
            </div>
          ) : error ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-[13px] text-[#C9604D]">
              <XCircle className="size-5" />
              {error}
            </div>
          ) : logs.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-[13px] text-[#78716C]">
              <Bell className="size-5 stroke-[1.5]" />
              暂无催交记录
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-[#ECE7DE] overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead className="bg-transparent">
                    <tr className="border-b border-[#ECE7DE]/60">
                      <th className="px-4 py-2.5 text-[11px] uppercase tracking-wider font-medium text-[#78716C]">成员</th>
                      <th className="px-4 py-2.5 text-[11px] uppercase tracking-wider font-medium text-[#78716C]">日期</th>
                      <th className="px-4 py-2.5 text-[11px] uppercase tracking-wider font-medium text-[#78716C]">方式</th>
                      <th className="px-4 py-2.5 text-[11px] uppercase tracking-wider font-medium text-[#78716C]">状态</th>
                      <th className="px-4 py-2.5 text-[11px] uppercase tracking-wider font-medium text-[#78716C]">豁免</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#ECE7DE]/60">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-[#F5F3EE]/40 transition-colors">
                        <td className="px-4 py-2.5 text-[#1C1917]">
                          {log.user_name ?? "未知成员"}
                        </td>
                        <td className="px-4 py-2.5 tabular-nums text-[#78716C]">
                          {log.target_date}
                        </td>
                        <td className="px-4 py-2.5 text-[#78716C]">
                          {log.channel === "feishu_webhook" ? "飞书" : log.channel}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium",
                              log.status === "success"
                                ? "bg-white text-[#292524]"
                                : "bg-white text-[#292524]",
                            )}
                          >
                            {log.status === "success" ? (
                              <CheckCircle2 className="size-3" />
                            ) : (
                              <X className="size-3" />
                            )}
                            {log.status === "success" ? "成功" : "失败"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          {log.is_exempted ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#D99E55]/10 px-2 py-0.5 text-[12px] font-medium text-[#D99E55]">
                              已豁免
                              {log.exempt_reason ? ` · ${log.exempt_reason}` : ""}
                            </span>
                          ) : (
                            <span className="text-[#78716C]">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 分页 */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-[#78716C]">
                    共 {total} 条，第 {page} / {totalPages} 页
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={page <= 1 || loading}
                      onClick={() => setPage((p) => p - 1)}
                      className="h-8 px-3 text-[12px] text-[#78716C] hover:bg-[#F5F3EE] hover:text-[#1C1917]"
                    >
                      上一页
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={page >= totalPages || loading}
                      onClick={() => setPage((p) => p + 1)}
                      className="h-8 px-3 text-[12px] text-[#78716C] hover:bg-[#F5F3EE] hover:text-[#1C1917]"
                    >
                      下一页
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
