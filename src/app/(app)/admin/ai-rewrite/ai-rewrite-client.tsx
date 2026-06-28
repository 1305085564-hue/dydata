"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  ChevronDown,
  GitBranch,
  Pencil,
  Plus,
  RefreshCw,
  Route,
  Ruler,
  Settings2,
  Sparkles,
  Workflow,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type ModelViewRow = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  sort_order: number;
  is_enabled: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

type LengthPresetRef = {
  id: string;
  key: string;
  name: string;
};

type ModelViewRef = {
  id: string;
  key: string;
  label: string;
};

type FixedModeRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  fixed_prompt: string;
  model_view_id: string;
  length_preset_id: string | null;
  sort_order: number;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
  model_view: ModelViewRef | null;
  length_preset: LengthPresetRef | null;
};

type ChannelRow = {
  id: string;
  name: string;
  model: string | null;
  is_enabled: boolean;
  priority: number;
};

type WorkflowRef = {
  id: string;
  key: string;
  name: string;
};

type WorkflowStepRef = {
  id: string;
  workflow_id: string;
  step_key: string;
  name: string;
};

type WorkflowStepRow = {
  id: string;
  workflow_id: string;
  model_view_id: string | null;
  step_key: string;
  name: string;
  description: string | null;
  step_prompt: string;
  sort_order: number;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
  workflow: WorkflowRef | null;
  model_view: ModelViewRef | null;
};

type ModelRouteRow = {
  id: string;
  model_view_id: string;
  workflow_step_id: string | null;
  channel_id: string;
  actual_model: string;
  priority: number;
  weight: number;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
  model_view: ModelViewRef | null;
  workflow_step: WorkflowStepRef | null;
  channel: Pick<ChannelRow, "id" | "name" | "model" | "is_enabled"> | null;
};

type ModeRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  mode_prompt: string;
  sort_order: number;
  is_enabled: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

type LengthPresetRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  length_prompt: string;
  sort_order: number;
  is_enabled: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

type WorkflowRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_enabled: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

type FeatureConfigRow = {
  id: string;
  feature_key: string;
  label: string;
  system_prompt: string | null;
  is_enabled: boolean;
  output_token_limit: number | null;
  context_message_limit: number | null;
};

type RewriteBundle = {
  featureConfig: FeatureConfigRow | null;
  modelViews: ModelViewRow[];
  fixedModes: FixedModeRow[];
  modelRoutes: ModelRouteRow[];
  modes: ModeRow[];
  lengthPresets: LengthPresetRow[];
  workflows: WorkflowRow[];
  workflowSteps: WorkflowStepRow[];
  channels: ChannelRow[];
};

type EditorKind =
  | "fixed_mode"
  | "model_route"
  | "mode"
  | "length_preset"
  | "workflow"
  | "workflow_step";

type RewriteSectionKey =
  | "runtime"
  | "fixedModes"
  | "modelRoutes"
  | "modes"
  | "lengthPresets"
  | "workflows";

type EditorState = {
  kind: EditorKind;
  mode: "create" | "edit";
};

type FormState = Record<string, string | boolean>;
type RuntimeFormState = {
  is_enabled: boolean;
  output_token_limit: string;
  context_message_limit: string;
};

const NONE_VALUE = "__none__";

const EMPTY_BUNDLE: RewriteBundle = {
  featureConfig: null,
  modelViews: [],
  fixedModes: [],
  modelRoutes: [],
  modes: [],
  lengthPresets: [],
  workflows: [],
  workflowSteps: [],
  channels: [],
};

const EMPTY_RUNTIME_FORM: RuntimeFormState = {
  is_enabled: true,
  output_token_limit: "3600",
  context_message_limit: "30",
};

function nextSortOrder(rows: Array<{ sort_order: number }>) {
  const max = rows.reduce((current, row) => Math.max(current, row.sort_order), 0);
  return String(max + 10 || 10);
}

function estimateChars(tokenLimit: number) {
  return Math.max(600, Math.round(tokenLimit / 1.2));
}

function getRouteChannelStatus(route: ModelRouteRow) {
  if (!route.channel) return "渠道已丢失";
  return route.channel.is_enabled ? "渠道已启用" : "渠道已停用";
}

function getStatusBadge(enabled: boolean, isDefault?: boolean) {
  if (!enabled) {
    return <Badge variant="outline">已停用</Badge>;
  }

  if (isDefault) {
    return <Badge className="bg-[#6FAA7D] text-white hover:bg-[#6FAA7D]">默认启用</Badge>;
  }

  return <Badge variant="secondary">已启用</Badge>;
}

