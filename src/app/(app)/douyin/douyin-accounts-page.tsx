"use client";

import { useCallback, useEffect, useState } from "react";

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

const statusLabels: Record<string, string> = {
  active: "已连接",
  authorizing: "授权中",
  expiring: "即将续签",
  expired: "已过期",
  revoked: "已解除",
  error: "同步异常",
};

export function DouyinAccountsPage() {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [metrics, setMetrics] = useState<Record<string, MetricRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/douyin/accounts", { cache: "no-store" });
    const payload = await response.json() as { data?: AccountRow[]; error?: { message?: string } };
    if (!response.ok) {
      setMessage(payload.error?.message ?? "加载抖音账号失败");
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
    setMessage(null);
    const response = await fetch("/api/douyin/authorizations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId }) });
    const payload = await response.json() as { data?: { authorizationUrl?: string }; error?: { message?: string } };
    if (response.ok && payload.data?.authorizationUrl) {
      window.location.assign(payload.data.authorizationUrl);
      return;
    }
    setMessage(payload.error?.message ?? "创建授权失败");
    setBusy(null);
  }

  async function sync(bindingId: string) {
    setBusy(bindingId);
    setMessage(null);
    const response = await fetch(`/api/douyin/accounts/${bindingId}/sync`, { method: "POST" });
    const payload = await response.json() as { data?: { discoveredCount: number; matchedCount: number; pendingCount: number }; error?: { message?: string } };
    if (response.ok && payload.data) {
      setMessage(`同步完成：发现 ${payload.data.discoveredCount} 条，已关联 ${payload.data.matchedCount} 条，待确认 ${payload.data.pendingCount} 条`);
      await loadAccounts();
      await loadMetrics(bindingId);
    } else {
      setMessage(payload.error?.message ?? "同步失败");
    }
    setBusy(null);
  }

  async function revoke(bindingId: string) {
    if (!window.confirm("解除后会停止自动同步，但不会删除历史作品和数据。确定解除吗？")) return;
    setBusy(bindingId);
    const response = await fetch(`/api/douyin/accounts/${bindingId}`, { method: "DELETE" });
    if (!response.ok) setMessage("解除绑定失败");
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
      {message ? <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">{message}</div> : null}
      {loading ? <p className="text-sm text-stone-500">正在加载账号…</p> : null}
      {!loading && accounts.length === 0 ? <div className="rounded-xl border border-dashed border-stone-300 px-6 py-10 text-center text-sm text-stone-500">当前没有可绑定的业务账号。</div> : null}
      <div className="grid gap-4 md:grid-cols-2">
        {accounts.map((account) => {
          const binding = account.binding;
          const rows = binding ? metrics[binding.id] ?? [] : [];
          return (
            <section key={account.accountId} className="space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-medium text-stone-900">{account.accountName}</h2>
                  <p className="mt-1 text-xs text-stone-500">{binding?.display_name ?? "尚未绑定抖音号"}</p>
                </div>
                <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-600">{binding ? statusLabels[binding.status] ?? binding.status : "未绑定"}</span>
              </div>
              {binding ? (
                <>
                  <p className="text-xs text-stone-500">下次续签时间：{new Date(binding.access_token_expires_at).toLocaleDateString("zh-CN")}{binding.last_sync_at ? ` · 最近同步 ${new Date(binding.last_sync_at).toLocaleString("zh-CN")}` : ""}</p>
                  {binding.last_error_summary ? <p className="text-xs text-red-600">{binding.last_error_summary}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="rounded-md bg-stone-900 px-3 py-2 text-sm text-white disabled:opacity-50" disabled={busy === binding.id} onClick={() => void sync(binding.id)}>立即同步</button>
                    <button type="button" className="rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-700 disabled:opacity-50" disabled={busy === binding.id} onClick={() => void authorize(account.accountId)}>重新授权</button>
                    <button type="button" className="rounded-md px-3 py-2 text-sm text-red-600 disabled:opacity-50" disabled={busy === binding.id} onClick={() => void revoke(binding.id)}>解除绑定</button>
                  </div>
                  <div className="border-t border-stone-100 pt-3">
                    <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-medium text-stone-800">近 30 天账号趋势</h3><button type="button" className="text-xs text-stone-500 underline" onClick={() => void loadMetrics(binding.id)}>刷新</button></div>
                    {rows.length === 0 ? <p className="text-xs text-stone-500">同步后显示趋势数据；抖音官方数据可能次日才完整。</p> : <div className="grid grid-cols-2 gap-2 text-xs text-stone-600"><span>最新粉丝：{rows.at(-1)?.total_fans ?? "—"}</span><span>最新涨粉：{rows.at(-1)?.new_fans ?? "—"}</span><span>最新点赞：{rows.at(-1)?.new_likes ?? "—"}</span><span>主页访问：{rows.at(-1)?.profile_uv ?? "—"}</span></div>}
                  </div>
                </>
              ) : <button type="button" className="w-full rounded-md bg-stone-900 px-3 py-2 text-sm text-white disabled:opacity-50" disabled={busy === account.accountId} onClick={() => void authorize(account.accountId)}>绑定抖音账号</button>}
            </section>
          );
        })}
      </div>
    </div>
  );
}
