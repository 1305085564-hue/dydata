import {
  Bot,
  GitBranch,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Route,
  Ruler,
  Settings2,
  Sparkles,
  Workflow,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ConfigSection } from "./rewrite-config-panel";
import { EmptyBlock, SummaryCard, formatDateTime, getStatusBadge, estimateChars } from "./rewrite-utils";
import type {
  RewriteBundle,
  RuntimeFormState,
  EditorKind,
  FixedModeRow,
  ModelViewRow,
  ModelRouteRow,
  ModeRow,
  LengthPresetRow,
  WorkflowRow,
  WorkflowStepRow,
} from "./rewrite-types";

type RouteGroup = { modelView: ModelViewRow; routes: ModelRouteRow[] };
type WorkflowGroup = { workflow: WorkflowRow; steps: WorkflowStepRow[] };

export type RewriteSectionsProps = {
  bundle: RewriteBundle;
  runtimeForm: RuntimeFormState;
  setRuntimeForm: React.Dispatch<React.SetStateAction<RuntimeFormState>>;
  isLoading: boolean;
  isRefreshing: boolean;
  isSavingRuntime: boolean;
  error: string | null;
  busyKey: string | null;
  loadBundle: (silent?: boolean) => void;
  saveRuntimeSettings: () => void;
  toggleEntity: (kind: EditorKind, row: { id: string; is_enabled: boolean }) => void;
  openFixedModeEditor: (row?: FixedModeRow) => void;
  openModelViewEditor: (row?: ModelViewRow) => void;
  openRouteEditor: (row?: ModelRouteRow, seed?: { modelViewId?: string }) => void;
  openModeEditor: (row?: ModeRow) => void;
  openLengthPresetEditor: (row?: LengthPresetRow) => void;
  openWorkflowEditor: (row?: WorkflowRow) => void;
  openWorkflowStepEditor: (row?: WorkflowStepRow, seed?: { workflowId?: string }) => void;
  routeGroups: RouteGroup[];
  workflowGroups: WorkflowGroup[];
};

