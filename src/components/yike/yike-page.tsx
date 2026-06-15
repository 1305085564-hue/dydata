"use client";

import * as React from "react";
import { Loader2, RefreshCw, CheckCircle2, PanelRightOpen, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { ManageTab } from "./item-drawer";
import type { YikeItem, YikeUpdatePayload, YikeWorkbench } from "./types";
import { QuickInput, StatusLanes, StatusLanesSkeleton, DoneDrawer } from "./yike-input-and-lanes";
import { ReminderBar } from "./reminder-bar";
import { YikeDragProvider, useDropZone } from "./drag-context";
import {
  EditItemPanel,
  EmptyEditPanel,
  ManageDrawer,
  ProjectNextTaskDrawer,
  SplitMemoDrawer,
} from "./item-drawer";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  addYikeProjectTask,
  completeYikeFocus,
  convertYikeMemoToTask,
  createYikeArea,
  createYikeItem,
  createYikePerson,
  createYikeProject,
  deleteYikeItem,
  reorderYikeAreas,
  replaceYikeFocusSlot,
  splitYikeMemo,
  transitionYikeItem,
  updateYikeArea,
  updateYikeItem,
  updateYikeProject,
} from "@/lib/yike/client";
import { cn } from "@/lib/utils";

const SPLIT_N_KEY = "yike-title-split-n";
const SPLIT_N_OPTIONS = [4, 5, 6];
const SPLIT_MODE_KEY = "yike-title-split-mode";
const YIKE_PRODUCT_NAME = "此刻";
type SplitMode = "punct" | "chars";
// 标点分割：第一个分隔标点之前作标题，之后（含该标点后）作备注
const SPLIT_PUNCT = /[，。、；：！？,.;:!?/]/;

/** 按模式把一句话拆成 标题/备注 */
function splitTitleNote(text: string, mode: SplitMode, n: number): { title: string; note: string } {
  const t = text.trim();
  if (mode === "punct") {
    const m = t.match(SPLIT_PUNCT);
    if (m && m.index != null && m.index > 0) {
      return { title: t.slice(0, m.index).trim(), note: t.slice(m.index + 1).trim() };
    }
    return { title: t, note: "" };
  }
  return { title: t.slice(0, n).trim() || t, note: t.slice(n).trim() };
}

interface YikePageProps {
  workbench: YikeWorkbench;
  loading?: boolean;
  error?: string | null;
  onReload?: () => void;
}

/** 做完了入口：既是点击弹窗按钮，也是拖拽落区（Mac 垃圾篓那种吸入感）。 */
function DoneDropTarget({
  count,
  onOpen,
  onDropDone,
}: {
  count: number;
  onOpen: () => void;
  onDropDone: (itemId: string) => void;
}) {
  const ref = React.useRef<HTMLButtonElement | null>(null);
  const { isHovered, isArmed } = useDropZone(ref, {
    id: "done-target",
    accepts: (item) => item.status !== "done",
    onDrop: (item) => onDropDone(item.id),
  });
  return (
    <motion.button
      ref={ref}
      onClick={onOpen}
      animate={{ scale: isHovered ? 1.18 : isArmed ? 1.06 : 1 }}
      transition={{ type: "spring", stiffness: 320, damping: 18 }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition-colors",
        isHovered
          ? "bg-[#6FAA7D]/15 text-[#4C7A58]"
          : isArmed
            ? "bg-[#6FAA7D]/[0.07] text-[#4C7A58]"
            : "hover:bg-zinc-100 hover:text-zinc-800",
      )}
    >
      <CheckCircle2 className={cn("h-3.5 w-3.5", isHovered && "fill-[#6FAA7D]/20")} />
      {isArmed ? "拖到这里完成" : "做完了"}
      {count > 0 && !isArmed && (
        <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-zinc-100 px-1 text-[10px] font-medium text-zinc-400">
          {count}
        </span>
      )}
    </motion.button>
  );
}

