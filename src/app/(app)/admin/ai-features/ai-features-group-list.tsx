import { Bot, ChevronDown, ChevronUp, Loader2, Save, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { AiFeatureCardItem, AiFeatureGroupSection } from "./ai-features-client";

type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

type AiChannelOption = {
  id: string;
  name: string;
};

type AIFeaturesGroupListProps = {
  featureGroups: AiFeatureGroupSection[];
  channels: AiChannelOption[];
  isLoading: boolean;
  isRefreshing: boolean;
  featuresEmpty: boolean;
  error: string | null;
  saveStates: Record<string, SaveStatus>;
  promptOpen: Record<string, boolean>;
  customModelMode: Record<string, boolean>;
  onRefresh: () => void;
  onFeaturePatch: (id: string, patch: Record<string, unknown>) => void;
  onPromptToggle: (id: string, open: boolean) => void;
};

const AUTO_CHANNEL_VALUE = "__auto__";
const DEFAULT_MODEL_VALUE = "__default__";
const CUSTOM_MODEL_VALUE = "__custom__";

const MODEL_OPTIONS = [
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.4-nano",
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
  "gemini-3.1-pro-high",
  "gemini-3-flash",
];

const MODEL_SELECT_ITEMS = [
  { value: DEFAULT_MODEL_VALUE, label: "跟随渠道默认" },
  ...MODEL_OPTIONS.map((model) => ({ value: model, label: model })),
  { value: CUSTOM_MODEL_VALUE, label: "自定义输入" },
];

function isCustomModel(model: string) {
  return Boolean(model.trim() && !MODEL_OPTIONS.includes(model.trim()));
}

function getModelSelectValue(model: string) {
  const trimmed = model.trim();
  if (!trimmed) return DEFAULT_MODEL_VALUE;
  if (MODEL_OPTIONS.includes(trimmed)) return trimmed;
  return CUSTOM_MODEL_VALUE;
}

function formatSaveMeta(status: SaveStatus) {
  if (status === "error") return { label: "保存失败", variant: "destructive" as const, className: "" };
  if (status === "saved") return { label: "已保存", variant: "secondary" as const, className: "bg-emerald-50 text-emerald-700" };
  if (status === "saving") return { label: "保存中", variant: "outline" as const, className: "" };
  if (status === "pending") return { label: "待保存", variant: "outline" as const, className: "" };
  return null;
}

function formatDateTime(value: string) {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function AIFeaturesGroupList({
  featureGroups,
  channels,
  isLoading,
  isRefreshing,
  featuresEmpty,
  error,
  saveStates,
  promptOpen,
  customModelMode,
  onRefresh,
  onFeaturePatch,
  onPromptToggle,
}: AIFeaturesGroupListProps) {
  return (
    <Card className="glass-card-static border-white/70 bg-white/78 backdrop-blur-[16px]">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="font-semibold tracking-tight">按业务区管理功能</CardTitle>
            <CardDescription className="mt-1">每次修改会自动保存。禁用后，对应 AI 功能会直接停止调用。</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing || isLoading}>
            {isRefreshing ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            刷新配置
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <div className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/75 px-4 py-8 text-sm text-[var(--color-text-secondary)]">
            <Loader2 className="size-4 animate-spin" />
            正在加载功能配置...
          </div>
        ) : featuresEmpty ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/70 bg-white/70 px-4 py-12 text-center">
            <TriangleAlert className="size-10 text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-[var(--color-text-primary)]">还没有功能配置</p>
              <p className="text-xs text-[var(--color-text-secondary)]">请先在数据库初始化 ai_feature_config。</p>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {featureGroups.map((section) => (
              <FeatureGroupSection
                key={section.group}
                section={section}
                channels={channels}
                saveStates={saveStates}
                promptOpen={promptOpen}
                customModelMode={customModelMode}
                onFeaturePatch={onFeaturePatch}
                onPromptToggle={onPromptToggle}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FeatureGroupSection({
  section,
  channels,
  saveStates,
  promptOpen,
  customModelMode,
  onFeaturePatch,
  onPromptToggle,
}: {
  section: AiFeatureGroupSection;
  channels: AiChannelOption[];
  saveStates: Record<string, SaveStatus>;
  promptOpen: Record<string, boolean>;
  customModelMode: Record<string, boolean>;
  onFeaturePatch: (id: string, patch: Record<string, unknown>) => void;
  onPromptToggle: (id: string, open: boolean) => void;
}) {
  return (
    <section id={`group-${section.group}`} className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold tracking-tight text-[var(--color-text-primary)]">{section.group}</h3>
            <Badge variant="outline" className="bg-white/80">{section.features.length} 个功能</Badge>
          </div>
          <p className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">{section.description}</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {section.features.map((feature) => (
          <FeatureCard
            key={feature.id}
            feature={feature}
            channels={channels}
            saveStatus={saveStates[feature.id] ?? "idle"}
            isPromptOpen={promptOpen[feature.id] ?? false}
            showCustomInput={customModelMode[feature.id] || isCustomModel(feature.model)}
            onFeaturePatch={onFeaturePatch}
            onPromptToggle={onPromptToggle}
          />
        ))}
      </div>
    </section>
  );
}

function FeatureCard({
  feature,
  channels,
  saveStatus,
  isPromptOpen,
  showCustomInput,
  onFeaturePatch,
  onPromptToggle,
}: {
  feature: AiFeatureCardItem;
  channels: AiChannelOption[];
  saveStatus: SaveStatus;
  isPromptOpen: boolean;
  showCustomInput: boolean;
  onFeaturePatch: (id: string, patch: Record<string, unknown>) => void;
  onPromptToggle: (id: string, open: boolean) => void;
}) {
  const saveMeta = formatSaveMeta(saveStatus);

  return (
    <Card size="sm" className="border-white/70 bg-white/86">
      <CardHeader className="border-b border-white/70 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Bot className="size-4 text-[var(--color-primary)]" />
              <CardTitle className="font-semibold text-[var(--color-text-primary)]">{feature.metadata.title}</CardTitle>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="bg-white/80">{feature.metadata.group}</Badge>
              <span className="text-xs text-[var(--color-text-secondary)]">{feature.feature_key}</span>
              <span className="text-xs text-[var(--color-text-secondary)]">数据库名称：{feature.label}</span>
              <Badge variant={feature.is_enabled ? "default" : "outline"} className={feature.is_enabled ? "bg-emerald-600 text-white hover:bg-emerald-600" : ""}>
                {feature.is_enabled ? "已启用" : "已禁用"}
              </Badge>
              {saveMeta ? (
                <Badge variant={saveMeta.variant} className={saveMeta.className}>
                  {saveMeta.label}
                </Badge>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/80 px-3 py-2">
            <span className="text-xs text-[var(--color-text-secondary)]">启用</span>
            <Switch
              checked={feature.is_enabled}
              onCheckedChange={(checked) => onFeaturePatch(feature.id, { is_enabled: checked })}
              aria-label={`${feature.metadata.title} 启用开关`}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-4">
        <div className="grid gap-3 rounded-2xl border border-white/70 bg-white/72 p-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">功能区</p>
            <p className="mt-1 text-sm text-[var(--color-text-primary)]">{feature.metadata.group}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">前台位置</p>
            <p className="mt-1 text-sm leading-6 text-[var(--color-text-primary)]">{feature.metadata.location}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">作用说明</p>
            <p className="mt-1 text-sm leading-6 text-[var(--color-text-primary)]">{feature.metadata.purpose}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">主要输入</p>
            <p className="mt-1 text-sm leading-6 text-[var(--color-text-primary)]">{feature.metadata.inputSummary}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">期望输出</p>
            <p className="mt-1 text-sm leading-6 text-[var(--color-text-primary)]">{feature.metadata.outputSummary}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">推荐在什么时候调</p>
            <p className="mt-1 text-sm leading-6 text-[var(--color-text-primary)]">{feature.metadata.recommendedWhen}</p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`feature-channel-${feature.id}`}>当前渠道</Label>
            <Select
              value={feature.channel_id || AUTO_CHANNEL_VALUE}
              onValueChange={(value) =>
                onFeaturePatch(feature.id, {
                  channel_id: value === AUTO_CHANNEL_VALUE ? "" : (value ?? ""),
                })
              }
              items={[
                { value: AUTO_CHANNEL_VALUE, label: "默认自动（failover）" },
                ...channels.map((channel) => ({ value: channel.id, label: channel.name })),
              ]}
            >
              <SelectTrigger id={`feature-channel-${feature.id}`} className="h-10 w-full rounded-2xl bg-white/80">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AUTO_CHANNEL_VALUE}>默认自动（failover）</SelectItem>
                {channels.map((channel) => (
                  <SelectItem key={channel.id} value={channel.id}>
                    {channel.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`feature-model-${feature.id}`}>当前模型</Label>
            <Select
              value={getModelSelectValue(feature.model)}
              onValueChange={(value) => {
                if (value === DEFAULT_MODEL_VALUE) {
                  onFeaturePatch(feature.id, { model: "", _clearCustomModel: true });
                  return;
                }
                if (value === CUSTOM_MODEL_VALUE) {
                  onFeaturePatch(feature.id, { _setCustomModel: true });
                  return;
                }
                onFeaturePatch(feature.id, { model: value ?? "", _clearCustomModel: true });
              }}
              items={MODEL_SELECT_ITEMS}
            >
              <SelectTrigger id={`feature-model-${feature.id}`} className="h-10 w-full rounded-2xl bg-white/80">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DEFAULT_MODEL_VALUE}>跟随渠道默认</SelectItem>
                {MODEL_OPTIONS.map((model) => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM_MODEL_VALUE}>自定义输入</SelectItem>
              </SelectContent>
            </Select>

            {showCustomInput ? (
              <Input
                value={isCustomModel(feature.model) ? feature.model : ""}
                onChange={(e) => onFeaturePatch(feature.id, { model: e.target.value })}
                placeholder="输入自定义模型名"
                className="h-10 rounded-2xl bg-white/80"
              />
            ) : null}
          </div>
        </div>

        <Collapsible
          open={isPromptOpen}
          onOpenChange={(open) => onPromptToggle(feature.id, open)}
          className="rounded-2xl border border-white/70 bg-white/70"
        >
          <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-[var(--color-text-primary)] transition hover:bg-muted/40">
            <div>
              <div>专属提示词入口</div>
              <div className="mt-1 text-xs font-normal text-[var(--color-text-secondary)]">留空则使用系统默认提示词；只改这个功能，不会影响别的功能。</div>
            </div>
            {isPromptOpen ? (
              <ChevronUp className="size-4 text-[var(--color-text-tertiary)]" />
            ) : (
              <ChevronDown className="size-4 text-[var(--color-text-tertiary)]" />
            )}
          </CollapsibleTrigger>
          <CollapsibleContent className="px-4 pb-4">
            <Textarea
              value={feature.system_prompt}
              onChange={(e) => onFeaturePatch(feature.id, { system_prompt: e.target.value })}
              placeholder="留空则使用系统默认提示词"
              className="min-h-[120px] rounded-2xl bg-white/90"
            />
          </CollapsibleContent>
        </Collapsible>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--color-text-secondary)]">
          <span>当前渠道：{feature.channel_name ?? "默认自动（failover）"}</span>
          <span>当前模型：{feature.model || "跟随渠道默认"}</span>
          <span>更新时间：{formatDateTime(feature.updated_at)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
