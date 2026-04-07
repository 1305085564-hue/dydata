"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeInfo,
  CheckCircle2,
  Loader2,
  Pencil,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type AiChannelRow = {
  id: string;
  name: string;
  base_url: string;
  api_key_masked: string;
  model: string | null;
  priority: number;
  is_enabled: boolean;
  unhealthy_until: string | null;
  consecutive_failures: number;
  last_failure_at: string | null;
  last_success_at: string | null;
  last_error_message: string | null;
};

type ChannelFormState = {
  name: string;
  base_url: string;
  api_key: string;
  model: string;
  priority: string;
};

type ChannelStatus = "healthy" | "circuit" | "disabled";

const EMPTY_FORM: ChannelFormState = {
  name: "",
  base_url: "",
  api_key: "",
  model: "",
  priority: "100",
};

function maskApiKey(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "—";
  if (trimmed.length <= 8) return `${trimmed.slice(0, 4)}***`;
  return `${trimmed.slice(0, 4)}***${trimmed.slice(-4)}`;
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMaskedFromApi(value: string) {
  if (!value) return "—";
  if (value.includes("***")) return value;
  return maskApiKey(value);
}

function getStatus(channel: AiChannelRow): ChannelStatus {
  if (!channel.is_enabled) return "disabled";
  if (channel.unhealthy_until && new Date(channel.unhealthy_until).getTime() > Date.now()) return "circuit";
  return "healthy";
}

function getStatusMeta(channel: AiChannelRow) {
  const status = getStatus(channel);
  if (status === "disabled") {
    return {
      label: "已禁用",
      variant: "outline" as const,
      className: "border-border/70 bg-muted/70 text-muted-foreground",
    };
  }

  if (status === "circuit") {
    return {
      label: `熔断中 · ${formatDateTime(channel.unhealthy_until)}`,
      variant: "destructive" as const,
      className: "rounded-full",
    };
  }

  return {
    label: "健康",
    variant: "default" as const,
    className: "rounded-full bg-emerald-600 text-white hover:bg-emerald-600",
  };
}

function isRecoverable(channel: AiChannelRow) {
  return Boolean(channel.unhealthy_until && new Date(channel.unhealthy_until).getTime() > Date.now());
}

export default function AIChannelsClient() {
  const [channels, setChannels] = useState<AiChannelRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeChannel, setActiveChannel] = useState<AiChannelRow | null>(null);
  const [form, setForm] = useState<ChannelFormState>(EMPTY_FORM);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AiChannelRow | null>(null);
  const [loadingActionId, setLoadingActionId] = useState<string | null>(null);

  const orderedChannels = useMemo(
    () => [...channels].sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name, "zh-CN")),
    [channels]
  );

  async function loadChannels(nextSilent = false) {
    if (nextSilent) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const res = await fetch("/api/admin/ai-channels", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "加载渠道失败");
      }
      setChannels(Array.isArray(data.channels) ? data.channels : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "加载渠道失败";
      setError(message);
      feedbackToast.error(message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    void loadChannels();
  }, []);

  function openCreateDialog() {
    setActiveChannel(null);
    setForm(EMPTY_FORM);
    setIsDialogOpen(true);
  }

  function openEditDialog(channel: AiChannelRow) {
    setActiveChannel(channel);
    setForm({
      name: channel.name,
      base_url: channel.base_url,
      api_key: "",
      model: channel.model ?? "",
      priority: String(channel.priority),
    });
    setIsDialogOpen(true);
  }

  function closeDialog() {
    if (isSubmitting) return;
    setIsDialogOpen(false);
    setActiveChannel(null);
    setForm(EMPTY_FORM);
  }

  async function submitForm() {
    const name = form.name.trim();
    const baseUrl = form.base_url.trim();
    const apiKey = form.api_key.trim();
    const model = form.model.trim();
    const priority = Number.parseInt(form.priority, 10);

    if (!name || !baseUrl || !Number.isFinite(priority)) {
      feedbackToast.error("请先填写名称、地址和优先级");
      return;
    }
    if (!activeChannel && !apiKey) {
      feedbackToast.error("请填写密钥");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/admin/ai-channels", {
        method: activeChannel ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeChannel?.id,
          name,
          base_url: baseUrl,
          api_key: apiKey || undefined,
          model: model || null,
          priority,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "保存失败");
      }

      feedbackToast.success(activeChannel ? "渠道已更新" : "渠道已新增");
      setIsDialogOpen(false);
      setActiveChannel(null);
      setForm(EMPTY_FORM);
      await loadChannels(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "保存失败";
      feedbackToast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function runChannelAction(channel: AiChannelRow, action: "test" | "toggle" | "recover" | "delete") {
    setLoadingActionId(`${action}:${channel.id}`);
    try {
      let res: Response;
      if (action === "test") {
        res = await fetch("/api/admin/ai-channels/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel_id: channel.id }),
        });
      } else if (action === "recover") {
        res = await fetch("/api/admin/ai-channels/recover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel_id: channel.id }),
        });
      } else if (action === "toggle") {
        res = await fetch("/api/admin/ai-channels", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: channel.id,
            is_enabled: !channel.is_enabled,
          }),
        });
      } else {
        res = await fetch(`/api/admin/ai-channels?id=${encodeURIComponent(channel.id)}`, {
          method: "DELETE",
        });
      }

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "操作失败");
      }

      if (action === "test") {
        const elapsed = typeof data.elapsed_ms === "number" ? `，耗时 ${data.elapsed_ms}ms` : "";
        feedbackToast.success(`连通测试成功${elapsed}`);
      } else if (action === "toggle") {
        feedbackToast.success(channel.is_enabled ? "已禁用渠道" : "已启用渠道");
      } else if (action === "recover") {
        feedbackToast.success("已手动恢复渠道");
      } else {
        feedbackToast.success("已删除渠道");
      }

      await loadChannels(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "操作失败";
      feedbackToast.error(message);
    } finally {
      setLoadingActionId(null);
      setDeleteTarget(null);
    }
  }

  const navCards = [
    {
      title: "管理入口",
      description: "从这里回到总控台。",
      href: "/admin",
      label: "返回总控台",
    },
    {
      title: "AI 渠道",
      description: "按优先级管理模型地址、密钥和熔断状态。",
      href: null,
      label: "当前页面",
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-4 sm:px-6 lg:px-8">
      <section className="rounded-[30px] border border-white/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.94),rgba(244,248,255,0.86))] px-5 py-5 shadow-[var(--shadow-card)] backdrop-blur-[20px] sm:px-6 sm:py-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">Channel Control</p>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--color-text-primary)] sm:text-[30px]">AI 渠道管理</h1>
              <p className="max-w-2xl text-sm leading-6 text-[var(--color-text-secondary)]">
                用最少的操作控制多个 AI 渠道。先看健康状态，再决定测试、恢复、禁用或删除。
              </p>
            </div>
          </div>
          <div className="grid gap-2 rounded-2xl border border-white/80 bg-white/88 p-3 text-xs text-[var(--color-text-secondary)] shadow-[var(--shadow-light)] sm:min-w-[320px]">
            <div className="inline-flex items-center gap-2 font-medium text-[var(--color-text-primary)]">
              <BadgeInfo className="size-3.5 text-[var(--color-primary)]" />
              渠道导航
            </div>
            <div className="space-y-2 pt-1">
              {navCards.map((item) =>
                item.href ? (
                  <Link
                    key={item.title}
                    href={item.href}
                    className="flex items-center justify-between rounded-2xl border border-white/75 bg-white/80 px-3 py-2.5 text-sm text-[var(--color-text-secondary)] shadow-[var(--shadow-light)] transition hover:-translate-y-px hover:border-primary/20 hover:text-[var(--color-text-primary)]"
                  >
                    <div>
                      <p className="font-medium text-[var(--color-text-primary)]">{item.title}</p>
                      <p className="text-xs text-[var(--color-text-secondary)]">{item.description}</p>
                    </div>
                    <ArrowRight className="size-4 text-[var(--color-text-tertiary)]" />
                  </Link>
                ) : (
                  <div key={item.title} className="rounded-2xl border border-primary/15 bg-primary/10 px-3 py-2.5 text-sm text-[var(--color-text-secondary)]">
                    <p className="font-medium text-[var(--color-text-primary)]">{item.title}</p>
                    <p className="text-xs text-[var(--color-text-secondary)]">{item.description}</p>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </section>

      <Card className="glass-card-static border-white/70 bg-white/78 backdrop-blur-[16px]">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="font-semibold tracking-tight">渠道列表</CardTitle>
              <CardDescription className="mt-1">优先级越小越先尝试。熔断中的渠道会自动跳过。</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void loadChannels(true)} disabled={isRefreshing || isLoading}>
                {isRefreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                刷新
              </Button>
              <Button size="sm" onClick={openCreateDialog}>
                新增渠道
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {isLoading ? (
            <div className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/75 px-4 py-8 text-sm text-[var(--color-text-secondary)]">
              <Loader2 className="size-4 animate-spin" />
              正在加载渠道列表...
            </div>
          ) : orderedChannels.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/70 bg-white/70 px-4 py-12 text-center">
              <ShieldAlert className="size-10 text-muted-foreground" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-[var(--color-text-primary)]">还没有渠道</p>
                <p className="text-xs text-[var(--color-text-secondary)]">先新增一个渠道，再测试连通性。</p>
              </div>
              <Button onClick={openCreateDialog}>新增渠道</Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>地址</TableHead>
                  <TableHead>密钥</TableHead>
                  <TableHead>模型</TableHead>
                  <TableHead>优先级</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>最近记录</TableHead>
                  <TableHead>失败次数</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orderedChannels.map((channel) => {
                  const meta = getStatusMeta(channel);
                  const busy =
                    loadingActionId === `test:${channel.id}` ||
                    loadingActionId === `toggle:${channel.id}` ||
                    loadingActionId === `recover:${channel.id}` ||
                    loadingActionId === `delete:${channel.id}`;
                  const status = getStatus(channel);

                  return (
                    <TableRow key={channel.id}>
                      <TableCell className="font-medium text-[var(--color-text-primary)]">{channel.name}</TableCell>
                      <TableCell className="max-w-[240px] truncate text-sm text-[var(--color-text-secondary)]">
                        {channel.base_url}
                      </TableCell>
                      <TableCell className="font-mono text-xs tracking-wider text-[var(--color-text-secondary)]">
                        {formatMaskedFromApi(channel.api_key_masked)}
                      </TableCell>
                      <TableCell className="text-sm text-[var(--color-text-secondary)]">
                        {channel.model || "全局默认"}
                      </TableCell>
                      <TableCell className="tabular-nums text-sm text-[var(--color-text-secondary)]">
                        {channel.priority}
                      </TableCell>
                      <TableCell>
                        <Badge variant={meta.variant} className={meta.className}>
                          {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-[var(--color-text-secondary)]">
                        <div className="space-y-1">
                          <p>成功：{formatDateTime(channel.last_success_at)}</p>
                          <p>失败：{formatDateTime(channel.last_failure_at)}</p>
                        </div>
                      </TableCell>
                      <TableCell className="tabular-nums text-sm text-[var(--color-text-secondary)]">
                        {channel.consecutive_failures}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEditDialog(channel)} disabled={busy}>
                            <Pencil className="size-4" />
                            编辑
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => void runChannelAction(channel, "test")} disabled={busy}>
                            {loadingActionId === `test:${channel.id}` ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="size-4" />
                            )}
                            测试连通
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => void runChannelAction(channel, "toggle")} disabled={busy}>
                            {channel.is_enabled ? "禁用" : "启用"}
                          </Button>
                          {isRecoverable(channel) ? (
                            <Button variant="outline" size="sm" onClick={() => void runChannelAction(channel, "recover")} disabled={busy}>
                              恢复
                            </Button>
                          ) : null}
                          <Button variant="destructive" size="sm" onClick={() => setDeleteTarget(channel)} disabled={busy}>
                            <Trash2 className="size-4" />
                            删除
                          </Button>
                        </div>
                        {channel.last_error_message ? (
                          <p className="mt-2 max-w-[320px] truncate text-left text-xs text-destructive">
                            最近错误：{channel.last_error_message}
                          </p>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={(open) => (open ? setIsDialogOpen(true) : closeDialog())}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{activeChannel ? "编辑渠道" : "新增渠道"}</DialogTitle>
            <DialogDescription>
              {activeChannel ? "修改渠道信息。密钥留空则保持原值。" : "填写渠道名称、地址和密钥，保存后即可参与 failover。"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-1">
              <Label htmlFor="ai-channel-name">名称</Label>
              <Input
                id="ai-channel-name"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="api7"
              />
            </div>
            <div className="space-y-2 sm:col-span-1">
              <Label htmlFor="ai-channel-priority">优先级</Label>
              <Input
                id="ai-channel-priority"
                type="number"
                min={1}
                value={form.priority}
                onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value }))}
                placeholder="100"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="ai-channel-base-url">地址</Label>
              <Input
                id="ai-channel-base-url"
                value={form.base_url}
                onChange={(e) => setForm((prev) => ({ ...prev, base_url: e.target.value }))}
                placeholder="https://example.com"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="ai-channel-api-key">密钥</Label>
              <Input
                id="ai-channel-api-key"
                type="password"
                value={form.api_key}
                onChange={(e) => setForm((prev) => ({ ...prev, api_key: e.target.value }))}
                placeholder={activeChannel ? "留空则保持当前密钥" : "sk-..."}
              />
              {activeChannel ? (
                <p className="text-xs text-muted-foreground">当前密钥：{formatMaskedFromApi(activeChannel.api_key_masked)}</p>
              ) : null}
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="ai-channel-model">模型</Label>
              <Input
                id="ai-channel-model"
                value={form.model}
                onChange={(e) => setForm((prev) => ({ ...prev, model: e.target.value }))}
                placeholder="留空则使用全局默认"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isSubmitting}>
              取消
            </Button>
            <Button onClick={() => void submitForm()} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
              {activeChannel ? "保存修改" : "新增渠道"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除渠道"
        description={deleteTarget ? `确定删除「${deleteTarget.name}」吗？此操作不可恢复。` : undefined}
        confirmText="删除"
        cancelText="取消"
        destructive
        loading={loadingActionId === `delete:${deleteTarget?.id ?? ""}`}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await runChannelAction(deleteTarget, "delete");
        }}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      />
    </div>
  );
}