/** 垃圾篓：拖卡片到这里删除（软删除，可恢复）。 */
function TrashDropTarget({ onDropTrash }: { onDropTrash: (itemId: string) => void }) {
  const ref = React.useRef<HTMLButtonElement | null>(null);
  const { isHovered, isArmed } = useDropZone(ref, {
    id: "trash-target",
    accepts: () => true,
    onDrop: (item) => onDropTrash(item.id),
  });
  return (
    <motion.button
      ref={ref}
      type="button"
      tabIndex={-1}
      animate={{ scale: isHovered ? 1.18 : isArmed ? 1.06 : 1 }}
      transition={{ type: "spring", stiffness: 320, damping: 18 }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition-colors",
        isHovered
          ? "bg-[#C9604D]/15 text-[#C9604D]"
          : isArmed
            ? "bg-[#C9604D]/[0.07] text-[#C9604D]"
            : "text-zinc-400",
      )}
    >
      <Trash2 className={cn("h-3.5 w-3.5", isHovered && "fill-[#C9604D]/15")} />
      {isArmed || isHovered ? "拖到这里删除" : "回收"}
    </motion.button>
  );
}

export function YikePage(props: YikePageProps) {
  return (
    <YikeDragProvider>
      <YikePageInner {...props} />
    </YikeDragProvider>
  );
}

