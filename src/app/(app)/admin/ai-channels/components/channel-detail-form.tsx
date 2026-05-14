"use client";

import { useState } from "react";
import { CheckCircle2, Save, Trash2, RefreshCw, ShieldAlert, Activity, Image as ImageIcon } from "lucide-react";
import { AiChannelRow, ChannelFormState } from "./types";
import { formatDateTime, formatMaskedFromApi, getStatusMeta, isRecoverable } from "./utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface ChannelDetailFormProps {
  channel: AiChannelRow | null;
  onSave: (form: ChannelFormState, id?: string) => Promise<boolean>;
  onTest: (id: string, kind: "text" | "ocr") => Promise<void>;
  onToggle: (id: string, isEnabled: boolean) => Promise<void>;
  onRecover: (id: string) => Promise<void>;
  onDeleteClick: (channel: AiChannelRow) => void;
  busyActions: Record<string, boolean>;
}

const EMPTY_FORM: ChannelFormState = {
  name: "",
  base_url: "",
  api_key: "",
  model: "",
  priority: "100",
};

function buildInitialForm(channel: AiChannelRow | null): ChannelFormState {
  if (!channel) {
    return EMPTY_FORM;
  }

  return {
    name: channel.name,
    base_url: channel.base_url,
    api_key: "",
    model: channel.model || "",
    priority: String(channel.priority),
  };
}

