"use client";

import { useEffect, useMemo, useState } from "react";
import { RewriteSandbox } from "./components/rewrite-sandbox";
import { RewriteConfigPanel } from "./components/rewrite-config-panel";
import { RewriteSections } from "./components/rewrite-sections";
import { RewriteEditorDialog } from "./components/rewrite-editor-dialog";
import type { EditorTitleMap } from "./components/rewrite-editor-dialog";
import { nextSortOrder } from "./components/rewrite-utils";
import { feedbackToast } from "@/components/ui/feedback-toast";
import type {
  RewriteBundle,
  RuntimeFormState,
  EditorKind,
  EditorState,
  FormState,
  ModelViewRow,
  FixedModeRow,
  ModelRouteRow,
  ModeRow,
  LengthPresetRow,
  WorkflowRow,
  WorkflowStepRow,
} from "./components/rewrite-types";
import { NONE_VALUE, EMPTY_BUNDLE, EMPTY_RUNTIME_FORM } from "./components/rewrite-types";

export default function AIRewriteClient() {
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

  const routeGroups = useMemo(() => {
    const routeMap = new Map<string, ModelRouteRow[]>();
    for (const route of bundle.modelRoutes) {
      const list = routeMap.get(route.model_view_id) ?? [];
      list.push(route);
      routeMap.set(route.model_view_id, list);
    }
    return bundle.modelViews.map((mv) => ({ modelView: mv, routes: routeMap.get(mv.id) ?? [] }));
  }, [bundle.modelRoutes, bundle.modelViews]);

  const workflowGroups = useMemo(() => {
    const stepMap = new Map<string, WorkflowStepRow[]>();
    for (const step of bundle.workflowSteps) {
      const list = stepMap.get(step.workflow_id) ?? [];
      list.push(step);
      stepMap.set(step.workflow_id, list);
    }
    return bundle.workflows.map((wf) => ({ workflow: wf, steps: stepMap.get(wf.id) ?? [] }));
  }, [bundle.workflowSteps, bundle.workflows]);

  async function loadBundle(silent = false) {
    if (silent) { setIsRefreshing(true); } else { setIsLoading(true); }
    setError(null);
    try {
      const res = await fetch("/api/admin/ai-rewrite", { cache: "no-store" });
      const data = (await res.json()) as RewriteBundle & { error?: string };
      if (!res.ok || data.error) throw new Error(data.error || "加载文案改写配置失败");
      setBundle(data);
      setRuntimeForm({
        is_enabled: data.featureConfig?.is_enabled ?? true,
        output_token_limit: String(data.featureConfig?.output_token_limit ?? 3600),
        context_message_limit: String(data.featureConfig?.context_message_limit ?? 30),
      });
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "加载文案改写配置失败";
      setError(message);
      feedbackToast.error(message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  async function saveRuntimeSettings() {
    if (!bundle.featureConfig) { feedbackToast.error("缺少 content_rewrite 功能配置，暂时不能保存"); return; }
    const outputTokenLimit = Number.parseInt(runtimeForm.output_token_limit, 10);
    const contextMessageLimit = Number.parseInt(runtimeForm.context_message_limit, 10);
    if (!Number.isFinite(outputTokenLimit) || outputTokenLimit < 1200) { feedbackToast.error("输出上限至少填 1200 tokens"); return; }
    if (!Number.isFinite(contextMessageLimit) || contextMessageLimit < 1) { feedbackToast.error("上下文条数至少填 1"); return; }
    setIsSavingRuntime(true);
    try {
      const res = await fetch("/api/admin/ai-rewrite", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "feature_config", id: bundle.featureConfig.id,
          is_enabled: runtimeForm.is_enabled, output_token_limit: outputTokenLimit, context_message_limit: contextMessageLimit,
        }),
      });
      const data = (await res.json()) as { bundle?: RewriteBundle; error?: string };
      if (!res.ok || data.error || !data.bundle) throw new Error(data.error || "保存运行规则失败");
      setBundle(data.bundle);
      setRuntimeForm({
        is_enabled: data.bundle.featureConfig?.is_enabled ?? true,
        output_token_limit: String(data.bundle.featureConfig?.output_token_limit ?? outputTokenLimit),
        context_message_limit: String(data.bundle.featureConfig?.context_message_limit ?? contextMessageLimit),
      });
      feedbackToast.success("运行规则已更新");
    } catch (nextError) {
      feedbackToast.error(nextError instanceof Error ? nextError.message : "保存运行规则失败");
    } finally { setIsSavingRuntime(false); }
  }

  useEffect(() => { void loadBundle(); }, []);

  function setField(key: string, value: string | boolean) { setForm((c) => ({ ...c, [key]: value })); }
  function textField(key: string) { return String(form[key] ?? ""); }
  function boolField(key: string, fallback = false) { return typeof form[key] === "boolean" ? Boolean(form[key]) : fallback; }
  function resetEditor(next: EditorState, nextForm: FormState) { setEditor(next); setForm(nextForm); }
  function closeEditor(force = false) { if (isSubmitting && !force) return; setEditor(null); setForm({}); }
  function openModelViewEditor(row?: ModelViewRow) {
    resetEditor({ kind: "model_view", mode: row ? "edit" : "create" }, {
      id: row?.id ?? "", key: row?.key ?? "", label: row?.label ?? "", description: row?.description ?? "",
      sort_order: row ? String(row.sort_order) : nextSortOrder(bundle.modelViews), is_default: row?.is_default ?? false, is_enabled: row?.is_enabled ?? true,
    });
  }

  function openFixedModeEditor(row?: FixedModeRow) {
    resetEditor({ kind: "fixed_mode", mode: row ? "edit" : "create" }, {
      id: row?.id ?? "", key: row?.key ?? "", name: row?.name ?? "", description: row?.description ?? "",
      fixed_prompt: row?.fixed_prompt ?? "", model_view_id: row?.model_view_id ?? bundle.modelViews[0]?.id ?? "",
      length_preset_id: row?.length_preset_id ?? NONE_VALUE, sort_order: row ? String(row.sort_order) : nextSortOrder(bundle.fixedModes), is_enabled: row?.is_enabled ?? true,
    });
  }

  function openRouteEditor(row?: ModelRouteRow, seed?: { modelViewId?: string }) {
    resetEditor({ kind: "model_route", mode: row ? "edit" : "create" }, {
      id: row?.id ?? "", model_view_id: row?.model_view_id ?? seed?.modelViewId ?? bundle.modelViews[0]?.id ?? "",
      workflow_step_id: row?.workflow_step_id ?? NONE_VALUE, channel_id: row?.channel_id ?? bundle.channels[0]?.id ?? "",
      actual_model: row?.actual_model ?? row?.channel?.model ?? "", priority: row ? String(row.priority) : "100",
      weight: row ? String(row.weight) : "100", is_enabled: row?.is_enabled ?? true,
    });
  }

  function openModeEditor(row?: ModeRow) {
    resetEditor({ kind: "mode", mode: row ? "edit" : "create" }, {
      id: row?.id ?? "", key: row?.key ?? "", name: row?.name ?? "", description: row?.description ?? "",
      mode_prompt: row?.mode_prompt ?? "", sort_order: row ? String(row.sort_order) : nextSortOrder(bundle.modes),
      is_default: row?.is_default ?? false, is_enabled: row?.is_enabled ?? true,
    });
  }

  function openLengthPresetEditor(row?: LengthPresetRow) {
    resetEditor({ kind: "length_preset", mode: row ? "edit" : "create" }, {
      id: row?.id ?? "", key: row?.key ?? "", name: row?.name ?? "", description: row?.description ?? "",
      length_prompt: row?.length_prompt ?? "", sort_order: row ? String(row.sort_order) : nextSortOrder(bundle.lengthPresets),
      is_default: row?.is_default ?? false, is_enabled: row?.is_enabled ?? true,
    });
  }

  function openWorkflowEditor(row?: WorkflowRow) {
    resetEditor({ kind: "workflow", mode: row ? "edit" : "create" }, {
      id: row?.id ?? "", key: row?.key ?? "", name: row?.name ?? "", description: row?.description ?? "",
      sort_order: row ? String(row.sort_order) : nextSortOrder(bundle.workflows), is_default: row?.is_default ?? false, is_enabled: row?.is_enabled ?? true,
    });
  }

  function openWorkflowStepEditor(row?: WorkflowStepRow, seed?: { workflowId?: string }) {
    resetEditor({ kind: "workflow_step", mode: row ? "edit" : "create" }, {
      id: row?.id ?? "", workflow_id: row?.workflow_id ?? seed?.workflowId ?? bundle.workflows[0]?.id ?? "",
      model_view_id: row?.model_view_id ?? NONE_VALUE, step_key: row?.step_key ?? "", name: row?.name ?? "",
      description: row?.description ?? "", step_prompt: row?.step_prompt ?? "",
      sort_order: row ? String(row.sort_order) : nextSortOrder(bundle.workflowSteps), is_enabled: row?.is_enabled ?? true,
    });
  }
  async function saveEditor() {
    if (!editor) return;
    const body: Record<string, unknown> = { entity: editor.kind };
    if (editor.mode === "edit") body.id = textField("id");

    if (editor.kind === "model_view") {
      Object.assign(body, { key: textField("key"), label: textField("label"), description: textField("description"), sort_order: textField("sort_order"), is_default: boolField("is_default"), is_enabled: boolField("is_enabled", true) });
    }
    if (editor.kind === "fixed_mode") {
      Object.assign(body, { key: textField("key"), name: textField("name"), description: textField("description"), fixed_prompt: textField("fixed_prompt"), model_view_id: textField("model_view_id"), length_preset_id: textField("length_preset_id") === NONE_VALUE ? null : textField("length_preset_id"), sort_order: textField("sort_order"), is_enabled: boolField("is_enabled", true) });
    }
    if (editor.kind === "model_route") {
      Object.assign(body, { model_view_id: textField("model_view_id"), workflow_step_id: textField("workflow_step_id") === NONE_VALUE ? null : textField("workflow_step_id"), channel_id: textField("channel_id"), actual_model: textField("actual_model"), priority: textField("priority"), weight: textField("weight"), is_enabled: boolField("is_enabled", true) });
    }
    if (editor.kind === "mode") {
      Object.assign(body, { key: textField("key"), name: textField("name"), description: textField("description"), mode_prompt: textField("mode_prompt"), sort_order: textField("sort_order"), is_default: boolField("is_default"), is_enabled: boolField("is_enabled", true) });
    }
    if (editor.kind === "length_preset") {
      Object.assign(body, { key: textField("key"), name: textField("name"), description: textField("description"), length_prompt: textField("length_prompt"), sort_order: textField("sort_order"), is_default: boolField("is_default"), is_enabled: boolField("is_enabled", true) });
    }
    if (editor.kind === "workflow") {
      Object.assign(body, { key: textField("key"), name: textField("name"), description: textField("description"), sort_order: textField("sort_order"), is_default: boolField("is_default"), is_enabled: boolField("is_enabled", true) });
    }
    if (editor.kind === "workflow_step") {
      Object.assign(body, { workflow_id: textField("workflow_id"), model_view_id: textField("model_view_id") === NONE_VALUE ? null : textField("model_view_id"), step_key: textField("step_key"), name: textField("name"), description: textField("description"), step_prompt: textField("step_prompt"), sort_order: textField("sort_order"), is_enabled: boolField("is_enabled", true) });
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/admin/ai-rewrite", {
        method: editor.mode === "create" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string; bundle?: RewriteBundle };
      if (!res.ok || data.error || !data.bundle) throw new Error(data.error || "保存失败");
      setBundle(data.bundle);
      closeEditor(true);
      feedbackToast.success(editor.mode === "create" ? "已新增配置" : "已更新配置");
    } catch (nextError) {
      feedbackToast.error(nextError instanceof Error ? nextError.message : "保存失败");
    } finally { setIsSubmitting(false); }
  }

  async function toggleEntity(kind: EditorKind, row: { id: string; is_enabled: boolean }) {
    setBusyKey(`${kind}:${row.id}`);
    try {
      const res = await fetch("/api/admin/ai-rewrite", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: kind, id: row.id, is_enabled: !row.is_enabled }),
      });
      const data = (await res.json()) as { error?: string; bundle?: RewriteBundle };
      if (!res.ok || data.error || !data.bundle) throw new Error(data.error || "状态更新失败");
      setBundle(data.bundle);
      feedbackToast.success(row.is_enabled ? "已停用" : "已启用");
    } catch (nextError) {
      feedbackToast.error(nextError instanceof Error ? nextError.message : "状态更新失败");
    } finally { setBusyKey(null); }
  }

  const editorTitleMap: EditorTitleMap = {
    fixed_mode: { create: "新增固定能力套餐", edit: "编辑固定能力套餐", description: "这里控制员工端顶部两个固定按钮绑定到哪条展示模型和哪段固定提示词。" },
    model_view: { create: "新增展示模型", edit: "编辑展示模型", description: "员工端看到的是展示模型，不是实际渠道和真实模型。" },
    model_route: { create: "新增执行路线", edit: "编辑执行路线", description: "把展示模型挂到真实渠道和具体模型上，必要时再绑到某个自动流程步骤。" },
    mode: { create: "新增模式", edit: "编辑模式", description: "模式是员工端可选的改写风格，会拼进系统提示词。" },
    length_preset: { create: "新增字数预设", edit: "编辑字数预设", description: "字数预设控制输出长短，不改员工页结构。" },
    workflow: { create: "新增自动流程", edit: "编辑自动流程", description: "自动流程决定多步骤改写怎么跑，默认流程优先保证能用。" },
    workflow_step: { create: "新增流程步骤", edit: "编辑流程步骤", description: "步骤级可以单独绑定展示模型，这是自动模式最关键的配置点之一。" },
  };
  return (
    <>
      <div className="grid grid-cols-1 xl:grid-cols-[60%_1fr] gap-8">
        <RewriteConfigPanel>
          <div className="space-y-6 pr-2 xl:h-[calc(100vh-140px)] xl:overflow-y-auto">
            <RewriteSections
              bundle={bundle}
              runtimeForm={runtimeForm}
              setRuntimeForm={setRuntimeForm}
              isLoading={isLoading}
              isRefreshing={isRefreshing}
              isSavingRuntime={isSavingRuntime}
              error={error}
              busyKey={busyKey}
              loadBundle={loadBundle}
              saveRuntimeSettings={saveRuntimeSettings}
              toggleEntity={toggleEntity}
              openFixedModeEditor={openFixedModeEditor}
              openModelViewEditor={openModelViewEditor}
              openRouteEditor={openRouteEditor}
              openModeEditor={openModeEditor}
              openLengthPresetEditor={openLengthPresetEditor}
              openWorkflowEditor={openWorkflowEditor}
              openWorkflowStepEditor={openWorkflowStepEditor}
              routeGroups={routeGroups}
              workflowGroups={workflowGroups}
            />
          </div>
        </RewriteConfigPanel>

        <RewriteSandbox
          activeConfigName={
            bundle.fixedModes.find(m => m.is_enabled)?.name
            ?? bundle.modes.find(m => m.is_default && m.is_enabled)?.name
            ?? bundle.modes.find(m => m.is_enabled)?.name
          }
          activeConfigType={bundle.fixedModes.find(m => m.is_enabled) ? "固定套餐" : "模式"}
        />
      </div>

      <RewriteEditorDialog
        editor={editor}
        form={form}
        setField={setField}
        textField={textField}
        boolField={boolField}
        closeEditor={closeEditor}
        saveEditor={saveEditor}
        isSubmitting={isSubmitting}
        bundle={bundle}
        editorTitleMap={editorTitleMap}
      />
    </>
  );
}
