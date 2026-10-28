"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";

type AccountRow = {
  accountId: string;
  accountName: string;
  binding: {
    id: string;
    display_name: string | null;
    status: string;
    access_token_expires_at: string;
    last_sync_at: string | null;
    last_error_summary: string | null;
  } | null;
};

type MetricRow = {
  metric_date: string;
  new_fans: number | null;
  total_fans: number | null;
  new_likes: number | null;
  new_play: number | null;
  profile_uv: number | null;
};

type Notice = {
  text: string;
  tone: "success" | "error";
};

const statusLabels: Record<string, string> = {
  active: "已连接",
  authorizing: "授权中",
  expiring: "即将续签",
  expired: "已过期",
  revoked: "已解除",
  error: "同步异常",
};

const statusDotClass: Record<string, string> = {
  active: "bg-status-success-text",
  authorizing: "bg-status-info",
  expiring: "bg-status-warning-text",
  expired: "bg-status-danger",
  revoked: "bg-ink-signal",
  error: "bg-status-danger",
};

function formatMetric(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toLocaleString("zh-CN");
}

export function DouyinAccountsPage() {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [metrics, setMetrics] = useState<Record<string, MetricRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pendingRevokeId, setPendingRevokeId] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/douyin/accounts", { cache: "no-store" });
    const payload = await response.json() as { data?: AccountRow[]; error?: { message?: string } };
    if (!response.ok) {
      setNotice({ text: payload.error?.message ?? "加载抖音账号失败", tone: "error" });
    } else {
      setAccounts(payload.data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadAccounts(), 0);
    return () => window.clearTimeout(timer);
  }, [loadAccounts]);

  async function authorize(accountId: string) {
    setBusy(accountId);
    setNotice(null);
    const response = await fetch("/api/douyin/authorizations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId }) });
    const payload = await response.json() as { data?: { authorizationUrl?: string }; error?: { message?: string } };
    if (response.ok && payload.data?.authorizationUrl) {
      window.location.assign(payload.data.authorizationUrl);
      return;
    }
    setNotice({ text: payload.error?.message ?? "创建授权失败", tone: "error" });
    setBusy(null);
  }

  async function sync(bindingId: string) {
    setBusy(bindingId);
    setNotice(null);
    const response = await fetch(`/api/douyin/accounts/${bindingId}/sync`, { method: "POST" });
    const payload = await response.json() as { data?: { discoveredCount: number; matchedCount: number; pendingCount: number }; error?: { message?: string } };
    if (response.ok && payload.data) {
      setNotice({
        text: `同步完成：发现 ${payload.data.discoveredCount} 条，已关联 ${payload.data.matchedCount} 条，待确认 ${payload.data.pendingCount} 条`,
        tone: "success",
      });
      await loadAccounts();
      await loadMetrics(bindingId);
    } else {
      setNotice({ text: payload.error?.message ?? "同步失败", tone: "error" });
    }
    setBusy(null);
  }

  async function confirmRevoke() {
    if (!pendingRevokeId) return;
    const bindingId = pendingRevokeId;
    setBusy(bindingId);
    const response = await fetch(`/api/douyin/accounts/${bindingId}`, { method: "DELETE" });
    if (!response.ok) setNotice({ text: "解除绑定失败", tone: "error" });
    setPendingRevokeId(null);
    await loadAccounts();
    setBusy(null);
  }

  async function loadMetrics(bindingId: string) {
    const response = await fetch(`/api/douyin/accounts/${bindingId}/metrics?days=30`, { cache: "no-store" });
    const payload = await response.json() as { data?: MetricRow[] };
    if (response.ok) setMetrics((current) => ({ ...current, [bindingId]: payload.data ?? [] }));
  }

  return (
    <div className="space-y-5">
      {notice ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-[#E2E2DF]/60 bg-[#F1F1F0] px-3.5 py-2.5 text-[12px] leading-relaxed text-[#1F1E1D]"
        >
          <span className={`size-1.5 shrink-0 rounded-full ${notice.tone === "success" ? "bg-status-success-text" : "bg-status-danger"}`} />
          <span>{notice.text}</span>
        </div>
      ) : null}
      {loading ? (
        <div className="space-y-3" role="status" aria-label="正在加载账号">
          <div className="h-3 w-24 animate-pulse rounded-full bg-[#F1F1F0]" />
          <div className="grid gap-4 md:grid-cols-2">
            {[0, 1].map((index) => (
              <div key={index} className="h-[132px] animate-pulse rounded-xl bg-[#F1F1F0]/70" />
            ))}
          </div>
        </div>
      ) : null}
      {!loading && accounts.length === 0 ? (
        <EmptyState
          className="rounded-xl border border-dashed border-[#E2E2DF] bg-[#FCFCFB]/50 p-6"
          title="当前没有可绑定的业务账号"
          description="请联系管理员开通业务账号后再绑定"
        />
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        {accounts.map((account) => {
          const binding = account.binding;
          const rows = binding ? metrics[binding.id] ?? [] : [];
          const latest = rows.at(-1);
          const trendMetrics = [
            { label: "最新粉丝", value: latest?.total_fans },
            { label: "最新涨粉", value: latest?.new_fans },
            { label: "最新点赞", value: latest?.new_likes },
            { label: "主页访问", value: latest?.profile_uv },
          ];
          return (
            <section key={account.accountId} className="space-y-4 rounded-xl border border-[#E2E2DF]/60 bg-white p-4 sm:p-5 shadow-card-ring">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-[14px] font-normal text-[#141413]">{account.accountName}</h2>
                  <p className="mt-1 text-[12px] text-[#78716C]">{binding?.display_name ?? "尚未绑定抖音号"}</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#E2E2DF] bg-[#F1F1F0] px-2.5 py-1 text-[12px] text-[#78716C]">
                  <span className={`size-1.5 rounded-full ${statusDotClass[binding?.status ?? ""] ?? "bg-[#A8A29E]"}`} />
                  {binding ? statusLabels[binding.status] ?? binding.status : "未绑定"}
                </span>
              </div>
              {binding ? (
                <>
                  <p className="text-[12px] text-[#78716C] tabular-nums">下次续签时间：{new Date(binding.access_token_expires_at).toLocaleDateString("zh-CN")}{binding.last_sync_at ? ` · 最近同步 ${new Date(binding.last_sync_at).toLocaleString("zh-CN")}` : ""}</p>
                  {binding.last_error_summary ? (
                    <p className="inline-flex items-start gap-1 rounded-md bg-status-danger-bg px-2.5 py-1.5 text-[12px] leading-relaxed text-status-danger-text">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-status-danger" />
                      <span>{binding.last_error_summary}</span>
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="m" disabled={busy === binding.id} onClick={() => void sync(binding.id)}>立即同步</Button>
                    <Button type="button" variant="secondary" size="m" disabled={busy === binding.id} onClick={() => void authorize(account.accountId)}>重新授权</Button>
                    <Button type="button" variant="destructive" size="m" disabled={busy === binding.id} onClick={() => setPendingRevokeId(binding.id)}>解除绑定</Button>
                  </div>
                  <div className="border-t border-[#E2E2DF]/60 pt-3">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-[14px] text-[#141413]">近 30 天账号趋势</h3>
                      <button type="button" className="text-[12px] text-[#78716C] hover:text-[#141413] underline underline-offset-2 cursor-pointer" onClick={() => void loadMetrics(binding.id)}>刷新</button>
                    </div>
                    {rows.length === 0 ? (
                      <p className="text-[12px] text-[#78716C]">同步后显示趋势数据；抖音官方数据可能次日才完整。</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {trendMetrics.map((metric) => (
                          <div key={metric.label} className="rounded-md bg-[#F1F1F0]/70 px-2.5 py-1.5">
                            <span className="block text-[12px] leading-tight text-[#78716C]">{metric.label}</span>
                            <span className="mt-0.5 block text-[14px] leading-tight text-[#141413] tabular-nums">{formatMetric(metric.value)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <Button type="button" size="m" className="w-full" disabled={busy === account.accountId} onClick={() => void authorize(account.accountId)}>绑定抖音账号</Button>
              )}
            </section>
          );
        })}
      </div>
      <ConfirmDialog
        open={pendingRevokeId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRevokeId(null);
        }}
        title="确认解除绑定？"
        description="解除后会停止自动同步，但不会删除历史作品和数据。"
        confirmText={busy === pendingRevokeId ? "正在解除..." : "确认解除"}
        onConfirm={confirmRevoke}
        destructive
      />
    </div>
  );
}