function EmptyBlock({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-200 bg-white px-4 py-8 text-center">
      <div className="space-y-1">
        <p className="text-sm font-medium text-zinc-800">{title}</p>
        <p className="text-xs text-zinc-500">{description}</p>
      </div>
      {actionLabel && onAction ? (
        <Button className="mt-4" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Sparkles;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card size="sm" className="border-zinc-200 bg-white">
      <CardContent className="pt-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
              {label}
            </div>
            <div className="text-2xl font-semibold tracking-[-0.03em] text-zinc-800">
              {value}
            </div>
            <div className="text-xs leading-5 text-zinc-500">{hint}</div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-100 text-zinc-800">
            <Icon className="size-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface AIRewriteClientProps {
  embedded?: boolean;
}

export default function AIRewriteClient({ embedded = false }: AIRewriteClientProps) {
  const [bundle, setBundle] = useState<RewriteBundle>(EMPTY_BUNDLE);
  const [runtimeForm, setRuntimeForm] = useState<RuntimeFormState>(EMPTY_RUNTIME_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingRuntime, setIsSavingRuntime] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [form, setForm] = useState<FormState>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const primaryRouteByModelViewId = useMemo(() => {
    const routeMap = new Map<string, ModelRouteRow>();

    for (const route of bundle.modelRoutes) {
      if (!routeMap.has(route.model_view_id) && route.is_enabled && route.workflow_step_id === null) {
        routeMap.set(route.model_view_id, route);
      }
    }

    for (const route of bundle.modelRoutes) {
      if (!routeMap.has(route.model_view_id) && route.is_enabled) {
        routeMap.set(route.model_view_id, route);
      }
    }

    return routeMap;
  }, [bundle.modelRoutes]);

  const workflowGroups = useMemo(() => {
    const stepMap = new Map<string, WorkflowStepRow[]>();

    for (const step of bundle.workflowSteps) {
      const list = stepMap.get(step.workflow_id) ?? [];
      list.push(step);
      stepMap.set(step.workflow_id, list);
    }

    return bundle.workflows.map((workflow) => ({
      workflow,
      steps: stepMap.get(workflow.id) ?? [],
    }));
  }, [bundle.workflowSteps, bundle.workflows]);

  const modelViewItems = useMemo(
    () =>
      bundle.modelViews.map((row) => ({
        value: row.id,
        label: primaryRouteByModelViewId.get(row.id)?.actual_model ?? row.label,
      })),
    [bundle.modelViews, primaryRouteByModelViewId],
  );

  const workflowItems = useMemo(
    () => bundle.workflows.map((row) => ({ value: row.id, label: row.name })),
    [bundle.workflows],
  );

  const workflowStepItems = useMemo(
    () => [
      { value: NONE_VALUE, label: "不绑定步骤（通用）" },
      ...bundle.workflowSteps.map((row) => ({
        value: row.id,
        label: `${row.workflow?.name ?? "未知流程"} / ${row.name}`,
      })),
    ],
    [bundle.workflowSteps],
  );

  const lengthPresetItems = useMemo(
    () => [
      { value: NONE_VALUE, label: "跟随默认字数" },
      ...bundle.lengthPresets.map((row) => ({ value: row.id, label: row.name })),
    ],
    [bundle.lengthPresets],
  );

  const channelItems = useMemo(
    () => bundle.channels.map((row) => ({
      value: row.id,
      label: row.name + (row.is_enabled ? "" : "（已停用）"),
    })),
    [bundle.channels],
  );

  const optionalModelViewItems = useMemo(
    () => [{ value: NONE_VALUE, label: "不绑定，跟随顶部真实模型" }, ...modelViewItems],
    [modelViewItems],
  );

  async function loadBundle(silent = false) {
    if (silent) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    setError(null);

    try {
      const res = await fetch("/api/admin/ai-rewrite", { cache: "no-store" });
      const data = (await res.json()) as RewriteBundle & { error?: string };

      if (!res.ok || data.error) {
        throw new Error(data.error || "加载文案改写失败");
      }

      setBundle(data);
      setRuntimeForm({
        is_enabled: data.featureConfig?.is_enabled ?? true,
        output_token_limit: String(data.featureConfig?.output_token_limit ?? 3600),
        context_message_limit: String(data.featureConfig?.context_message_limit ?? 30),
      });
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "加载文案改写失败";
      setError(message);
      feedbackToast.error(message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  async function saveRuntimeSettings() {
    if (!bundle.featureConfig) {
      feedbackToast.error("缺少 content_rewrite 功能配置，暂时不能保存");
      return;
    }

    const outputTokenLimit = Number.parseInt(runtimeForm.output_token_limit, 10);
    const contextMessageLimit = Number.parseInt(runtimeForm.context_message_limit, 10);

    if (!Number.isFinite(outputTokenLimit) || outputTokenLimit < 1200) {
      feedbackToast.error("输出上限至少填 1200 tokens");
      return;
    }

    if (!Number.isFinite(contextMessageLimit) || contextMessageLimit < 1) {
      feedbackToast.error("上下文条数至少填 1");
      return;
    }

    setIsSavingRuntime(true);
    try {
      const res = await fetch("/api/admin/ai-rewrite", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "feature_config",
          id: bundle.featureConfig.id,
          is_enabled: runtimeForm.is_enabled,
          output_token_limit: outputTokenLimit,
          context_message_limit: contextMessageLimit,
        }),
      });
      const data = (await res.json()) as { bundle?: RewriteBundle; error?: string };
      if (!res.ok || data.error || !data.bundle) {
        throw new Error(data.error || "保存运行规则失败");
      }

      setBundle(data.bundle);
      setRuntimeForm({
        is_enabled: data.bundle.featureConfig?.is_enabled ?? true,
        output_token_limit: String(data.bundle.featureConfig?.output_token_limit ?? outputTokenLimit),
        context_message_limit: String(
          data.bundle.featureConfig?.context_message_limit ?? contextMessageLimit,
        ),
      });
      feedbackToast.success("运行规则已更新");
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "保存运行规则失败";
      feedbackToast.error(message);
    } finally {
      setIsSavingRuntime(false);
    }
  }

  useEffect(() => {
    void loadBundle();
  }, []);

  useEffect(() => {
    if (!activeSection) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveSection(null);
      }
    };

    const onClick = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        const isChip = (event.target as HTMLElement).closest("[data-rewrite-chip]");
        if (!isChip) {
          setActiveSection(null);
        }
      }
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [activeSection]);

  function setField(key: string, value: string | boolean) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function textField(key: string) {
    return String(form[key] ?? "");
  }

  function boolField(key: string, fallback = false) {
    return typeof form[key] === "boolean" ? Boolean(form[key]) : fallback;
  }

  function resetEditor(nextEditor: EditorState, nextForm: FormState) {
    setEditor(nextEditor);
    setForm(nextForm);
  }

  function closeEditor(force = false) {
    if (isSubmitting && !force) return;
    setEditor(null);
    setForm({});
  }

  function openFixedModeEditor(row?: FixedModeRow) {
    resetEditor(
      { kind: "fixed_mode", mode: row ? "edit" : "create" },
      {
        id: row?.id ?? "",
        key: row?.key ?? "",
        name: row?.name ?? "",
        description: row?.description ?? "",
        fixed_prompt: row?.fixed_prompt ?? "",
        model_view_id: row?.model_view_id ?? bundle.modelViews[0]?.id ?? "",
        length_preset_id: row?.length_preset_id ?? NONE_VALUE,
        sort_order: row ? String(row.sort_order) : nextSortOrder(bundle.fixedModes),
        is_enabled: row?.is_enabled ?? true,
      },
    );
  }

  function openRouteEditor(row?: ModelRouteRow) {
    resetEditor(
      { kind: "model_route", mode: row ? "edit" : "create" },
      {
        id: row?.id ?? "",
        model_view_id: row?.model_view_id ?? "",
        workflow_step_id: row?.workflow_step_id ?? NONE_VALUE,
        channel_id: row?.channel_id ?? bundle.channels[0]?.id ?? "",
        actual_model: row?.actual_model ?? row?.channel?.model ?? "",
        priority: row ? String(row.priority) : "100",
        weight: row ? String(row.weight) : "100",
        is_enabled: row?.is_enabled ?? true,
      },
    );
  }

  function openModeEditor(row?: ModeRow) {
    resetEditor(
      { kind: "mode", mode: row ? "edit" : "create" },
      {
        id: row?.id ?? "",
        key: row?.key ?? "",
        name: row?.name ?? "",
        description: row?.description ?? "",
        mode_prompt: row?.mode_prompt ?? "",
        sort_order: row ? String(row.sort_order) : nextSortOrder(bundle.modes),
        is_default: row?.is_default ?? false,
        is_enabled: row?.is_enabled ?? true,
      },
    );
  }

  function openLengthPresetEditor(row?: LengthPresetRow) {
    resetEditor(
      { kind: "length_preset", mode: row ? "edit" : "create" },
      {
        id: row?.id ?? "",
        key: row?.key ?? "",
        name: row?.name ?? "",
        description: row?.description ?? "",
        length_prompt: row?.length_prompt ?? "",
        sort_order: row ? String(row.sort_order) : nextSortOrder(bundle.lengthPresets),
        is_default: row?.is_default ?? false,
        is_enabled: row?.is_enabled ?? true,
      },
    );
  }

  function openWorkflowEditor(row?: WorkflowRow) {
    resetEditor(
      { kind: "workflow", mode: row ? "edit" : "create" },
      {
        id: row?.id ?? "",
        key: row?.key ?? "",
        name: row?.name ?? "",
        description: row?.description ?? "",
        sort_order: row ? String(row.sort_order) : nextSortOrder(bundle.workflows),
        is_default: row?.is_default ?? false,
        is_enabled: row?.is_enabled ?? true,
      },
    );
  }

  function openWorkflowStepEditor(row?: WorkflowStepRow, seed?: { workflowId?: string }) {
    resetEditor(
      { kind: "workflow_step", mode: row ? "edit" : "create" },
      {
        id: row?.id ?? "",
        workflow_id: row?.workflow_id ?? seed?.workflowId ?? bundle.workflows[0]?.id ?? "",
        model_view_id: row?.model_view_id ?? NONE_VALUE,
        step_key: row?.step_key ?? "",
        name: row?.name ?? "",
        description: row?.description ?? "",
        step_prompt: row?.step_prompt ?? "",
        sort_order: row ? String(row.sort_order) : nextSortOrder(bundle.workflowSteps),
        is_enabled: row?.is_enabled ?? true,
      },
    );
  }

  async function saveEditor() {
    if (!editor) return;

    const body: Record<string, unknown> = {
      entity: editor.kind,
    };

    if (editor.mode === "edit") {
      body.id = textField("id");
    }

    if (editor.kind === "fixed_mode") {
      body.key = textField("key");
      body.name = textField("name");
      body.description = textField("description");
      body.fixed_prompt = textField("fixed_prompt");
      body.model_view_id = textField("model_view_id");
      body.length_preset_id = textField("length_preset_id") === NONE_VALUE ? null : textField("length_preset_id");
      body.sort_order = textField("sort_order");
      body.is_enabled = boolField("is_enabled", true);
    }

    if (editor.kind === "model_route") {
      body.workflow_step_id = textField("workflow_step_id") === NONE_VALUE ? null : textField("workflow_step_id");
      body.channel_id = textField("channel_id");
      body.actual_model = textField("actual_model");
      body.priority = textField("priority");
      body.weight = textField("weight");
      body.is_enabled = boolField("is_enabled", true);
    }

    if (editor.kind === "mode") {
      body.key = textField("key");
      body.name = textField("name");
      body.description = textField("description");
      body.mode_prompt = textField("mode_prompt");
      body.sort_order = textField("sort_order");
      body.is_default = boolField("is_default");
      body.is_enabled = boolField("is_enabled", true);
    }

    if (editor.kind === "length_preset") {
      body.key = textField("key");
      body.name = textField("name");
      body.description = textField("description");
      body.length_prompt = textField("length_prompt");
      body.sort_order = textField("sort_order");
      body.is_default = boolField("is_default");
      body.is_enabled = boolField("is_enabled", true);
    }

    if (editor.kind === "workflow") {
      body.key = textField("key");
      body.name = textField("name");
      body.description = textField("description");
      body.sort_order = textField("sort_order");
      body.is_default = boolField("is_default");
      body.is_enabled = boolField("is_enabled", true);
    }

    if (editor.kind === "workflow_step") {
      body.workflow_id = textField("workflow_id");
      body.model_view_id = textField("model_view_id") === NONE_VALUE ? null : textField("model_view_id");
      body.step_key = textField("step_key");
      body.name = textField("name");
      body.description = textField("description");
      body.step_prompt = textField("step_prompt");
      body.sort_order = textField("sort_order");
      body.is_enabled = boolField("is_enabled", true);
    }

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/admin/ai-rewrite", {
        method: editor.mode === "create" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string; bundle?: RewriteBundle };

      if (!res.ok || data.error || !data.bundle) {
        throw new Error(data.error || "保存失败");
      }

      setBundle(data.bundle);
      closeEditor(true);
      feedbackToast.success(editor.mode === "create" ? "已新增配置" : "已更新配置");
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "保存失败";
      feedbackToast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function toggleEntity(kind: EditorKind, row: { id: string; is_enabled: boolean }) {
    setBusyKey(`${kind}:${row.id}`);

    try {
      const res = await fetch("/api/admin/ai-rewrite", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: kind,
          id: row.id,
          is_enabled: !row.is_enabled,
        }),
      });
      const data = (await res.json()) as { error?: string; bundle?: RewriteBundle };

      if (!res.ok || data.error || !data.bundle) {
        throw new Error(data.error || "状态更新失败");
      }

      setBundle(data.bundle);
      feedbackToast.success(row.is_enabled ? "已停用" : "已启用");
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "状态更新失败";
      feedbackToast.error(message);
    } finally {
      setBusyKey(null);
    }
  }

  const editorTitleMap: Record<EditorKind, { create: string; edit: string; description: string }> = {
    fixed_mode: {
      create: "新增固定能力套餐",
      edit: "编辑固定能力套餐",
      description: "这里控制员工端顶部两个固定按钮绑定到哪条真实模型和哪段固定提示词。",
    },
    model_route: {
      create: "新增真实模型",
      edit: "编辑真实模型",
      description: "直接配置员工端可选的真实模型：选择渠道，填写具体模型名。",
    },
    mode: {
      create: "新增模式",
      edit: "编辑模式",
      description: "模式是员工端可选的改写风格，会拼进系统提示词。",
    },
    length_preset: {
      create: "新增字数预设",
      edit: "编辑字数预设",
      description: "字数预设控制输出长短，不改员工页结构。",
    },
    workflow: {
      create: "新增自动流程",
      edit: "编辑自动流程",
      description: "自动流程决定多步骤改写怎么跑，默认流程优先保证能用。",
    },
    workflow_step: {
      create: "新增流程步骤",
      edit: "编辑流程步骤",
      description: "步骤级可以单独绑定真实模型，这是自动模式保留的高级配置。",
    },
  };

  const activeEditorMeta = editor ? editorTitleMap[editor.kind] : null;
  const isSectionActive = (sectionKey: RewriteSectionKey) => (!embedded ? true : activeSection === sectionKey);
  const handleSectionToggle = (sectionKey: RewriteSectionKey) => {
    setActiveSection((current) => (current === sectionKey ? null : sectionKey));
  };
  const embeddedSections: Array<{
    key: RewriteSectionKey;
    icon: typeof Sparkles;
    label: string;
    chipCount: string | null;
    summary: string;
  }> = [
    {
      key: "runtime",
      icon: Settings2,
      label: "运行规则",
      chipCount: null,
      summary: "输出上限与上下文规则",
    },
    {
      key: "fixedModes",
      icon: Bot,
      label: "固定套餐",
      chipCount: String(bundle.fixedModes.length),
      summary: `共 ${bundle.fixedModes.length} 项 · ${bundle.fixedModes.filter((row) => row.is_enabled).length} 启用`,
    },
    {
      key: "modelRoutes",
      icon: Route,
      label: "真实模型",
      chipCount: String(bundle.modelRoutes.length),
      summary: `共 ${bundle.modelRoutes.length} 条 · ${bundle.modelRoutes.filter((row) => row.is_enabled).length} 启用`,
    },
    {
      key: "modes",
      icon: Sparkles,
      label: "模式",
      chipCount: String(bundle.modes.length),
      summary: `共 ${bundle.modes.length} 项 · ${bundle.modes.filter((row) => row.is_enabled).length} 启用`,
    },
    {
      key: "lengthPresets",
      icon: Ruler,
      label: "字数",
      chipCount: String(bundle.lengthPresets.length),
      summary: `共 ${bundle.lengthPresets.length} 项 · ${bundle.lengthPresets.filter((row) => row.is_enabled).length} 启用`,
    },
    {
      key: "workflows",
      icon: GitBranch,
      label: "自动流程",
      chipCount: String(bundle.workflows.length),
      summary: `共 ${bundle.workflows.length} 个流程 · ${bundle.workflowSteps.length} 个步骤`,
    },
  ];
  const activeSectionMeta = activeSection
    ? embeddedSections.find((section) => section.key === activeSection) ?? null
    : null;
  const ActiveSectionIcon = activeSectionMeta?.icon;

  function renderEmbeddedPanelAction(sectionKey: RewriteSectionKey) {
    if (sectionKey === "runtime") {
      return (
        <Button onClick={() => void saveRuntimeSettings()} disabled={isSavingRuntime || !bundle.featureConfig}>
          {isSavingRuntime ? <Skeleton className="size-4 rounded-full" /> : null}
          保存运行规则
        </Button>
      );
    }

    if (sectionKey === "fixedModes") {
      return (
        <Button size="sm" onClick={() => openFixedModeEditor()} disabled={bundle.fixedModes.length >= 2}>
          <Plus className="size-4" />
          新增固定套餐
        </Button>
      );
    }

    if (sectionKey === "modelRoutes") {
      return (
        <Button size="sm" onClick={() => openRouteEditor()} disabled={bundle.channels.length === 0}>
          <Plus className="size-4" />
          新增真实模型
        </Button>
      );
    }

    if (sectionKey === "modes") {
      return (
        <Button size="sm" onClick={() => openModeEditor()}>
          <Plus className="size-4" />
          新增模式
        </Button>
      );
    }

    if (sectionKey === "lengthPresets") {
      return (
        <Button size="sm" onClick={() => openLengthPresetEditor()}>
          <Plus className="size-4" />
          新增字数预设
        </Button>
      );
    }

    return (
      <Button size="sm" onClick={() => openWorkflowEditor()}>
        <Plus className="size-4" />
        新增流程
      </Button>
    );
  }

  function renderEmbeddedSectionContent(sectionKey: RewriteSectionKey) {
    if (sectionKey === "runtime") {
      return (
        <div className="grid gap-4 lg:grid-cols-[1.3fr,1fr,1fr]">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm leading-6 text-zinc-500">
            <p className="font-medium text-zinc-800">当前固定规则</p>
            <p className="mt-2">1. 首条默认结果模式，只出 1 个主版本。</p>
            <p>2. 第二轮开始固定聊天模式，不再返回版本卡。</p>
            <p>3. 顶部强框架 / 强语感 / 真实模型 / 普通模式会自动清空并锁定。</p>
          </div>

          <label className="space-y-2">
            <span className="text-sm font-medium text-zinc-800">输出上限</span>
            <Input
              value={runtimeForm.output_token_limit}
              onChange={(event) => setRuntimeForm((prev) => ({ ...prev, output_token_limit: event.target.value }))}
              inputMode="numeric"
            />
            <p className="text-xs text-zinc-500">
              现在填的是 {runtimeForm.output_token_limit || "0"} tokens，约等于{" "}
              {estimateChars(Number.parseInt(runtimeForm.output_token_limit || "0", 10) || 0)} 个汉字。
            </p>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-zinc-800">上下文条数</span>
            <Input
              value={runtimeForm.context_message_limit}
              onChange={(event) =>
                setRuntimeForm((prev) => ({ ...prev, context_message_limit: event.target.value }))
              }
              inputMode="numeric"
            />
            <p className="text-xs text-zinc-500">
              最近保留多少条历史消息。系统内部仍会额外做总长度安全截断，避免请求被拖死。
            </p>
          </label>
        </div>
      );
    }

    if (sectionKey === "fixedModes") {
      return bundle.fixedModes.length === 0 ? (
        <EmptyBlock
          title="还没有固定套餐"
          description="建议至少建“强框架模式”和“强语感模式”两项。"
          actionLabel="新增固定套餐"
          onAction={() => openFixedModeEditor()}
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {bundle.fixedModes.map((row) => (
            <Card key={row.id} size="sm" className="border-zinc-200 bg-white">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle className="text-[18px] font-medium tracking-tight">{row.name}</CardTitle>
                    <CardDescription>{row.description || "—"}</CardDescription>
                  </div>
                  {getStatusBadge(row.is_enabled)}
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-zinc-500">
                <div className="grid gap-2 text-xs">
                  <div className="rounded-2xl bg-zinc-50 px-3 py-2">
                    <span className="font-semibold text-zinc-800">key：</span>
                    <span className="font-mono">{row.key}</span>
                  </div>
                  <div className="rounded-2xl bg-zinc-50 px-3 py-2">
                    <span className="font-semibold text-zinc-800">绑定真实模型：</span>
                    {primaryRouteByModelViewId.get(row.model_view_id)?.actual_model ?? row.model_view?.label ?? "未绑定"}
                  </div>
                  <div className="rounded-2xl bg-zinc-50 px-3 py-2">
                    <span className="font-semibold text-zinc-800">固定字数：</span>
                    {row.length_preset?.name ?? "跟随默认字数"}
                  </div>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm leading-6 text-zinc-800">
                  {row.fixed_prompt}
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => openFixedModeEditor(row)}>
                    <Pencil className="size-4" />
                    编辑
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void toggleEntity("fixed_mode", row)}
                    disabled={busyKey === `fixed_mode:${row.id}`}
                  >
                    {busyKey === `fixed_mode:${row.id}` ? <Skeleton className="size-4 rounded-full" /> : null}
                    {row.is_enabled ? "停用" : "启用"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      );
    }

    if (sectionKey === "modelRoutes") {
      return bundle.modelRoutes.length === 0 ? (
        <EmptyBlock
          title="还没有真实模型"
          description="先新增一条真实模型，选择渠道并填写 actual_model。后台会自动维护旧表需要的内部 ID。"
          actionLabel={bundle.channels.length > 0 ? "新增真实模型" : undefined}
          onAction={bundle.channels.length > 0 ? () => openRouteEditor() : undefined}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>真实模型</TableHead>
              <TableHead>渠道</TableHead>
              <TableHead>步骤绑定</TableHead>
              <TableHead>优先级</TableHead>
              <TableHead>权重</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bundle.modelRoutes.map((row) => (
              <TableRow key={row.id} className="group">
                <TableCell className="font-mono text-xs text-zinc-700">{row.actual_model}</TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <div className="font-medium text-zinc-800">{row.channel?.name ?? "已丢失渠道"}</div>
                    <div className="text-xs text-zinc-500">{getRouteChannelStatus(row)}</div>
                  </div>
                </TableCell>
                <TableCell className="max-w-[220px] whitespace-normal text-sm text-zinc-500">
                  {row.workflow_step ? `${row.workflow_step.name} (${row.workflow_step.step_key})` : "通用"}
                </TableCell>
                <TableCell>{row.priority}</TableCell>
                <TableCell>{row.weight}</TableCell>
                <TableCell>{getStatusBadge(row.is_enabled)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <Button variant="outline" size="sm" onClick={() => openRouteEditor(row)}>
                      <Pencil className="size-4" />
                      编辑
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void toggleEntity("model_route", row)}
                      disabled={busyKey === `model_route:${row.id}`}
                    >
                      {busyKey === `model_route:${row.id}` ? <Skeleton className="size-4 rounded-full" /> : null}
                      {row.is_enabled ? "停用" : "启用"}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      );
    }

    if (sectionKey === "modes") {
      return bundle.modes.length === 0 ? (
        <EmptyBlock
          title="还没有模式"
          description="可以先只留默认空模式，后面再逐步补充。"
          actionLabel="新增模式"
          onAction={() => openModeEditor()}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>key</TableHead>
              <TableHead>排序</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bundle.modes.map((row) => (
              <TableRow key={row.id} className="group">
                <TableCell>
                  <div className="space-y-1">
                    <div className="font-medium text-zinc-800">{row.name}</div>
                    <div className="max-w-[260px] whitespace-normal text-xs text-zinc-500">
                      {row.description || "—"}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs text-zinc-500">{row.key}</TableCell>
                <TableCell>{row.sort_order}</TableCell>
                <TableCell>{getStatusBadge(row.is_enabled, row.is_default)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <Button variant="outline" size="sm" onClick={() => openModeEditor(row)}>
                      <Pencil className="size-4" />
                      编辑
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void toggleEntity("mode", row)}
                      disabled={busyKey === `mode:${row.id}`}
                    >
                      {busyKey === `mode:${row.id}` ? <Skeleton className="size-4 rounded-full" /> : null}
                      {row.is_enabled ? "停用" : "启用"}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      );
    }

    if (sectionKey === "lengthPresets") {
      return bundle.lengthPresets.length === 0 ? (
        <EmptyBlock
          title="还没有字数预设"
          description="至少配一个默认值，员工页才能稳定回填。"
          actionLabel="新增字数预设"
          onAction={() => openLengthPresetEditor()}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>key</TableHead>
              <TableHead>排序</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bundle.lengthPresets.map((row) => (
              <TableRow key={row.id} className="group">
                <TableCell>
                  <div className="space-y-1">
                    <div className="font-medium text-zinc-800">{row.name}</div>
                    <div className="max-w-[260px] whitespace-normal text-xs text-zinc-500">
                      {row.description || "—"}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs text-zinc-500">{row.key}</TableCell>
                <TableCell>{row.sort_order}</TableCell>
                <TableCell>{getStatusBadge(row.is_enabled, row.is_default)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <Button variant="outline" size="sm" onClick={() => openLengthPresetEditor(row)}>
                      <Pencil className="size-4" />
                      编辑
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void toggleEntity("length_preset", row)}
                      disabled={busyKey === `length_preset:${row.id}`}
                    >
                      {busyKey === `length_preset:${row.id}` ? <Skeleton className="size-4 rounded-full" /> : null}
                      {row.is_enabled ? "停用" : "启用"}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      );
    }

    return workflowGroups.length === 0 ? (
      <EmptyBlock
        title="还没有自动流程"
        description="先补一个默认流程，自动模式才有稳定路线。"
        actionLabel="新增流程"
        onAction={() => openWorkflowEditor()}
      />
    ) : (
      <div className="space-y-4">
        {workflowGroups.map(({ workflow, steps }) => (
          <Card key={workflow.id} size="sm" className="border-zinc-200 bg-white">
            <CardHeader className="border-b border-zinc-200">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-[18px] font-medium">{workflow.name}</CardTitle>
                    {getStatusBadge(workflow.is_enabled, workflow.is_default)}
                    <Badge variant="outline" className="font-mono text-xs">
                      {workflow.key}
                    </Badge>
                  </div>
                  <CardDescription>{workflow.description || "暂无流程说明"}</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => openWorkflowEditor(workflow)}>
                    <Pencil className="size-4" />
                    编辑流程
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void toggleEntity("workflow", workflow)}
                    disabled={busyKey === `workflow:${workflow.id}`}
                  >
                    {busyKey === `workflow:${workflow.id}` ? <Skeleton className="size-4 rounded-full" /> : null}
                    {workflow.is_enabled ? "停用" : "启用"}
                  </Button>
                  <Button size="sm" onClick={() => openWorkflowStepEditor(undefined, { workflowId: workflow.id })}>
                    <Plus className="size-4" />
                    新增步骤
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {steps.length === 0 ? (
                <EmptyBlock
                  title="当前流程还没有步骤"
                  description="至少补一个步骤，自动模式才能把流程真正跑起来。"
                  actionLabel="新增步骤"
                  onAction={() => openWorkflowStepEditor(undefined, { workflowId: workflow.id })}
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>步骤</TableHead>
                      <TableHead>step_key</TableHead>
                      <TableHead>绑定真实模型</TableHead>
                      <TableHead>排序</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {steps.map((step) => (
                      <TableRow key={step.id} className="group">
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium text-zinc-800">{step.name}</div>
                            <div className="max-w-[320px] whitespace-normal text-xs text-zinc-500">
                              {step.description || "—"}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-zinc-500">{step.step_key}</TableCell>
                        <TableCell>
                          {step.model_view_id
                            ? primaryRouteByModelViewId.get(step.model_view_id)?.actual_model ?? step.model_view?.label ?? "未绑定"
                            : "跟随顶部真实模型"}
                        </TableCell>
                        <TableCell>{step.sort_order}</TableCell>
                        <TableCell>{getStatusBadge(step.is_enabled)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                            <Button variant="outline" size="sm" onClick={() => openWorkflowStepEditor(step)}>
                              <Pencil className="size-4" />
                              编辑
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void toggleEntity("workflow_step", step)}
                              disabled={busyKey === `workflow_step:${step.id}`}
                            >
                              {busyKey === `workflow_step:${step.id}` ? <Skeleton className="size-4 rounded-full" /> : null}
                              {step.is_enabled ? "停用" : "启用"}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className={embedded ? "contents" : "space-y-6"}>
      {embedded ? (
        <div className="relative flex flex-wrap items-center justify-end gap-1.5">
          {embeddedSections.map((section) => {
            const Icon = section.icon;
            const isActive = activeSection === section.key;

            return (
              <button
                key={section.key}
                type="button"
                data-rewrite-chip="true"
                aria-expanded={isActive}
                aria-pressed={isActive}
                disabled={isLoading}
                onClick={() => handleSectionToggle(section.key)}
                className={cn(
                  "group relative inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 pl-3.5 text-[12px] font-medium transition-colors duration-150 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60",
                  isActive
                    ? "border-[#D97757]/40 bg-white text-[#D97757]"
                    : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-800",
                )}
              >
                <span
                  className={cn(
                    "absolute bottom-1.5 left-0 top-1.5 w-1 rounded-r-full transition-colors",
                    isActive ? "bg-[#D97757]" : "bg-transparent",
                  )}
                  aria-hidden
                />
                <Icon className="size-3.5" />
                <span>{section.label}</span>
                {section.chipCount ? (
                  <span
                    className={cn(
                      "tabular-nums text-[11px]",
                      isActive ? "text-[#D97757]/70" : "text-zinc-400",
                    )}
                  >
                    {section.chipCount}
                  </span>
                ) : null}
              </button>
            );
          })}

          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadBundle(true)}
            disabled={isRefreshing || isLoading}
          >
            {isRefreshing ? <Skeleton className="size-4 rounded-full" /> : <RefreshCw className="size-4" />}
            刷新配置
          </Button>

          <AnimatePresence>
            {activeSection && activeSectionMeta ? (
              <motion.div
                key={activeSection}
                ref={panelRef}
                initial={{ opacity: 0, scale: 0.96, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: -4 }}
                transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
                style={{ transformOrigin: "top right" }}
                className="absolute right-0 top-full z-30 mt-2 w-[min(720px,calc(100vw-3rem))] origin-top-right rounded-2xl border border-zinc-200 bg-white p-5 ring-1 ring-foreground/10 shadow-sm"
              >
                <div className="flex flex-col gap-3 border-b border-zinc-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-semibold tracking-tight text-zinc-900">
                      {ActiveSectionIcon ? <ActiveSectionIcon className="size-4 text-[#D97757]" /> : null}
                      <span>{activeSectionMeta.label}</span>
                    </div>
                    <p className="text-xs text-zinc-500">{activeSectionMeta.summary}</p>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    {renderEmbeddedPanelAction(activeSectionMeta.key)}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setActiveSection(null)}
                      className="size-8 rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                    >
                      <X className="size-4" />
                      <span className="sr-only">关闭</span>
                    </Button>
                  </div>
                </div>

                <div className="mt-4 max-h-[70vh] overflow-y-auto pr-1">
                  {renderEmbeddedSectionContent(activeSectionMeta.key)}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      ) : null}

      {embedded ? null : (
        <section className="grid gap-4 lg:grid-cols-4">
          <SummaryCard
            icon={Bot}
            label="固定套餐"
            value={String(bundle.fixedModes.length)}
            hint="顶部两个强能力按钮"
          />
          <SummaryCard
            icon={Route}
            label="真实模型"
            value={String(bundle.modelRoutes.length)}
            hint="员工端实际可选模型"
          />
          <SummaryCard
            icon={Settings2}
            label="普通配置"
            value={String(bundle.modes.length + bundle.lengthPresets.length)}
            hint="普通模式与字数预设"
          />
          <SummaryCard
            icon={Workflow}
            label="自动流程"
            value={String(bundle.workflowSteps.length)}
            hint="总步骤数，含步骤级模型绑定"
          />
        </section>
      )}

      {embedded ? null : (
        <Card className="border-zinc-200 bg-white">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="font-semibold tracking-tight">配置说明</CardTitle>
                <CardDescription className="mt-1">
                  这页只做 owner 的文案改写后台配置。员工端现在直接按真实模型展示。
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => void loadBundle(true)} disabled={isRefreshing || isLoading}>
                {isRefreshing ? <Skeleton className="size-4 rounded-full" /> : <RefreshCw className="size-4" />}
                刷新配置
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-zinc-500">
            <p>首条消息固定走结果模式，默认只出 1 个主版本；第二轮开始固定进入正常聊天，不再回版本卡。</p>
            <p>最关键的是先确认“固定套餐 → 真实模型”能对应到可用渠道，再确认输出上限和上下文条数是否符合线上体验。</p>
          </CardContent>
        </Card>
      )}

      {embedded ? null : (
        <Card className="border-zinc-200 bg-white">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <button
                type="button"
                onClick={() => handleSectionToggle("runtime")}
                className="flex flex-1 items-start gap-2 text-left transition-colors hover:opacity-80"
                aria-expanded={isSectionActive("runtime")}
              >
                <ChevronDown
                  className={cn(
                    "mt-1 size-4 shrink-0 stroke-[1.5] text-zinc-400 transition-transform duration-150",
                    isSectionActive("runtime") ? "" : "-rotate-90",
                  )}
                  aria-hidden
                />
                <div className="flex-1">
                  <CardTitle className="flex items-center gap-2 font-semibold tracking-tight">
                    <Ruler className="size-4 text-zinc-800" />
                    运行规则
                  </CardTitle>
                  <CardDescription className="mt-1">
                    输出 {runtimeForm.output_token_limit || "—"} tokens · 上下文 {runtimeForm.context_message_limit || "—"} 条
                  </CardDescription>
                </div>
              </button>
              {isSectionActive("runtime") ? (
                <Button onClick={() => void saveRuntimeSettings()} disabled={isSavingRuntime || !bundle.featureConfig}>
                  {isSavingRuntime ? <Skeleton className="size-4 rounded-full" /> : null}
                  保存运行规则
                </Button>
              ) : null}
            </div>
          </CardHeader>
          {isSectionActive("runtime") ? <CardContent>{renderEmbeddedSectionContent("runtime")}</CardContent> : null}
        </Card>
      )}

      {error ? (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-8 text-sm text-zinc-500">
          <Skeleton className="size-4 rounded-full" />
          正在加载文案改写...
        </div>
      ) : embedded ? null : (
        <div className="space-y-6">
              <Card className="border-zinc-200 bg-white">
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <button
                      type="button"
                      onClick={() => handleSectionToggle("fixedModes")}
                      className="flex flex-1 items-start gap-2 text-left transition-colors hover:opacity-80"
                      aria-expanded={isSectionActive("fixedModes")}
                    >
                      <ChevronDown
                        className={cn(
                          "mt-1 size-4 shrink-0 stroke-[1.5] text-zinc-400 transition-transform duration-150",
                          isSectionActive("fixedModes") ? "" : "-rotate-90",
                        )}
                        aria-hidden
                      />
                      <div className="flex-1">
                        <CardTitle className="flex items-center gap-2 font-semibold tracking-tight">
                          <Sparkles className="size-4 text-zinc-800" />
                          固定能力套餐
                        </CardTitle>
                        <CardDescription className="mt-1">
                          共 {bundle.fixedModes.length} 项 · {bundle.fixedModes.filter((row) => row.is_enabled).length} 启用
                        </CardDescription>
                      </div>
                    </button>
                    {isSectionActive("fixedModes") ? (
                      <Button size="sm" onClick={() => openFixedModeEditor()} disabled={bundle.fixedModes.length >= 2}>
                        <Plus className="size-4" />
                        新增固定套餐
                      </Button>
                    ) : null}
                  </div>
                </CardHeader>
                {isSectionActive("fixedModes") ? <CardContent>{renderEmbeddedSectionContent("fixedModes")}</CardContent> : null}
              </Card>

              <Card className="border-zinc-200 bg-white">
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <button
                      type="button"
                      onClick={() => handleSectionToggle("modelRoutes")}
                      className="flex flex-1 items-start gap-2 text-left transition-colors hover:opacity-80"
                      aria-expanded={isSectionActive("modelRoutes")}
                    >
                      <ChevronDown
                        className={cn(
                          "mt-1 size-4 shrink-0 stroke-[1.5] text-zinc-400 transition-transform duration-150",
                          isSectionActive("modelRoutes") ? "" : "-rotate-90",
                        )}
                        aria-hidden
                      />
                      <div className="flex-1">
                        <CardTitle className="flex items-center gap-2 font-semibold tracking-tight">
                          <Route className="size-4 text-zinc-800" />
                          真实模型
                        </CardTitle>
                        <CardDescription className="mt-1">
                          共 {bundle.modelRoutes.length} 条 · {bundle.modelRoutes.filter((row) => row.is_enabled).length} 启用
                        </CardDescription>
                      </div>
                    </button>
                    {isSectionActive("modelRoutes") ? (
                      <Button size="sm" onClick={() => openRouteEditor()} disabled={bundle.channels.length === 0}>
                        <Plus className="size-4" />
                        新增真实模型
                      </Button>
                    ) : null}
                  </div>
                </CardHeader>
                {isSectionActive("modelRoutes") ? (
                  <CardContent className="space-y-4">{renderEmbeddedSectionContent("modelRoutes")}</CardContent>
                ) : null}
              </Card>

              <div className="grid gap-6 xl:grid-cols-2">
                <Card className="border-zinc-200 bg-white">
                  <CardHeader>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <button
                        type="button"
                        onClick={() => handleSectionToggle("modes")}
                        className="flex flex-1 items-start gap-2 text-left transition-colors hover:opacity-80"
                        aria-expanded={isSectionActive("modes")}
                      >
                        <ChevronDown
                          className={cn(
                            "mt-1 size-4 shrink-0 stroke-[1.5] text-zinc-400 transition-transform duration-150",
                            isSectionActive("modes") ? "" : "-rotate-90",
                          )}
                          aria-hidden
                        />
                        <div className="flex-1">
                          <CardTitle className="flex items-center gap-2 font-semibold tracking-tight">
                            <Sparkles className="size-4 text-zinc-800" />
                            模式
                          </CardTitle>
                          <CardDescription className="mt-1">
                            共 {bundle.modes.length} 项 · {bundle.modes.filter((row) => row.is_enabled).length} 启用
                          </CardDescription>
                        </div>
                      </button>
                      {isSectionActive("modes") ? (
                        <Button size="sm" onClick={() => openModeEditor()}>
                          <Plus className="size-4" />
                          新增模式
                        </Button>
                      ) : null}
                    </div>
                  </CardHeader>
                  {isSectionActive("modes") ? <CardContent>{renderEmbeddedSectionContent("modes")}</CardContent> : null}
                </Card>

                <Card className="border-zinc-200 bg-white">
                  <CardHeader>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <button
                        type="button"
                        onClick={() => handleSectionToggle("lengthPresets")}
                        className="flex flex-1 items-start gap-2 text-left transition-colors hover:opacity-80"
                        aria-expanded={isSectionActive("lengthPresets")}
                      >
                        <ChevronDown
                          className={cn(
                            "mt-1 size-4 shrink-0 stroke-[1.5] text-zinc-400 transition-transform duration-150",
                            isSectionActive("lengthPresets") ? "" : "-rotate-90",
                          )}
                          aria-hidden
                        />
                        <div className="flex-1">
                          <CardTitle className="flex items-center gap-2 font-semibold tracking-tight">
                            <Ruler className="size-4 text-zinc-800" />
                            字数预设
                          </CardTitle>
                          <CardDescription className="mt-1">
                            共 {bundle.lengthPresets.length} 项 · {bundle.lengthPresets.filter((row) => row.is_enabled).length} 启用
                          </CardDescription>
                        </div>
                      </button>
                      {isSectionActive("lengthPresets") ? (
                        <Button size="sm" onClick={() => openLengthPresetEditor()}>
                          <Plus className="size-4" />
                          新增字数预设
                        </Button>
                      ) : null}
                    </div>
                  </CardHeader>
                  {isSectionActive("lengthPresets") ? (
                    <CardContent>{renderEmbeddedSectionContent("lengthPresets")}</CardContent>
                  ) : null}
                </Card>
              </div>

              <Card className="border-zinc-200 bg-white">
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <button
                      type="button"
                      onClick={() => handleSectionToggle("workflows")}
                      className="flex flex-1 items-start gap-2 text-left transition-colors hover:opacity-80"
                      aria-expanded={isSectionActive("workflows")}
                    >
                      <ChevronDown
                        className={cn(
                          "mt-1 size-4 shrink-0 stroke-[1.5] text-zinc-400 transition-transform duration-150",
                          isSectionActive("workflows") ? "" : "-rotate-90",
                        )}
                        aria-hidden
                      />
                      <div className="flex-1">
                        <CardTitle className="flex items-center gap-2 font-semibold tracking-tight">
                          <GitBranch className="size-4 text-zinc-800" />
                          自动流程与步骤
                        </CardTitle>
                        <CardDescription className="mt-1">
                          共 {bundle.workflows.length} 个流程 · {bundle.workflowSteps.length} 个步骤
                        </CardDescription>
                      </div>
                    </button>
                    {isSectionActive("workflows") ? (
                      <Button size="sm" onClick={() => openWorkflowEditor()}>
                        <Plus className="size-4" />
                        新增流程
                      </Button>
                    ) : null}
                  </div>
                </CardHeader>
                {isSectionActive("workflows") ? (
                  <CardContent className="space-y-4">{renderEmbeddedSectionContent("workflows")}</CardContent>
                ) : null}
              </Card>
        </div>
      )}

      <Sheet open={Boolean(editor)} onOpenChange={(open) => (!open ? closeEditor() : null)}>
        <SheetContent side="right" className="w-full max-w-3xl">
          <SheetHeader>
            <SheetTitle>{activeEditorMeta ? activeEditorMeta[editor?.mode ?? "create"] : "编辑配置"}</SheetTitle>
            <SheetDescription>{activeEditorMeta?.description}</SheetDescription>
          </SheetHeader>
          <SheetBody>

          {editor?.kind === "fixed_mode" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="fixed-mode-key">key</Label>
                <Input id="fixed-mode-key" value={textField("key")} onChange={(e) => setField("key", e.target.value)} placeholder="如 strong_framework" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fixed-mode-name">名称</Label>
                <Input id="fixed-mode-name" value={textField("name")} onChange={(e) => setField("name", e.target.value)} placeholder="如 强框架模式" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="fixed-mode-description">说明</Label>
                <Input id="fixed-mode-description" value={textField("description")} onChange={(e) => setField("description", e.target.value)} placeholder="员工按钮下方的简短说明" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fixed-mode-model-view">绑定真实模型</Label>
                <Select
                  value={textField("model_view_id")}
                  onValueChange={(value) => setField("model_view_id", value ?? "")}
                  items={modelViewItems}
                >
                  <SelectTrigger id="fixed-mode-model-view" className="w-full rounded-2xl bg-white">
                    <SelectValue placeholder="选择真实模型" />
                  </SelectTrigger>
                  <SelectContent>
                    {bundle.modelViews.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {primaryRouteByModelViewId.get(row.id)?.actual_model ?? row.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fixed-mode-length">固定字数</Label>
                <Select
                  value={textField("length_preset_id") || NONE_VALUE}
                  onValueChange={(value) => setField("length_preset_id", value ?? NONE_VALUE)}
                  items={lengthPresetItems}
                >
                  <SelectTrigger id="fixed-mode-length" className="w-full rounded-2xl bg-white">
                    <SelectValue placeholder="可选，不填则跟随默认" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>跟随默认字数</SelectItem>
                    {bundle.lengthPresets.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="fixed-mode-prompt">固定提示词</Label>
                <Textarea id="fixed-mode-prompt" value={textField("fixed_prompt")} onChange={(e) => setField("fixed_prompt", e.target.value)} className="min-h-32" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fixed-mode-sort">排序</Label>
                <Input id="fixed-mode-sort" value={textField("sort_order")} onChange={(e) => setField("sort_order", e.target.value)} inputMode="numeric" />
              </div>
              <div className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-zinc-800">启用</span>
                  <Switch checked={boolField("is_enabled", true)} onCheckedChange={(value) => setField("is_enabled", value)} />
                </div>
              </div>
            </div>
          ) : null}

          {editor?.kind === "model_route" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="route-workflow-step">步骤绑定</Label>
                <Select
                  value={textField("workflow_step_id") || NONE_VALUE}
                  onValueChange={(value) => setField("workflow_step_id", value ?? NONE_VALUE)}
                  items={workflowStepItems}
                >
                  <SelectTrigger id="route-workflow-step" className="w-full rounded-2xl bg-white">
                    <SelectValue placeholder="可不绑步骤" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>不绑定步骤（通用）</SelectItem>
                    {bundle.workflowSteps.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {(row.workflow?.name ?? "未知流程") + " / " + row.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="route-channel">渠道</Label>
                <Select
                  value={textField("channel_id")}
                  onValueChange={(value) => setField("channel_id", value ?? "")}
                  items={channelItems}
                >
                  <SelectTrigger id="route-channel" className="w-full rounded-2xl bg-white">
                    <SelectValue placeholder="选择渠道" />
                  </SelectTrigger>
                  <SelectContent>
                    {bundle.channels.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.name + (row.is_enabled ? "" : "（已停用）")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="route-actual-model">真实模型</Label>
                <Input id="route-actual-model" value={textField("actual_model")} onChange={(e) => setField("actual_model", e.target.value)} placeholder="如 claude-opus-4-6" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="route-priority">优先级</Label>
                <Input id="route-priority" value={textField("priority")} onChange={(e) => setField("priority", e.target.value)} inputMode="numeric" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="route-weight">权重</Label>
                <Input id="route-weight" value={textField("weight")} onChange={(e) => setField("weight", e.target.value)} inputMode="numeric" />
              </div>
              <div className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 md:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-zinc-800">启用这个真实模型</span>
                  <Switch checked={boolField("is_enabled", true)} onCheckedChange={(value) => setField("is_enabled", value)} />
                </div>
              </div>
            </div>
          ) : null}

          {editor?.kind === "mode" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="mode-key">key</Label>
                <Input id="mode-key" value={textField("key")} onChange={(e) => setField("key", e.target.value)} placeholder="如 more_explosive" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mode-name">名称</Label>
                <Input id="mode-name" value={textField("name")} onChange={(e) => setField("name", e.target.value)} placeholder="如 更像爆款" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="mode-description">说明</Label>
                <Input id="mode-description" value={textField("description")} onChange={(e) => setField("description", e.target.value)} placeholder="员工看到的简短说明" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="mode-prompt">模式提示词</Label>
                <Textarea id="mode-prompt" value={textField("mode_prompt")} onChange={(e) => setField("mode_prompt", e.target.value)} className="min-h-32" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mode-sort">排序</Label>
                <Input id="mode-sort" value={textField("sort_order")} onChange={(e) => setField("sort_order", e.target.value)} inputMode="numeric" />
              </div>
              <div className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-zinc-800">设为默认</span>
                  <Switch checked={boolField("is_default")} onCheckedChange={(value) => setField("is_default", value)} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-zinc-800">启用</span>
                  <Switch checked={boolField("is_enabled", true)} onCheckedChange={(value) => setField("is_enabled", value)} />
                </div>
              </div>
            </div>
          ) : null}

          {editor?.kind === "length_preset" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="length-key">key</Label>
                <Input id="length-key" value={textField("key")} onChange={(e) => setField("key", e.target.value)} placeholder="如 concise" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="length-name">名称</Label>
                <Input id="length-name" value={textField("name")} onChange={(e) => setField("name", e.target.value)} placeholder="如 精简" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="length-description">说明</Label>
                <Input id="length-description" value={textField("description")} onChange={(e) => setField("description", e.target.value)} placeholder="员工看到的简短说明" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="length-prompt">字数提示词</Label>
                <Textarea id="length-prompt" value={textField("length_prompt")} onChange={(e) => setField("length_prompt", e.target.value)} className="min-h-32" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="length-sort">排序</Label>
                <Input id="length-sort" value={textField("sort_order")} onChange={(e) => setField("sort_order", e.target.value)} inputMode="numeric" />
              </div>
              <div className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-zinc-800">设为默认</span>
                  <Switch checked={boolField("is_default")} onCheckedChange={(value) => setField("is_default", value)} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-zinc-800">启用</span>
                  <Switch checked={boolField("is_enabled", true)} onCheckedChange={(value) => setField("is_enabled", value)} />
                </div>
              </div>
            </div>
          ) : null}

          {editor?.kind === "workflow" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="workflow-key">key</Label>
                <Input id="workflow-key" value={textField("key")} onChange={(e) => setField("key", e.target.value)} placeholder="如 default_auto_rewrite" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="workflow-name">名称</Label>
                <Input id="workflow-name" value={textField("name")} onChange={(e) => setField("name", e.target.value)} placeholder="如 默认自动改写" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="workflow-description">说明</Label>
                <Textarea id="workflow-description" value={textField("description")} onChange={(e) => setField("description", e.target.value)} className="min-h-24" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="workflow-sort">排序</Label>
                <Input id="workflow-sort" value={textField("sort_order")} onChange={(e) => setField("sort_order", e.target.value)} inputMode="numeric" />
              </div>
              <div className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-zinc-800">设为默认</span>
                  <Switch checked={boolField("is_default")} onCheckedChange={(value) => setField("is_default", value)} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-zinc-800">启用</span>
                  <Switch checked={boolField("is_enabled", true)} onCheckedChange={(value) => setField("is_enabled", value)} />
                </div>
              </div>
            </div>
          ) : null}

          {editor?.kind === "workflow_step" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="step-workflow">所属流程</Label>
                <Select
                  value={textField("workflow_id")}
                  onValueChange={(value) => setField("workflow_id", value ?? "")}
                  items={workflowItems}
                >
                  <SelectTrigger id="step-workflow" className="w-full rounded-2xl bg-white">
                    <SelectValue placeholder="选择流程" />
                  </SelectTrigger>
                  <SelectContent>
                    {bundle.workflows.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="step-model-view">绑定真实模型</Label>
                <Select
                  value={textField("model_view_id") || NONE_VALUE}
                  onValueChange={(value) => setField("model_view_id", value ?? NONE_VALUE)}
                  items={optionalModelViewItems}
                >
                  <SelectTrigger id="step-model-view" className="w-full rounded-2xl bg-white">
                    <SelectValue placeholder="可不绑定" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>不绑定，跟随顶部真实模型</SelectItem>
                    {bundle.modelViews.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {primaryRouteByModelViewId.get(row.id)?.actual_model ?? row.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="step-key">step_key</Label>
                <Input id="step-key" value={textField("step_key")} onChange={(e) => setField("step_key", e.target.value)} placeholder="如 structure" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="step-name">步骤名称</Label>
                <Input id="step-name" value={textField("name")} onChange={(e) => setField("name", e.target.value)} placeholder="如 框架改写" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="step-description">说明</Label>
                <Input id="step-description" value={textField("description")} onChange={(e) => setField("description", e.target.value)} placeholder="步骤作用说明" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="step-prompt">步骤提示词</Label>
                <Textarea id="step-prompt" value={textField("step_prompt")} onChange={(e) => setField("step_prompt", e.target.value)} className="min-h-32" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="step-sort">排序</Label>
                <Input id="step-sort" value={textField("sort_order")} onChange={(e) => setField("sort_order", e.target.value)} inputMode="numeric" />
              </div>
              <div className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-zinc-800">启用</span>
                  <Switch checked={boolField("is_enabled", true)} onCheckedChange={(value) => setField("is_enabled", value)} />
                </div>
              </div>
            </div>
          ) : null}

          </SheetBody>
          <SheetFooter>
            <Button variant="outline" onClick={() => closeEditor()} disabled={isSubmitting}>
              取消
            </Button>
            <Button onClick={() => void saveEditor()} disabled={isSubmitting}>
              {isSubmitting ? <Skeleton className="size-4 rounded-full" /> : null}
              保存
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