export function RewriteSections(props: RewriteSectionsProps) {
  const {
    bundle,
    runtimeForm,
    setRuntimeForm,
    isLoading,
    isRefreshing,
    isSavingRuntime,
    error,
    busyKey,
    loadBundle,
    saveRuntimeSettings,
    toggleEntity,
    openFixedModeEditor,
    openModelViewEditor,
    openRouteEditor,
    openModeEditor,
    openLengthPresetEditor,
    openWorkflowEditor,
    openWorkflowStepEditor,
    routeGroups,
    workflowGroups,
  } = props;

  return (
    <>
      <ConfigSection title="运行规则" icon={<Settings2 className="size-5" />} defaultOpen>
        <section className="grid gap-4 lg:grid-cols-4">
          <SummaryCard icon={Bot} label="固定套餐" value={String(bundle.fixedModes.length)} hint="顶部两个强能力按钮" />
          <SummaryCard icon={Route} label="展示模型" value={String(bundle.modelViews.length)} hint="员工看到的抽象模型层" />
          <SummaryCard icon={Settings2} label="普通配置" value={String(bundle.modes.length + bundle.lengthPresets.length)} hint="普通模式与字数预设" />
          <SummaryCard icon={Workflow} label="自动流程" value={String(bundle.workflowSteps.length)} hint="总步骤数，含步骤级展示模型绑定" />
        </section>

        <Card className="border-white/70 bg-white/82">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="font-semibold tracking-tight">配置说明</CardTitle>
                <CardDescription className="mt-1">
                  这页只做 owner 的文案改写后台配置。员工端仍然只看展示模型，不暴露真实渠道。
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => void loadBundle(true)} disabled={isRefreshing || isLoading}>
                {isRefreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                刷新配置
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-[var(--color-text-secondary)]">
            <p>首条消息固定走结果模式，默认只出 1 个主版本；第二轮开始固定进入正常聊天，不再回版本卡。</p>
            <p>最关键的是先把"固定套餐 → 展示模型 → 真实路线"配对好，再确认输出上限和上下文条数是否符合线上体验。</p>
          </CardContent>
        </Card>
        <Card className="border-white/70 bg-white/82">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 font-semibold tracking-tight">
                  <Ruler className="size-4 text-primary" />
                  运行规则
                </CardTitle>
                <CardDescription className="mt-1">
                  这两项会直接影响 rewrite 页的返回长度和带入多少历史。其他首条/后续规则先按产品要求写死，不做开关。
                </CardDescription>
              </div>
              <Button onClick={() => void saveRuntimeSettings()} disabled={isSavingRuntime || !bundle.featureConfig}>
                {isSavingRuntime ? <Loader2 className="size-4 animate-spin" /> : null}
                保存运行规则
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-[1.3fr,1fr,1fr]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm leading-6 text-[var(--color-text-secondary)]">
              <p className="font-medium text-[var(--color-text-primary)]">当前固定规则</p>
              <p className="mt-2">1. 首条默认结果模式，只出 1 个主版本。</p>
              <p>2. 第二轮开始固定聊天模式，不再返回版本卡。</p>
              <p>3. 顶部强框架 / 强语感 / 展示模型 / 普通模式会自动清空并锁定。</p>
            </div>

            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--color-text-primary)]">输出上限</span>
              <Input
                value={runtimeForm.output_token_limit}
                onChange={(event) => setRuntimeForm((prev) => ({ ...prev, output_token_limit: event.target.value }))}
                inputMode="numeric"
              />
              <p className="text-xs text-[var(--color-text-secondary)]">
                现在填的是 {runtimeForm.output_token_limit || "0"} tokens，约等于{" "}
                {estimateChars(Number.parseInt(runtimeForm.output_token_limit || "0", 10) || 0)} 个汉字。
              </p>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--color-text-primary)]">上下文条数</span>
              <Input
                value={runtimeForm.context_message_limit}
                onChange={(event) =>
                  setRuntimeForm((prev) => ({ ...prev, context_message_limit: event.target.value }))
                }
                inputMode="numeric"
              />
              <p className="text-xs text-[var(--color-text-secondary)]">
                最近保留多少条历史消息。系统内部仍会额外做总长度安全截断，避免请求被拖死。
              </p>
            </label>
          </CardContent>
        </Card>

        {error ? (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <div className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/75 px-4 py-8 text-sm text-[var(--color-text-secondary)]">
            <Loader2 className="size-4 animate-spin" />
            正在加载文案改写配置...
          </div>
        ) : (
          <>
            <Card className="border-white/70 bg-white/82">
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 font-semibold tracking-tight">
                      <Sparkles className="size-4 text-primary" />
                      固定能力套餐
                    </CardTitle>
                    <CardDescription className="mt-1">
                      员工端顶部两个按钮的真正配置源。这里单独维护，不混进普通模式列表。
                    </CardDescription>
                  </div>
                  <Button size="sm" onClick={() => openFixedModeEditor()} disabled={bundle.fixedModes.length >= 2}>
                    <Plus className="size-4" />
                    新增固定套餐
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {bundle.fixedModes.length === 0 ? (
                  <EmptyBlock
                    title="还没有固定套餐"
                    description={"建议至少建\u201c强框架模式\u201d和\u201c强语感模式\u201d两项。"}
                    actionLabel="新增固定套餐"
                    onAction={() => openFixedModeEditor()}
                  />
                ) : (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {bundle.fixedModes.map((row) => (
                      <Card key={row.id} size="sm" className="border-border/60 bg-white/90">
                        <CardHeader>
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <CardTitle className="text-base font-semibold tracking-tight">{row.name}</CardTitle>
                              <CardDescription>{row.description || "—"}</CardDescription>
                            </div>
                            {getStatusBadge(row.is_enabled)}
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm text-[var(--color-text-secondary)]">
                          <div className="grid gap-2 text-xs">
                            <div className="rounded-2xl bg-muted/40 px-3 py-2">
                              <span className="font-semibold text-[var(--color-text-primary)]">key：</span>
                              <span className="font-mono">{row.key}</span>
                            </div>
                            <div className="rounded-2xl bg-muted/40 px-3 py-2">
                              <span className="font-semibold text-[var(--color-text-primary)]">绑定展示模型：</span>
                              {row.model_view?.label ?? "未绑定"}
                            </div>
                            <div className="rounded-2xl bg-muted/40 px-3 py-2">
                              <span className="font-semibold text-[var(--color-text-primary)]">固定字数：</span>
                              {row.length_preset?.name ?? "跟随默认字数"}
                            </div>
                          </div>
                          <div className="rounded-2xl border border-border/60 bg-muted/20 px-3 py-3 text-sm leading-6 text-[var(--color-text-primary)]">
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
                              {busyKey === `fixed_mode:${row.id}` ? <Loader2 className="size-4 animate-spin" /> : null}
                              {row.is_enabled ? "停用" : "启用"}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card className="border-white/70 bg-white/82">
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 font-semibold tracking-tight">
                      <Bot className="size-4 text-primary" />
                      展示模型
                    </CardTitle>
                    <CardDescription className="mt-1">支持新增、编辑、默认项切换和启停。</CardDescription>
                  </div>
                  <Button size="sm" onClick={() => openModelViewEditor()}>
                    <Plus className="size-4" />
                    新增展示模型
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {bundle.modelViews.length === 0 ? (
                  <EmptyBlock
                    title="还没有展示模型"
                    description="先建一个给员工看的展示模型，再往下挂真实路线。"
                    actionLabel="新增展示模型"
                    onAction={() => openModelViewEditor()}
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>名称</TableHead>
                        <TableHead>key</TableHead>
                        <TableHead>说明</TableHead>
                        <TableHead>排序</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>更新时间</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bundle.modelViews.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium text-[var(--color-text-primary)]">{row.label}</TableCell>
                          <TableCell className="font-mono text-xs text-[var(--color-text-secondary)]">{row.key}</TableCell>
                          <TableCell className="max-w-[320px] whitespace-normal text-sm text-[var(--color-text-secondary)]">
                            {row.description || "—"}
                          </TableCell>
                          <TableCell>{row.sort_order}</TableCell>
                          <TableCell>{getStatusBadge(row.is_enabled, row.is_default)}</TableCell>
                          <TableCell className="text-xs text-[var(--color-text-secondary)]">{formatDateTime(row.updated_at)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={() => openModelViewEditor(row)}>
                                <Pencil className="size-4" />
                                编辑
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void toggleEntity("model_view", row)}
                                disabled={busyKey === `model_view:${row.id}`}
                              >
                                {busyKey === `model_view:${row.id}` ? <Loader2 className="size-4 animate-spin" /> : null}
                                {row.is_enabled ? "停用" : "启用"}
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
            <Card className="border-white/70 bg-white/82">
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 font-semibold tracking-tight">
                      <Route className="size-4 text-primary" />
                      真实执行路线
                    </CardTitle>
                    <CardDescription className="mt-1">
                      这块最关键：把展示模型挂到不同渠道和具体模型，必要时精确到自动流程步骤。
                    </CardDescription>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => openRouteEditor()}
                    disabled={bundle.modelViews.length === 0 || bundle.channels.length === 0}
                  >
                    <Plus className="size-4" />
                    新增路线
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {bundle.modelViews.length === 0 ? (
                  <EmptyBlock title="还不能配路线" description="请先新增展示模型，再挂渠道和真实模型。" />
                ) : (
                  routeGroups.map(({ modelView, routes }) => (
                    <Card key={modelView.id} size="sm" className="border-white/70 bg-white/88">
                      <CardHeader className="border-b border-white/70">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <CardTitle className="text-base">{modelView.label}</CardTitle>
                            <CardDescription className="mt-1">
                              {modelView.description || "员工端看到的展示模型。下面这些才是真实执行路线。"}
                            </CardDescription>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openRouteEditor(undefined, { modelViewId: modelView.id })}
                            disabled={bundle.channels.length === 0}
                          >
                            <Plus className="size-4" />
                            给 {modelView.label} 加路线
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {routes.length === 0 ? (
                          <EmptyBlock
                            title="当前展示模型还没挂路线"
                            description="员工选了这个展示模型后，如果没有路线可用，就无法真正执行。"
                            actionLabel="新增路线"
                            onAction={() => openRouteEditor(undefined, { modelViewId: modelView.id })}
                          />
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>步骤绑定</TableHead>
                                <TableHead>渠道</TableHead>
                                <TableHead>真实模型</TableHead>
                                <TableHead>优先级</TableHead>
                                <TableHead>权重</TableHead>
                                <TableHead>状态</TableHead>
                                <TableHead className="text-right">操作</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {routes.map((row) => (
                                <TableRow key={row.id}>
                                  <TableCell className="max-w-[220px] whitespace-normal text-sm text-[var(--color-text-secondary)]">
                                    {row.workflow_step ? `${row.workflow_step.name} (${row.workflow_step.step_key})` : "通用路线"}
                                  </TableCell>
                                  <TableCell>
                                    <div className="space-y-1">
                                      <div className="font-medium text-[var(--color-text-primary)]">{row.channel?.name ?? "已丢失渠道"}</div>
                                      <div className="text-xs text-[var(--color-text-secondary)]">
                                        {row.channel?.is_enabled ? "渠道已启用" : "渠道已停用"}
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell className="font-mono text-xs text-[var(--color-text-secondary)]">{row.actual_model}</TableCell>
                                  <TableCell>{row.priority}</TableCell>
                                  <TableCell>{row.weight}</TableCell>
                                  <TableCell>{getStatusBadge(row.is_enabled)}</TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex justify-end gap-2">
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
                                        {busyKey === `model_route:${row.id}` ? <Loader2 className="size-4 animate-spin" /> : null}
                                        {row.is_enabled ? "停用" : "启用"}
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
                  ))
                )}
              </CardContent>
            </Card>
            <div className="grid gap-6 xl:grid-cols-2">
              <Card className="border-white/70 bg-white/82">
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 font-semibold tracking-tight">
                        <Sparkles className="size-4 text-primary" />
                        模式
                      </CardTitle>
                      <CardDescription className="mt-1">员工可选的改写风格。</CardDescription>
                    </div>
                    <Button size="sm" onClick={() => openModeEditor()}>
                      <Plus className="size-4" />
                      新增模式
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {bundle.modes.length === 0 ? (
                    <EmptyBlock title="还没有模式" description="可以先只留默认空模式，后面再逐步补充。" actionLabel="新增模式" onAction={() => openModeEditor()} />
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
                          <TableRow key={row.id}>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="font-medium text-[var(--color-text-primary)]">{row.name}</div>
                                <div className="max-w-[260px] whitespace-normal text-xs text-[var(--color-text-secondary)]">
                                  {row.description || "—"}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-[var(--color-text-secondary)]">{row.key}</TableCell>
                            <TableCell>{row.sort_order}</TableCell>
                            <TableCell>{getStatusBadge(row.is_enabled, row.is_default)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
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
                                  {busyKey === `mode:${row.id}` ? <Loader2 className="size-4 animate-spin" /> : null}
                                  {row.is_enabled ? "停用" : "启用"}
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

              <Card className="border-white/70 bg-white/82">
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 font-semibold tracking-tight">
                        <Ruler className="size-4 text-primary" />
                        字数预设
                      </CardTitle>
                      <CardDescription className="mt-1">控制输出长短的快捷预设。</CardDescription>
                    </div>
                    <Button size="sm" onClick={() => openLengthPresetEditor()}>
                      <Plus className="size-4" />
                      新增字数预设
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {bundle.lengthPresets.length === 0 ? (
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
                          <TableRow key={row.id}>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="font-medium text-[var(--color-text-primary)]">{row.name}</div>
                                <div className="max-w-[260px] whitespace-normal text-xs text-[var(--color-text-secondary)]">
                                  {row.description || "—"}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-[var(--color-text-secondary)]">{row.key}</TableCell>
                            <TableCell>{row.sort_order}</TableCell>
                            <TableCell>{getStatusBadge(row.is_enabled, row.is_default)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
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
                                  {busyKey === `length_preset:${row.id}` ? <Loader2 className="size-4 animate-spin" /> : null}
                                  {row.is_enabled ? "停用" : "启用"}
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
            </div>
            <Card className="border-white/70 bg-white/82">
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 font-semibold tracking-tight">
                      <GitBranch className="size-4 text-primary" />
                      自动流程与步骤
                    </CardTitle>
                    <CardDescription className="mt-1">
                      支持查看/编辑默认流程，也可以补充新流程和步骤。步骤级可单独绑定展示模型。
                    </CardDescription>
                  </div>
                  <Button size="sm" onClick={() => openWorkflowEditor()}>
                    <Plus className="size-4" />
                    新增流程
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {workflowGroups.length === 0 ? (
                  <EmptyBlock title="还没有自动流程" description="先补一个默认流程，自动模式才有稳定路线。" actionLabel="新增流程" onAction={() => openWorkflowEditor()} />
                ) : (
                  workflowGroups.map(({ workflow, steps }) => (
                    <Card key={workflow.id} size="sm" className="border-white/70 bg-white/88">
                      <CardHeader className="border-b border-white/70">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <CardTitle className="text-base">{workflow.name}</CardTitle>
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
                              {busyKey === `workflow:${workflow.id}` ? <Loader2 className="size-4 animate-spin" /> : null}
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
                                <TableHead>绑定展示模型</TableHead>
                                <TableHead>排序</TableHead>
                                <TableHead>状态</TableHead>
                                <TableHead className="text-right">操作</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {steps.map((step) => (
                                <TableRow key={step.id}>
                                  <TableCell>
                                    <div className="space-y-1">
                                      <div className="font-medium text-[var(--color-text-primary)]">{step.name}</div>
                                      <div className="max-w-[320px] whitespace-normal text-xs text-[var(--color-text-secondary)]">
                                        {step.description || "—"}
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell className="font-mono text-xs text-[var(--color-text-secondary)]">{step.step_key}</TableCell>
                                  <TableCell>{step.model_view?.label ?? "跟随顶部展示模型"}</TableCell>
                                  <TableCell>{step.sort_order}</TableCell>
                                  <TableCell>{getStatusBadge(step.is_enabled)}</TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex justify-end gap-2">
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
                                        {busyKey === `workflow_step:${step.id}` ? <Loader2 className="size-4 animate-spin" /> : null}
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
                  ))
                )}
              </CardContent>
            </Card>
          </>
        )}

      </ConfigSection>
    </>
  );
}
