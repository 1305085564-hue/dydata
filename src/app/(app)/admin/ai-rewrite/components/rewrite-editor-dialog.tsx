import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import type { EditorKind, EditorState, FormState, RewriteBundle } from "./rewrite-types";
import { NONE_VALUE } from "./rewrite-types";

export type EditorTitleMap = Record<EditorKind, { create: string; edit: string; description: string }>;

export type RewriteEditorDialogProps = {
  editor: EditorState | null;
  form: FormState;
  setField: (key: string, value: string | boolean) => void;
  textField: (key: string) => string;
  boolField: (key: string, fallback?: boolean) => boolean;
  closeEditor: () => void;
  saveEditor: () => void;
  isSubmitting: boolean;
  bundle: RewriteBundle;
  editorTitleMap: EditorTitleMap;
};

export function RewriteEditorDialog(props: RewriteEditorDialogProps) {
  const {
    editor,
    setField,
    textField,
    boolField,
    closeEditor,
    saveEditor,
    isSubmitting,
    bundle,
    editorTitleMap,
  } = props;
  const activeEditorMeta = editor ? editorTitleMap[editor.kind] : null;

  return (
    <Dialog open={Boolean(editor)} onOpenChange={(open) => (!open ? closeEditor() : null)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{activeEditorMeta ? activeEditorMeta[editor?.mode ?? "create"] : "编辑配置"}</DialogTitle>
          <DialogDescription>{activeEditorMeta?.description}</DialogDescription>
        </DialogHeader>

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
              <Label htmlFor="fixed-mode-model-view">绑定展示模型</Label>
              <Select value={textField("model_view_id")} onValueChange={(value) => setField("model_view_id", value ?? "")}>
                <SelectTrigger id="fixed-mode-model-view" className="w-full rounded-2xl bg-white/80">
                  <SelectValue placeholder="选择展示模型" />
                </SelectTrigger>
                <SelectContent>
                  {bundle.modelViews.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fixed-mode-length">固定字数</Label>
              <Select value={textField("length_preset_id") || NONE_VALUE} onValueChange={(value) => setField("length_preset_id", value ?? NONE_VALUE)}>
                <SelectTrigger id="fixed-mode-length" className="w-full rounded-2xl bg-white/80">
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
            <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/30 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-[var(--color-text-primary)]">启用</span>
                <Switch checked={boolField("is_enabled", true)} onCheckedChange={(value) => setField("is_enabled", value)} />
              </div>
            </div>
          </div>
        ) : null}

        {editor?.kind === "model_view" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="model-view-key">key</Label>
              <Input id="model-view-key" value={textField("key")} onChange={(e) => setField("key", e.target.value)} placeholder="如 gemini" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model-view-label">label</Label>
              <Input id="model-view-label" value={textField("label")} onChange={(e) => setField("label", e.target.value)} placeholder="如 Gemini" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="model-view-description">说明</Label>
              <Textarea
                id="model-view-description"
                value={textField("description")}
                onChange={(e) => setField("description", e.target.value)}
                className="min-h-24"
                placeholder="员工端可见说明"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model-view-sort">排序</Label>
              <Input id="model-view-sort" value={textField("sort_order")} onChange={(e) => setField("sort_order", e.target.value)} inputMode="numeric" />
            </div>
            <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/30 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-[var(--color-text-primary)]">设为默认展示模型</span>
                <Switch checked={boolField("is_default")} onCheckedChange={(value) => setField("is_default", value)} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-[var(--color-text-primary)]">启用</span>
                <Switch checked={boolField("is_enabled", true)} onCheckedChange={(value) => setField("is_enabled", value)} />
              </div>
            </div>
          </div>
        ) : null}
        {editor?.kind === "model_route" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="route-model-view">展示模型</Label>
              <Select value={textField("model_view_id")} onValueChange={(value) => setField("model_view_id", value ?? "")}>
                <SelectTrigger id="route-model-view" className="w-full rounded-2xl bg-white/80">
                  <SelectValue placeholder="选择展示模型" />
                </SelectTrigger>
                <SelectContent>
                  {bundle.modelViews.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="route-workflow-step">步骤绑定</Label>
              <Select value={textField("workflow_step_id") || NONE_VALUE} onValueChange={(value) => setField("workflow_step_id", value ?? NONE_VALUE)}>
                <SelectTrigger id="route-workflow-step" className="w-full rounded-2xl bg-white/80">
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
              <Select value={textField("channel_id")} onValueChange={(value) => setField("channel_id", value ?? "")}>
                <SelectTrigger id="route-channel" className="w-full rounded-2xl bg-white/80">
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
            <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/30 px-4 py-3 md:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-[var(--color-text-primary)]">启用这条路线</span>
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
            <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/30 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-[var(--color-text-primary)]">设为默认</span>
                <Switch checked={boolField("is_default")} onCheckedChange={(value) => setField("is_default", value)} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-[var(--color-text-primary)]">启用</span>
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
            <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/30 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-[var(--color-text-primary)]">设为默认</span>
                <Switch checked={boolField("is_default")} onCheckedChange={(value) => setField("is_default", value)} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-[var(--color-text-primary)]">启用</span>
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
            <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/30 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-[var(--color-text-primary)]">设为默认</span>
                <Switch checked={boolField("is_default")} onCheckedChange={(value) => setField("is_default", value)} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-[var(--color-text-primary)]">启用</span>
                <Switch checked={boolField("is_enabled", true)} onCheckedChange={(value) => setField("is_enabled", value)} />
              </div>
            </div>
          </div>
        ) : null}

        {editor?.kind === "workflow_step" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="step-workflow">所属流程</Label>
              <Select value={textField("workflow_id")} onValueChange={(value) => setField("workflow_id", value ?? "")}>
                <SelectTrigger id="step-workflow" className="w-full rounded-2xl bg-white/80">
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
              <Label htmlFor="step-model-view">绑定展示模型</Label>
              <Select value={textField("model_view_id") || NONE_VALUE} onValueChange={(value) => setField("model_view_id", value ?? NONE_VALUE)}>
                <SelectTrigger id="step-model-view" className="w-full rounded-2xl bg-white/80">
                  <SelectValue placeholder="可不绑定" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>不绑定，跟随顶部展示模型</SelectItem>
                  {bundle.modelViews.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.label}
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
            <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/30 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-[var(--color-text-primary)]">启用</span>
                <Switch checked={boolField("is_enabled", true)} onCheckedChange={(value) => setField("is_enabled", value)} />
              </div>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => closeEditor()} disabled={isSubmitting}>
            取消
          </Button>
          <Button onClick={() => void saveEditor()} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
