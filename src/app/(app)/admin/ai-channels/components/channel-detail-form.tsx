"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Save, Trash2, Power, PowerOff, RefreshCw, ShieldAlert } from "lucide-react";
import { AiChannelRow, ChannelFormState } from "./types";
import { formatDateTime, formatMaskedFromApi, getStatusMeta, isRecoverable } from "./utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ChannelDetailFormProps {
  channel: AiChannelRow | null;
  onSave: (form: ChannelFormState, id?: string) => Promise<void>;
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

export function ChannelDetailForm({
  channel,
  onSave,
  onTest,
  onToggle,
  onRecover,
  onDeleteClick,
  busyActions,
}: ChannelDetailFormProps) {
  const [form, setForm] = useState<ChannelFormState>(EMPTY_FORM);
  const [isModified, setIsModified] = useState(false);

  // Sync form with selected channel - deliberately using effect to reset form when channel selection changes

  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => {
    if (channel) {
      setForm({
        name: channel.name,
        base_url: channel.base_url,
        api_key: "",
        model: channel.model || "",
        priority: String(channel.priority),
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setIsModified(false);
  }, [channel]);  const handleChange = (key: keyof ChannelFormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setIsModified(true);
  };

  const handleSave = async () => {
    await onSave(form, channel?.id);
    setIsModified(false);
  };

  const isSaving = busyActions["save"];
  const isTestingText = channel ? busyActions[`test:${channel.id}`] : false;
  const isTestingOcr = channel ? busyActions[`ocr_test:${channel.id}`] : false;
  const isToggling = channel ? busyActions[`toggle:${channel.id}`] : false;
  const isRecovering = channel ? busyActions[`recover:${channel.id}`] : false;

  return (
    <Card className="rounded-[24px] border border-white/70 bg-white/78 shadow-[var(--shadow-card)] backdrop-blur-[16px] overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border/40 bg-muted/20 px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-[var(--color-text-primary)]">
            {channel ? channel.name : "新增渠道"}
          </h2>
          {channel && (
            <div className="mt-1 flex items-center gap-2">
              <Badge variant={getStatusMeta(channel).variant} className={getStatusMeta(channel).className}>
                {getStatusMeta(channel).label}
              </Badge>
              <span className="text-xs text-[var(--color-text-tertiary)]">ID: {channel.id.slice(0, 8)}</span>
            </div>
          )}
        </div>
        
        <div className="mt-4 flex items-center gap-2 sm:mt-0">
          <Button 
            onClick={handleSave} 
            disabled={!isModified || isSaving}
            className="rounded-xl"
            size="sm"
          >
            {isSaving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
            {isModified ? "保存修改" : "已保存"}
          </Button>
          
          {channel && (
            <Button
              variant="ghost"
              size="sm"
              className="rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onDeleteClick(channel)}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      </div>

      <CardContent className="p-6">
        <div className="grid gap-6 sm:grid-cols-2">
          {/* Form Fields */}
          <div className="space-y-4 sm:col-span-2 lg:col-span-1">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">名称</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => handleChange("name", e.target.value)}
                placeholder="例如: api7, 官方直连"
                className="rounded-xl border-border/60 bg-white/50 focus-visible:bg-white"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="base_url" className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">API 地址</Label>
              <Input
                id="base_url"
                value={form.base_url}
                onChange={(e) => handleChange("base_url", e.target.value)}
                placeholder="https://api.example.com"
                className="rounded-xl border-border/60 bg-white/50 focus-visible:bg-white font-mono text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="api_key" className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">密钥 (API Key)</Label>
              <Input
                id="api_key"
                type="password"
                value={form.api_key}
                onChange={(e) => handleChange("api_key", e.target.value)}
                placeholder={channel ? "留空则保持当前密钥" : "sk-..."}
                className="rounded-xl border-border/60 bg-white/50 focus-visible:bg-white font-mono text-sm"
              />
              {channel && (
                <p className="text-[11px] text-[var(--color-text-tertiary)]">
                  当前: <span className="font-mono">{formatMaskedFromApi(channel.api_key_masked)}</span>
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="model" className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">默认模型</Label>
                <Input
                  id="model"
                  value={form.model}
                  onChange={(e) => handleChange("model", e.target.value)}
                  placeholder="留空使用全局配置"
                  className="rounded-xl border-border/60 bg-white/50 focus-visible:bg-white font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority" className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">优先级 (越小越优先)</Label>
                <Input
                  id="priority"
                  type="number"
                  min={1}
                  value={form.priority}
                  onChange={(e) => handleChange("priority", e.target.value)}
                  className="rounded-xl border-border/60 bg-white/50 focus-visible:bg-white"
                />
              </div>
            </div>
          </div>

          {/* Status & Actions Panel */}
          {channel && (
            <div className="sm:col-span-2 lg:col-span-1 flex flex-col space-y-6 rounded-2xl border border-primary/10 bg-primary/5 p-5">
              <div>
                <h3 className="mb-3 text-sm font-medium text-[var(--color-text-primary)]">连通性测试</h3>
                <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => onTest(channel.id, "text")} 
                    disabled={isTestingText}
                    className="rounded-xl bg-white/80"
                  >
                    {isTestingText ? <Loader2 className="mr-2 size-4 animate-spin" /> : <CheckCircle2 className="mr-2 size-4 text-emerald-500" />}
                    文本测试
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => onTest(channel.id, "ocr")} 
                    disabled={isTestingOcr}
                    className="rounded-xl bg-white/80"
                  >
                    {isTestingOcr ? <Loader2 className="mr-2 size-4 animate-spin" /> : <CheckCircle2 className="mr-2 size-4 text-emerald-500" />}
                    OCR 测试
                  </Button>
                </div>
              </div>

              <div className="h-px bg-primary/10 w-full" />

              <div>
                <h3 className="mb-3 text-sm font-medium text-[var(--color-text-primary)]">状态控制</h3>
                <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                  {isRecoverable(channel) ? (
                    <Button 
                      variant="default" 
                      size="sm" 
                      onClick={() => onRecover(channel.id)} 
                      disabled={isRecovering}
                      className="rounded-xl"
                    >
                      {isRecovering ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
                      从熔断恢复
                    </Button>
                  ) : (
                    <Button 
                      variant={channel.is_enabled ? "outline" : "default"} 
                      size="sm" 
                      onClick={() => onToggle(channel.id, !channel.is_enabled)} 
                      disabled={isToggling}
                      className={channel.is_enabled ? "rounded-xl bg-white/80 text-destructive hover:text-destructive" : "rounded-xl"}
                    >
                      {isToggling ? <Loader2 className="mr-2 size-4 animate-spin" /> : 
                        channel.is_enabled ? <PowerOff className="mr-2 size-4" /> : <Power className="mr-2 size-4" />}
                      {channel.is_enabled ? "禁用渠道" : "启用渠道"}
                    </Button>
                  )}
                </div>
              </div>

              <div className="mt-auto pt-4 text-xs text-[var(--color-text-secondary)] space-y-1.5">
                <div className="flex justify-between">
                  <span>最后成功:</span>
                  <span className="font-mono">{formatDateTime(channel.last_success_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span>最后失败:</span>
                  <span className="font-mono">{formatDateTime(channel.last_failure_at)}</span>
                </div>
                <div className="flex justify-between text-destructive">
                  <span>连续失败:</span>
                  <span className="font-mono font-medium">{channel.consecutive_failures} 次</span>
                </div>
                {channel.last_error_message && (
                  <div className="mt-3 space-y-1.5 rounded-lg bg-destructive/5 p-3 text-destructive border border-destructive/15">
                    <div className="flex items-center gap-1.5 font-medium"><ShieldAlert className="size-3.5" />报错信息</div>
                    <div className="line-clamp-3 text-destructive/90" title={channel.last_error_message}>
                      {channel.last_error_message}
                    </div>
                  </div>
                )}              </div>
            </div>
          )}
          
          {!channel && (
            <div className="sm:col-span-2 lg:col-span-1 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-muted/30 p-8 md:p-12 text-center text-sm text-[var(--color-text-secondary)] min-h-[200px]">
              <CheckCircle2 className="mb-2 size-8 text-muted-foreground/40" />
              <p className="mt-1 font-medium text-[var(--color-text-primary)]">填写左侧信息保存后</p>
              <p className="mt-1 opacity-80 text-xs">即可进行测试与功能绑定</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