export function ChannelDetailForm({
  channel,
  onSave,
  onTest,
  onToggle,
  onRecover,
  onDeleteClick,
  busyActions,
}: ChannelDetailFormProps) {
  const [form, setForm] = useState<ChannelFormState>(() => buildInitialForm(channel));
  const [isModified, setIsModified] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleChange = (key: keyof ChannelFormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setIsModified(true);
    setSaveStatus('idle');
  };

  const handleSave = async () => {
    setSaveStatus('idle');
    const success = await onSave(form, channel?.id);
    if (success) {
      setIsModified(false);
      setSaveStatus('success');
    } else {
      setSaveStatus('error');
    }
  };

  const isSaving = busyActions["save"];
  const isTestingText = channel ? busyActions[`test:${channel.id}`] : false;
  const isTestingOcr = channel ? busyActions[`ocr_test:${channel.id}`] : false;
  const isToggling = channel ? busyActions[`toggle:${channel.id}`] : false;
  const isRecovering = channel ? busyActions[`recover:${channel.id}`] : false;
  const statusMeta = channel ? getStatusMeta(channel) : null;

  return (
    <Card className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4 py-2.5 gap-3">
        {/* Left: Title & Toggle */}
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-[14px] font-semibold tracking-tight text-zinc-800">
            {channel ? channel.name : "新增渠道"}
          </h2>
          {channel && (
            <div className="flex flex-wrap items-center gap-2 border-l border-border/60 pl-3">
              <Switch
                checked={channel.is_enabled}
                disabled={isToggling}
                onCheckedChange={(checked) => onToggle(channel.id, checked)}
                aria-label={channel.is_enabled ? "禁用渠道" : "启用渠道"}
              />
              {statusMeta && (
                <Badge variant={statusMeta.variant} className={cn(statusMeta.className, "whitespace-normal text-center text-[11px]")}>
                  {statusMeta.label}
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex flex-wrap items-center gap-1.5 xl:justify-end">
          {channel && (
            <div className="flex flex-wrap items-center gap-1.5 mr-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onTest(channel.id, "text")}
                disabled={isTestingText || !channel.is_enabled}
                className="rounded-lg h-7 text-[11px] text-[#6FAA7D] border-zinc-200 bg-[#6FAA7D]/10 hover:bg-[#6FAA7D]/15 whitespace-nowrap"
              >
                {isTestingText ? <Skeleton className="mr-1 size-3 rounded-full shrink-0" /> : <Activity className="mr-1 size-3 shrink-0" />}
                测文本
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onTest(channel.id, "ocr")}
                disabled={isTestingOcr || !channel.is_enabled}
                className="rounded-lg h-7 text-[11px] text-[#6FAA7D] border-zinc-200 bg-[#6FAA7D]/10 hover:bg-[#6FAA7D]/15 whitespace-nowrap"
              >
                {isTestingOcr ? <Skeleton className="mr-1 size-3 rounded-full shrink-0" /> : <ImageIcon className="mr-1 size-3 shrink-0" />}
                测 OCR
              </Button>

              {isRecoverable(channel) && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => onRecover(channel.id)}
                  disabled={isRecovering}
                  className="rounded-lg h-7 text-[11px] whitespace-nowrap"
                >
                  {isRecovering ? <Skeleton className="mr-1 size-3 rounded-full shrink-0" /> : <RefreshCw className="mr-1 size-3 shrink-0" />}
                  恢复
                </Button>
              )}

              <Button
                variant="ghost"
                size="sm"
                className="rounded-lg h-7 px-1.5 text-[#C9604D] hover:bg-[#C9604D]/10 hover:text-[#C9604D] shrink-0"
                onClick={() => onDeleteClick(channel)}
                title="删除渠道"
                aria-label="删除渠道"
              >
                <Trash2 className="size-3.5 shrink-0" />
              </Button>
            </div>
          )}

          <div className="flex items-center gap-1.5 pl-1.5 sm:border-l sm:border-border/60">
            <span className="text-[11px] font-medium whitespace-nowrap">
              {isSaving ? (
                <span className="text-[#D99E55] flex items-center gap-1"><Skeleton className="size-3 rounded-full" />保存中</span>
              ) : saveStatus === 'error' ? (
                <span className="text-destructive flex items-center gap-1">失败</span>
              ) : isModified ? (
                <span className="text-[#D99E55]">待保存</span>
              ) : saveStatus === 'success' || channel ? (
                <span className="text-[#6FAA7D] flex items-center gap-1"><CheckCircle2 className="size-3" />已保存</span>
              ) : (
                <span className="text-muted-foreground text-[10px]">待填写</span>
              )}
            </span>
            <Button
              onClick={handleSave}
              disabled={!isModified || isSaving}
              className={cn("rounded-lg h-7 text-[11px] whitespace-nowrap", isModified ? "bg-[#D99E55] hover:bg-[#C38C47] text-white" : "")}
              size="sm"
            >
              <Save className="mr-1 size-3 shrink-0" />
              保存
            </Button>
          </div>
        </div>
      </div>

      <CardContent className="p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-3 sm:col-span-2">
            <div className="grid grid-cols-12 items-start gap-3">
              <div className="col-span-12 space-y-1 md:col-span-5">
                <Label htmlFor="name" className="text-[11px] font-medium text-zinc-500">名称</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => handleChange("name", e.target.value)}
                  placeholder="例如: api7, 官方直连"
                  className="rounded-lg h-8 text-[12px] border-zinc-200 bg-zinc-50 focus-visible:bg-white"
                />
              </div>

              <div className="col-span-7 space-y-1 md:col-span-5">
                <Label htmlFor="base_url" className="text-[11px] font-medium text-zinc-500">API 地址</Label>
                <Input
                  id="base_url"
                  value={form.base_url}
                  onChange={(e) => handleChange("base_url", e.target.value)}
                  placeholder="https://api.example.com"
                  className="rounded-lg h-8 text-[12px] border-zinc-200 bg-zinc-50 focus-visible:bg-white font-mono"
                />
              </div>

              <div className="col-span-5 space-y-1 md:col-span-2">
                <Label htmlFor="priority" className="text-[11px] font-medium text-zinc-500">优先级</Label>
                <Input
                  id="priority"
                  type="number"
                  min={1}
                  value={form.priority}
                  onChange={(e) => handleChange("priority", e.target.value)}
                  placeholder="越小越优先"
                  className="rounded-lg h-8 text-center text-[12px] tabular-nums border-zinc-200 bg-zinc-50 focus-visible:bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-12 items-start gap-3">
              <div className="col-span-12 space-y-1 md:col-span-5">
                <div className="flex items-baseline justify-between gap-2">
                  <Label htmlFor="api_key" className="text-[11px] font-medium text-zinc-500">密钥</Label>
                  {channel && (
                    <span className="truncate text-[10px] text-zinc-400">
                      当前: <span className="font-mono">{formatMaskedFromApi(channel.api_key_masked)}</span>
                    </span>
                  )}
                </div>
                <Input
                  id="api_key"
                  type="password"
                  value={form.api_key}
                  onChange={(e) => handleChange("api_key", e.target.value)}
                  placeholder={channel ? "留空则保持当前密钥" : "sk-..."}
                  className="rounded-lg h-8 text-[12px] border-zinc-200 bg-zinc-50 focus-visible:bg-white font-mono"
                />
              </div>

              <div className="col-span-12 space-y-1 md:col-span-5">
                <Label htmlFor="model" className="text-[11px] font-medium text-zinc-500">默认模型</Label>
                <Input
                  id="model"
                  value={form.model}
                  onChange={(e) => handleChange("model", e.target.value)}
                  placeholder="留空使用全局配置"
                  className="rounded-lg h-8 text-[12px] border-zinc-200 bg-zinc-50 focus-visible:bg-white font-mono"
                />
              </div>

              <div className="hidden md:col-span-2 md:block" aria-hidden />
            </div>
          </div>

          {channel && (
            <div className="sm:col-span-2 pt-3 border-t border-border/40 text-[11px] text-zinc-500">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <div>
                  <span className="opacity-80">最后成功: </span>
                  <span className="font-mono font-medium">{formatDateTime(channel.last_success_at)}</span>
                </div>
                <div>
                  <span className="opacity-80">最后失败: </span>
                  <span className="font-mono font-medium">{formatDateTime(channel.last_failure_at)}</span>
                </div>
                {channel.consecutive_failures > 0 && (
                  <div className="text-destructive">
                    <span className="opacity-80">连续失败: </span>
                    <span className="font-mono font-medium">{channel.consecutive_failures} 次</span>
                  </div>
                )}
                {channel.id && (
                  <div>
                    <span className="opacity-80">ID: </span>
                    <span className="font-mono">{channel.id.slice(0, 8)}</span>
                  </div>
                )}
              </div>
              {channel.last_error_message && (
                <div className="mt-2 space-y-1 rounded-lg border border-destructive/15 bg-destructive/5 p-3 text-destructive max-w-full overflow-hidden">
                  <div className="flex items-center gap-1 font-medium text-[11px]"><ShieldAlert className="size-3" />报错信息</div>
                  <div className="text-destructive/90 break-all text-[10px] leading-relaxed font-mono" title={channel.last_error_message}>
                    {channel.last_error_message}
                  </div>
                </div>
              )}
            </div>
          )}

          {!channel && (
            <div className="sm:col-span-2 flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-zinc-50 p-6 text-center text-[12px] text-zinc-500 min-h-[100px]">
              <CheckCircle2 className="mb-1.5 size-6 text-muted-foreground/40" />
              <p className="font-medium text-zinc-800">保存基本信息后</p>
              <p className="mt-0.5 opacity-80 text-[11px]">即可测试连通性并配置功能接管</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