function YikePageInner({ workbench, loading, error, onReload }: YikePageProps) {
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [completingId, setCompletingId] = React.useState<string | null>(null);
  const [isCreating, setIsCreating] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  // 前 N 字转标题设置（持久化）
  const [splitN, setSplitN] = React.useState(4);
  const [splitMode, setSplitMode] = React.useState<SplitMode>("punct");
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  React.useEffect(() => {
    const saved = Number(window.localStorage.getItem(SPLIT_N_KEY));
    if (SPLIT_N_OPTIONS.includes(saved)) setSplitN(saved);
    const mode = window.localStorage.getItem(SPLIT_MODE_KEY);
    if (mode === "punct" || mode === "chars") setSplitMode(mode);
  }, []);
  const updateSplitN = (n: number) => {
    setSplitN(n);
    window.localStorage.setItem(SPLIT_N_KEY, String(n));
  };
  const updateSplitMode = (m: SplitMode) => {
    setSplitMode(m);
    window.localStorage.setItem(SPLIT_MODE_KEY, m);
  };

  // 抽屉/面板状态
  const [editItemId, setEditItemId] = React.useState<string | null>(null);
  const [pendingOpenId, setPendingOpenId] = React.useState<string | null>(null);
  const [splitItem, setSplitItem] = React.useState<YikeItem | null>(null);
  const [manageOpen, setManageOpen] = React.useState(false);
  const [manageTab, setManageTab] = React.useState<ManageTab>("area");
  const [nextTaskProject, setNextTaskProject] = React.useState<{ id: string; name: string } | null>(null);
  const [doneOpen, setDoneOpen] = React.useState(false);
  const [panelCollapsed, setPanelCollapsed] = React.useState(false);

  // 从最新 workbench 里按 id 找事项（编辑面板始终读最新数据）
  const allItems = React.useMemo(() => {
    const lanes = workbench.lanes;
    return [...lanes.planned.items, ...lanes.doing.items, ...lanes.delegated.items, ...lanes.done.items];
  }, [workbench]);
  const editItem = React.useMemo(
    () => allItems.find((i) => i.id === editItemId) ?? null,
    [allItems, editItemId],
  );

  // 新建后自动弹出编辑面板
  React.useEffect(() => {
    if (pendingOpenId && allItems.some((i) => i.id === pendingOpenId)) {
      setEditItemId(pendingOpenId);
      setPanelCollapsed(false);
      setPendingOpenId(null);
    }
  }, [pendingOpenId, allItems]);

  const run = async (fn: () => Promise<unknown>, onErr: string) => {
    setActionError(null);
    try {
      await fn();
      onReload?.();
      return true;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : onErr);
      return false;
    }
  };

  const handleQuickSubmit = async (text: string) => {
    if (isCreating) return;
    setIsCreating(true);
    setActionError(null);
    try {
      const { title, note } = splitTitleNote(text, splitMode, splitN);
      const res = await createYikeItem({
        title: title || text.trim(),
        note: note || null,
        itemType: "memo",
        status: "planned",
      });
      setPendingOpenId(res.item.id);
      onReload?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setIsCreating(false);
    }
  };

  const handleTransition = async (itemId: string, target: YikeItem["status"]) => {
    if (busyId) return;
    setBusyId(itemId);
    await run(() => transitionYikeItem(itemId, { toStatus: target }), "状态流转失败");
    setBusyId(null);
  };

  const handleCompleteFocus = async (itemId: string, continueWithItemId?: string) => {
    if (completingId) return;
    setCompletingId(itemId);
    await run(
      () => completeYikeFocus({ itemId, continueWithItemId: continueWithItemId ?? null }),
      "完成任务失败",
    );
    setCompletingId(null);
  };

  const handleConvert = async (itemId: string) => {
    if (busyId) return;
    setBusyId(itemId);
    await run(() => convertYikeMemoToTask(itemId), "备忘转任务失败");
    setBusyId(null);
  };

  const handlePromote = async (itemId: string) => {
    if (busyId) return;
    setBusyId(itemId);
    await run(
      () => replaceYikeFocusSlot({ slotKey: "primary_task", itemId }),
      "设为焦点失败",
    );
    setBusyId(null);
  };

  const handleSetField = async (itemId: string, payload: YikeUpdatePayload) => {
    if (busyId) return;
    setBusyId(itemId);
    await run(() => updateYikeItem(itemId, payload), "设置字段失败");
    setBusyId(null);
  };

  const handleDelete = async (itemId: string) => {
    if (busyId) return;
    setBusyId(itemId);
    const ok = await run(() => deleteYikeItem(itemId), "删除失败");
    if (ok && editItemId === itemId) setEditItemId(null);
    setBusyId(null);
  };

  const handleSplit = async (itemId: string, titles: string[], archiveSource: boolean) => {
    setSaving(true);
    const ok = await run(
      () =>
        splitYikeMemo(itemId, {
          tasks: titles.map((title) => ({ title, note: null })),
          archiveSourceMemo: archiveSource,
        }),
      "拆分失败",
    );
    setSaving(false);
    if (ok) setSplitItem(null);
  };

  const handleCreateArea = async (name: string, color?: string | null) => {
    setSaving(true);
    await run(() => createYikeArea({ name, sortOrder: 1000, color: color ?? null }), "创建领域失败");
    setSaving(false);
  };

  const handleSetAreaColor = async (areaId: string, color: string | null) => {
    await run(() => updateYikeArea(areaId, { color }), "更新领域颜色失败");
  };

  const handleSetProjectArea = async (projectId: string, areaId: string | null) => {
    await run(() => updateYikeProject(projectId, { areaId }), "更新项目领域失败");
  };

  const handleReorderAreas = async (ordered: { id: string; sortOrder: number }[]) => {
    await run(() => reorderYikeAreas(ordered), "领域排序失败");
  };

  const handleCreateProject = async (name: string, nextTaskTitle: string | null, areaId: string | null) => {
    setSaving(true);
    await run(
      () =>
        createYikeProject({
          name,
          areaId,
          goalNote: null,
          acceptanceCriteria: null,
          nextTaskTitle,
        }),
      "创建项目失败",
    );
    setSaving(false);
  };

  const handleCreatePerson = async (name: string) => {
    setSaving(true);
    await run(() => createYikePerson({ name, sortOrder: 1000 }), "创建负责人失败");
    setSaving(false);
  };

  const handleAddNextTask = async (projectId: string, title: string) => {
    setSaving(true);
    const ok = await run(
      () =>
        addYikeProjectTask(projectId, {
          title,
          note: null,
          complexity: "small",
          timeBucket: "today",
          setAsNextTask: true,
        }),
      "添加下一步失败",
    );
    setSaving(false);
    if (ok) setNextTaskProject(null);
  };

  const openManage = (tab: ManageTab) => {
    setManageTab(tab);
    setManageOpen(true);
  };

  const openMemoSplitById = (itemId: string) => {
    const found = allItems.find((i) => i.id === itemId) ?? null;
    if (found) setSplitItem(found);
  };

  const displayError = actionError ?? error;
  const doneCount = workbench.lanes.done.items.length;

  return (
    <div className="yike-page mx-auto max-w-[1200px] pb-12">
      {/* 整行表头：标题 + 管理入口，跨全宽，下方再开主区/面板 */}
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        className="mb-6 flex items-end justify-between gap-4"
      >
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[24px] font-semibold text-zinc-800">{YIKE_PRODUCT_NAME}</h1>
            {loading && <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />}
          </div>
          <p className="text-[13px] text-zinc-500">{workbench.today} · 只关心现在最该做的一件</p>
        </div>
        <div className="flex items-center gap-3 text-[13px] text-zinc-500">
          <DoneDropTarget
            count={doneCount}
            onOpen={() => setDoneOpen(true)}
            onDropDone={(itemId) => handleTransition(itemId, "done")}
          />
          <TrashDropTarget onDropTrash={handleDelete} />
          <span className="text-zinc-200">·</span>
          <button onClick={() => openManage("area")} className="transition-colors hover:text-zinc-800">
            管理领域
          </button>
          <button onClick={() => openManage("project")} className="transition-colors hover:text-zinc-800">
            项目
          </button>
          <button onClick={() => openManage("person")} className="transition-colors hover:text-zinc-800">
            负责人
          </button>
          {onReload && (
            <button
              onClick={onReload}
              disabled={loading}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-50"
              aria-label="刷新"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </button>
          )}
        </div>
      </motion.header>

      <div className="yike-surface flex gap-0">
        {/* 主区：编辑面板展开时 flex-1 自然压缩三列 */}
        <div className="min-w-0 flex-1 space-y-5">
          <AnimatePresence>
            {displayError && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="rounded-xl border border-[#C9604D]/15 bg-[#C9604D]/[0.04] px-4 py-3 text-[13px] text-[#C9604D]"
              >
                {displayError}
                {onReload && (
                  <button
                    onClick={onReload}
                    className="ml-3 inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-[12px] font-medium text-[#C9604D] shadow-sm transition-colors hover:bg-zinc-50"
                  >
                    重试
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <QuickInput
            onSubmit={handleQuickSubmit}
            isLoading={isCreating}
            splitN={splitN}
            splitMode={splitMode}
            onOpenSettings={() => setSettingsOpen(true)}
          />

          <ReminderBar
            reminders={workbench.reminders}
            onProjectNextTask={(id, name) => setNextTaskProject({ id, name })}
            onMemoSplit={openMemoSplitById}
          />

          <div className="yike-lane-divider" />

          {loading ? (
            <StatusLanesSkeleton />
          ) : (
            <StatusLanes
              lanes={workbench.lanes}
              execution={workbench.execution}
              onOpenItem={(item) => setEditItemId(item.id)}
              onTransition={handleTransition}
              onConvert={handleConvert}
              onSplit={setSplitItem}
              onPromote={handlePromote}
              onOpenProject={(project) => project.nextTaskId && setEditItemId(project.nextTaskId)}
              onCompleteFocus={handleCompleteFocus}
              onDelete={handleDelete}
              busyId={busyId}
              completingId={completingId}
            />
          )}
        </div>

        {/* 内联编辑面板：辅助区，默认展开，可收起。只用一条左竖线分隔，与主体一体 */}
        <AnimatePresence initial={false} mode="popLayout">
          {panelCollapsed ? (
            <motion.div
              key="collapsed"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 44, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
              className="shrink-0 overflow-hidden"
            >
              <div className="ml-5 flex h-full min-h-[440px] w-[24px] flex-col items-center border-l border-zinc-200/70 pl-3">
                <button
                  type="button"
                  onClick={() => setPanelCollapsed(false)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
                  aria-label="展开编辑面板"
                  title="展开编辑面板"
                >
                  <PanelRightOpen className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.aside
              key="panel"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 340, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
              className="shrink-0 overflow-hidden"
            >
              <div className="relative ml-5 flex h-full min-h-[440px] w-[316px] flex-col border-l border-zinc-200/70 pl-5">
                {editItem ? (
                  <EditItemPanel
                    item={editItem}
                    areas={workbench.drawerData.areas}
                    projects={workbench.drawerData.projects}
                    people={workbench.drawerData.people}
                    saving={saving}
                    onCollapse={() => setPanelCollapsed(true)}
                    onManage={openManage}
                    onSetField={handleSetField}
                  />
                ) : (
                  <EmptyEditPanel onCollapse={() => setPanelCollapsed(true)} />
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* 做完了弹窗：回头看的归档 */}
      <DoneDrawer
        lane={workbench.lanes.done}
        open={doneOpen}
        onOpenChange={setDoneOpen}
        onOpenItem={(item) => {
          setDoneOpen(false);
          setEditItemId(item.id);
        }}
        onTransition={handleTransition}
        busyId={busyId}
      />

      {/* 低频操作仍用浮层 Sheet */}
      <SplitMemoDrawer
        item={splitItem}
        open={splitItem != null}
        saving={saving}
        onOpenChange={(o) => !o && setSplitItem(null)}
        onSplit={handleSplit}
      />

      <ManageDrawer
        open={manageOpen}
        tab={manageTab}
        areas={workbench.drawerData.areas}
        projects={workbench.drawerData.projects}
        people={workbench.drawerData.people}
        saving={saving}
        onOpenChange={setManageOpen}
        onTabChange={setManageTab}
        onCreateArea={handleCreateArea}
        onCreateProject={handleCreateProject}
        onCreatePerson={handleCreatePerson}
        onSetAreaColor={handleSetAreaColor}
        onSetProjectArea={handleSetProjectArea}
        onReorderAreas={handleReorderAreas}
      />

      <ProjectNextTaskDrawer
        projectId={nextTaskProject?.id ?? null}
        projectName={nextTaskProject?.name ?? ""}
        open={nextTaskProject != null}
        saving={saving}
        onOpenChange={(o) => !o && setNextTaskProject(null)}
        onAddNextTask={handleAddNextTask}
      />

      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="right" className="w-full sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>输入拆分设置</SheetTitle>
            <SheetDescription>顶部输入时，自动把一句话拆成标题和备注</SheetDescription>
          </SheetHeader>
          <SheetBody className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <span className="text-[12px] font-medium text-zinc-500">拆分方式</span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => updateSplitMode("punct")}
                  className={cn(
                    "rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                    splitMode === "punct" ? "bg-[#D97757] text-white" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200",
                  )}
                >
                  标点符号分割
                </button>
                <button
                  type="button"
                  onClick={() => updateSplitMode("chars")}
                  className={cn(
                    "rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                    splitMode === "chars" ? "bg-[#D97757] text-white" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200",
                  )}
                >
                  前几个字
                </button>
              </div>
            </div>

            {splitMode === "punct" ? (
              <p className="text-[12px] text-zinc-400">
                遇到第一个标点（，。、；：！？/ 等）就断开：之前作标题，之后作备注。
                <br />
                例：「确认域名解析，记得备份配置」→ 标题「确认域名解析」，备注「记得备份配置」。
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <span className="text-[12px] font-medium text-zinc-500">前几个字作标题</span>
                <div className="flex gap-1.5">
                  {SPLIT_N_OPTIONS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => updateSplitN(n)}
                      className={cn(
                        "rounded-lg px-4 py-2 text-[13px] font-medium transition-colors",
                        splitN === n ? "bg-[#D97757] text-white" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200",
                      )}
                    >
                      前 {n} 个字
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[12px] text-zinc-400">
                  例：输入「确认域名解析的具体方案」，前 {splitN} 字「{"确认域名解析的具体方案".slice(0, splitN)}」作标题，其余作备注。
                </p>
              </div>
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  );
}
