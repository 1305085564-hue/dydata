"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, X, PanelRightClose, Tag, Gauge, Clock, FolderKanban, UserRound, GripVertical, Check, Loader2 } from "lucide-react";
import { Reorder, useDragControls, motion } from "framer-motion";
import { AREA_COLORS, resolveAreaColor } from "./area-colors";
import { useDropZone, useYikeDrag } from "./drag-context";
import type {
  YikeArea,
  YikeComplexity,
  YikeItem,
  YikePerson,
  YikeProject,
  YikeTimeBucket,
  YikeUpdatePayload,
} from "./types";
import {
  COMPLEXITY_LABELS,
  TIME_BUCKET_LABELS,
  YIKE_COMPLEXITIES,
  YIKE_TIME_BUCKETS,
} from "./types";

function Field({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-[12px] font-medium text-zinc-500">
        {icon && <span className="text-zinc-400">{icon}</span>}
        {label}
      </span>
      {children}
    </div>
  );
}

/** 拖拽聚焦：拖拽中，指针正对的字段组放大 20%，其余字段组保持不变。 */
function DockField({
  label,
  icon,
  enabled = true,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  enabled?: boolean;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const drag = useYikeDrag();
  const isDragging = Boolean(drag?.dragItem) && enabled;
  // weight: 1 = 指针正对此组，0 = 远离
  const [weight, setWeight] = React.useState(0);

  React.useEffect(() => {
    if (!isDragging || !drag) {
      setWeight(0);
      return;
    }
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const cy = rect.top + rect.height / 2;
    const dist = Math.abs(drag.pointer.y - cy);
    const RADIUS = 90; // 字段间距约 70px，半径略小让聚焦更聚拢
    const w = dist >= RADIUS ? 0 : (1 - dist / RADIUS) ** 1.5;
    setWeight(w);
  }, [isDragging, drag, drag?.pointer.y]);

  // 目标组放大 20%，其余不变（不缩小、不变淡）。
  const scale = 1 + 0.2 * weight;

  return (
    <motion.div
      ref={ref}
      animate={{ scale }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      style={{ originX: 0, originY: 0.5 }}
      className="flex flex-col gap-1.5"
    >
      <span className="flex items-center gap-1.5 text-[12px] font-medium text-zinc-500">
        {icon && <span className="text-zinc-400">{icon}</span>}
        {label}
      </span>
      {children}
    </motion.div>
  );
}

function PillButton({
  active,
  onClick,
  children,
  dropId,
  onDropCard,
  tint,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  dropId?: string;
  onDropCard?: (item: YikeItem) => void;
  tint?: string | null;
}) {
  const ref = React.useRef<HTMLButtonElement | null>(null);
  const { isHovered, isArmed } = useDropZone(ref, {
    id: dropId ?? "",
    enabled: Boolean(dropId && onDropCard),
    accepts: () => true,
    onDrop: (item) => onDropCard?.(item),
  });

  // 领域按钮：整按钮用领域色填充，不用信号点。默认淡填充+深字，选中加深填充。
  const tintStyle: React.CSSProperties | undefined = tint
    ? isHovered
      ? { backgroundColor: tint, color: "#fff" }
      : active
        ? { backgroundColor: hexAlpha(tint, 0.28), color: tint }
        : { backgroundColor: hexAlpha(tint, 0.12), color: tint }
    : undefined;

  return (
    <motion.button
      ref={ref}
      type="button"
      onClick={onClick}
      animate={{ scale: isHovered ? 1.08 : 1 }}
      transition={{ type: "spring", stiffness: 320, damping: 18 }}
      style={tintStyle}
      className={cn(
        "inline-flex shrink-0 items-center rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors",
        !tint &&
          (isHovered
            ? "bg-[#D97757] text-white ring-2 ring-[#D97757]/40"
            : isArmed
              ? "bg-[#D97757]/10 text-[#C96442] ring-1 ring-[#D97757]/30"
              : active
                ? "bg-[#D97757]/12 text-[#C96442] ring-1 ring-inset ring-[#D97757]/25"
                : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"),
      )}
    >
      {children}
    </motion.button>
  );
}

function hexAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** 高频字段一行平铺直选；超宽横滑，始终单行。末尾可选「+ 新建」。 */
function PillRow({
  options,
  value,
  onChange,
  allowNone,
  noneLabel = "无",
  onAdd,
  addLabel,
  dropField,
  onDropField,
  tintFromDot,
  wrap,
}: {
  options: { value: string; label: string; dot?: string | null }[];
  value: string | null;
  onChange: (value: string | null) => void;
  allowNone?: boolean;
  noneLabel?: string;
  onAdd?: () => void;
  addLabel?: string;
  dropField?: string;
  onDropField?: (item: YikeItem, value: string) => void;
  /** 整按钮上色（领域用）：用 opt.dot 作为按钮填充色，不再渲染信号点 */
  tintFromDot?: boolean;
  /** 多行平铺（领域较多时换行成两排，不横滑） */
  wrap?: boolean;
}) {
  return (
    <div
      className={cn(
        "-mx-1 gap-1.5 px-1 pb-1",
        wrap
          ? "flex flex-wrap"
          : "flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
      )}
    >
      {allowNone && (
        <PillButton active={value == null} onClick={() => onChange(null)}>
          {noneLabel}
        </PillButton>
      )}
      {options.map((opt) => (
        <PillButton
          key={opt.value}
          active={value === opt.value}
          onClick={() => onChange(opt.value)}
          dropId={dropField ? `field-${dropField}-${opt.value}` : undefined}
          onDropCard={dropField && onDropField ? (item) => onDropField(item, opt.value) : undefined}
          tint={tintFromDot ? opt.dot ?? null : undefined}
        >
          {!tintFromDot && opt.dot && (
            <span
              className="mr-1.5 inline-block h-2 w-2 shrink-0 rounded-full align-middle"
              style={{ backgroundColor: opt.dot }}
            />
          )}
          {opt.label}
        </PillButton>
      ))}
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-zinc-100/70 px-2.5 py-1.5 text-[12px] text-zinc-400 transition-colors hover:bg-zinc-200/70 hover:text-[#D97757]"
        >
          <Plus className="h-3 w-3" />
          {addLabel ?? "新建"}
        </button>
      )}
    </div>
  );
}

// PLACEHOLDER_SPLIT_DRAWER

/** 横排色块选择器：领域颜色 */
function ColorSwatchRow({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {AREA_COLORS.map((c) => (
        <button
          key={c.value}
          type="button"
          onClick={() => onChange(c.value)}
          className={cn(
            "relative h-7 w-7 rounded-full transition-transform hover:scale-110",
            value === c.value && "ring-2 ring-offset-2 ring-zinc-300",
          )}
          style={{ backgroundColor: c.solid }}
          aria-label={c.label}
          title={c.label}
        >
          {value === c.value && (
            <Check className="absolute inset-0 m-auto h-3.5 w-3.5 text-white" strokeWidth={3} />
          )}
        </button>
      ))}
    </div>
  );
}

/** 领域管理列表：拖动排序（优先级）+ 每行改色 */
function AreaManageList({
  areas,
  onSetColor,
  onReorder,
}: {
  areas: YikeArea[];
  onSetColor?: (areaId: string, color: string | null) => void;
  onReorder?: (ordered: { id: string; sortOrder: number }[]) => void;
}) {
  const [order, setOrder] = React.useState<YikeArea[]>(areas);
  React.useEffect(() => setOrder(areas), [areas]);

  const commit = () => {
    onReorder?.(order.map((a, i) => ({ id: a.id, sortOrder: (i + 1) * 10 })));
  };

  if (!onReorder) {
    return (
      <div className="flex flex-col gap-1.5">
        {order.map((a) => (
          <AreaManageRow key={a.id} area={a} onSetColor={onSetColor} draggable={false} />
        ))}
      </div>
    );
  }

  return (
    <Reorder.Group axis="y" values={order} onReorder={setOrder} className="flex flex-col gap-1.5">
      {order.map((a) => (
        <AreaManageRow key={a.id} area={a} onSetColor={onSetColor} draggable onDragEnd={commit} />
      ))}
    </Reorder.Group>
  );
}

function AreaManageRow({
  area,
  onSetColor,
  draggable,
  onDragEnd,
}: {
  area: YikeArea;
  onSetColor?: (areaId: string, color: string | null) => void;
  draggable: boolean;
  onDragEnd?: () => void;
}) {
  const controls = useDragControls();
  const [editing, setEditing] = React.useState(false);
  const color = resolveAreaColor(area.color);

  const content = (
    <div className="flex items-center gap-2 rounded-lg border border-zinc-100 bg-white px-2.5 py-2">
      {draggable && (
        <button
          type="button"
          onPointerDown={(e) => controls.start(e)}
          className="cursor-grab touch-none text-zinc-300 transition-colors hover:text-zinc-500 active:cursor-grabbing"
          aria-label="拖动排序"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      <button
        type="button"
        onClick={() => setEditing((v) => !v)}
        className="h-4 w-4 shrink-0 rounded-full ring-1 ring-inset ring-black/5"
        style={{ backgroundColor: color?.solid ?? "#E4E4E7" }}
        aria-label="改颜色"
        title="改颜色"
      />
      <span className="flex-1 truncate text-[13px] text-zinc-700">{area.name}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-1.5">
      {draggable ? (
        <Reorder.Item value={area} dragListener={false} dragControls={controls} onDragEnd={onDragEnd}>
          {content}
        </Reorder.Item>
      ) : (
        content
      )}
      {editing && onSetColor && (
        <div className="pl-7">
          <ColorSwatchRow
            value={area.color}
            onChange={(v) => {
              onSetColor(area.id, v);
              setEditing(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

interface SplitMemoDrawerProps {
  item: YikeItem | null;
  open: boolean;
  saving?: boolean;
  onOpenChange: (open: boolean) => void;
  onSplit: (itemId: string, titles: string[], archiveSource: boolean) => void;
}

export function SplitMemoDrawer({ item, open, saving, onOpenChange, onSplit }: SplitMemoDrawerProps) {
  const [lines, setLines] = React.useState<string[]>(["", ""]);
  const [archive, setArchive] = React.useState(true);

  React.useEffect(() => {
    if (item) {
      // 用备注里的换行/编号做初始拆分建议
      const guess = (item.note ?? "")
        .split(/\n|[0-9]+[.、)]/)
        .map((s) => s.trim())
        .filter(Boolean);
      setLines(guess.length >= 2 ? guess : ["", ""]);
      setArchive(true);
    }
  }, [item]);

  if (!item) return null;

  const valid = lines.map((l) => l.trim()).filter(Boolean);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>拆分备忘</SheetTitle>
          <SheetDescription>把「{item.title}」拆成多条独立任务</SheetDescription>
        </SheetHeader>

        <SheetBody className="flex flex-col gap-3">
          {lines.map((line, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Input
                value={line}
                onChange={(e) =>
                  setLines((prev) => prev.map((l, i) => (i === idx ? e.target.value : l)))
                }
                placeholder={`任务 ${idx + 1}`}
              />
              {lines.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                >
                  <X />
                </Button>
              )}
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => setLines((prev) => [...prev, ""])}
          >
            <Plus /> 加一条
          </Button>

          <button
            type="button"
            onClick={() => setArchive((v) => !v)}
            className="mt-2 flex items-center gap-2 text-[12px] text-zinc-500"
          >
            <span
              className={cn(
                "inline-flex h-4 w-4 items-center justify-center rounded border",
                archive ? "border-[#D97757] bg-[#D97757] text-white" : "border-zinc-300 bg-white",
              )}
            >
              {archive && "✓"}
            </span>
            拆分后归档原备忘
          </button>
        </SheetBody>

        <SheetFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            size="sm"
            disabled={saving || valid.length < 1}
            onClick={() => onSplit(item.id, valid, archive)}
          >
            拆成 {valid.length} 条
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// PLACEHOLDER_MANAGE_DRAWER

export type ManageTab = "area" | "project" | "person";

interface ManageDrawerProps {
  open: boolean;
  tab: ManageTab;
  areas: YikeArea[];
  projects: YikeProject[];
  people: YikePerson[];
  saving?: boolean;
  onOpenChange: (open: boolean) => void;
  onTabChange: (tab: ManageTab) => void;
  onCreateArea: (name: string, color?: string | null) => void;
  onCreateProject: (name: string, nextTaskTitle: string | null, areaId: string | null) => void;
  onCreatePerson: (name: string) => void;
  onSetAreaColor?: (areaId: string, color: string | null) => void;
  onSetProjectArea?: (projectId: string, areaId: string | null) => void;
  onReorderAreas?: (ordered: { id: string; sortOrder: number }[]) => void;
}

const TAB_LABELS: Record<ManageTab, string> = {
  area: "领域",
  project: "项目",
  person: "负责人",
};

export function ManageDrawer({
  open,
  tab,
  areas,
  projects,
  people,
  saving,
  onOpenChange,
  onTabChange,
  onCreateArea,
  onCreateProject,
  onCreatePerson,
  onSetAreaColor,
  onSetProjectArea,
  onReorderAreas,
}: ManageDrawerProps) {
  const [name, setName] = React.useState("");
  const [nextTask, setNextTask] = React.useState("");
  const [newColor, setNewColor] = React.useState<string | null>(AREA_COLORS[0].value);
  const [projectAreaId, setProjectAreaId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setName("");
    setNextTask("");
    setNewColor(AREA_COLORS[0].value);
    setProjectAreaId(null);
  }, [tab, open]);

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (tab === "area") onCreateArea(trimmed, newColor);
    else if (tab === "project") onCreateProject(trimmed, nextTask.trim() || null, projectAreaId);
    else onCreatePerson(trimmed);
    setName("");
    setNextTask("");
  };

  const existing = tab === "area" ? areas : tab === "project" ? projects : people;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>管理{TAB_LABELS[tab]}</SheetTitle>
          <SheetDescription>新增并查看已有{TAB_LABELS[tab]}</SheetDescription>
        </SheetHeader>

        <SheetBody className="flex flex-col gap-4">
          <div className="flex gap-1.5">
            {(Object.keys(TAB_LABELS) as ManageTab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onTabChange(t)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors",
                  tab === t ? "bg-[#D97757] text-white" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200",
                )}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>

          <Field label={`新增${TAB_LABELS[tab]}`}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && tab !== "project") handleCreate();
              }}
              placeholder={`${TAB_LABELS[tab]}名称`}
            />
          </Field>

          {tab === "project" && (
            <>
              <Field label="领域分类">
                <PillRow
                  options={areas.map((a) => ({
                    value: a.id,
                    label: a.name,
                    dot: resolveAreaColor(a.color)?.solid ?? null,
                  }))}
                  value={projectAreaId}
                  onChange={setProjectAreaId}
                  allowNone
                  noneLabel="未分类"
                  tintFromDot
                  wrap
                />
              </Field>

              <Field label="下一步任务（可选）">
                <Input
                  value={nextTask}
                  onChange={(e) => setNextTask(e.target.value)}
                  placeholder="填了就自动设为项目下一步"
                />
              </Field>
            </>
          )}

          {tab === "area" && (
            <Field label="颜色">
              <ColorSwatchRow value={newColor} onChange={setNewColor} />
            </Field>
          )}

          <Button size="sm" className="self-start" disabled={saving || !name.trim()} onClick={handleCreate}>
            <Plus /> 创建
          </Button>

          <div className="mt-2 flex flex-col gap-1.5 border-t border-zinc-100 pt-3">
            <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
              已有 {existing.length} 个{tab === "area" && areas.length > 1 ? " · 拖动调整优先级" : ""}
            </span>
            {tab === "area" ? (
              <AreaManageList
                areas={areas}
                onSetColor={onSetAreaColor}
                onReorder={onReorderAreas}
              />
            ) : tab === "project" ? (
              projects.map((project) => (
                <div
                  key={project.id}
                  className="flex flex-col gap-2 rounded-lg border border-zinc-100 bg-zinc-50/60 px-3 py-2 text-[13px] text-zinc-700"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span>{project.name}</span>
                    <span className="text-[12px] text-zinc-400">
                      {areas.find((area) => area.id === project.areaId)?.name ?? "未分类"}
                    </span>
                  </div>
                  {onSetProjectArea && (
                    <PillRow
                      options={areas.map((area) => ({
                        value: area.id,
                        label: area.name,
                        dot: resolveAreaColor(area.color)?.solid ?? null,
                      }))}
                      value={project.areaId ?? null}
                      onChange={(areaId) => onSetProjectArea(project.id, areaId)}
                      allowNone
                      noneLabel="未分类"
                      tintFromDot
                      wrap
                    />
                  )}
                </div>
              ))
            ) : (
              people.map((person) => (
                <div
                  key={person.id}
                  className="rounded-lg border border-zinc-100 bg-zinc-50/60 px-3 py-2 text-[13px] text-zinc-700"
                >
                  {person.name}
                </div>
              ))
            )}
            {existing.length === 0 && (
              <p className="text-[12px] text-zinc-400">还没有，先创建一个。</p>
            )}
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

interface ProjectNextTaskDrawerProps {
  projectId: string | null;
  projectName: string;
  open: boolean;
  saving?: boolean;
  onOpenChange: (open: boolean) => void;
  onAddNextTask: (projectId: string, title: string) => void;
}

export function ProjectNextTaskDrawer({
  projectId,
  projectName,
  open,
  saving,
  onOpenChange,
  onAddNextTask,
}: ProjectNextTaskDrawerProps) {
  const [title, setTitle] = React.useState("");

  React.useEffect(() => {
    if (open) setTitle("");
  }, [open]);

  if (!projectId) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>补下一步</SheetTitle>
          <SheetDescription>为项目「{projectName}」添加下一步任务</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <Field label="下一步任务">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && title.trim()) onAddNextTask(projectId, title.trim());
              }}
              placeholder="接下来要推进的一件事"
              autoFocus
            />
          </Field>
        </SheetBody>
        <SheetFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            size="sm"
            disabled={saving || !title.trim()}
            onClick={() => onAddNextTask(projectId, title.trim())}
          >
            添加并设为下一步
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// PLACEHOLDER_EDIT_DRAWER

interface EditItemPanelProps {
  item: YikeItem;
  areas: YikeArea[];
  projects: YikeProject[];
  people: YikePerson[];
  saving?: boolean;
  onCollapse: () => void;
  onManage: (tab: ManageTab) => void;
  onSetField?: (itemId: string, payload: YikeUpdatePayload) => void;
}

/** 内联编辑面板：不是浮层，由父级用宽度动画推挤三列。高频字段 pill 直选。 */
export function EditItemPanel({
  item,
  areas,
  projects,
  people,
  saving,
  onCollapse,
  onManage,
  onSetField,
}: EditItemPanelProps) {
  const [form, setForm] = React.useState<YikeUpdatePayload>(() => ({
    title: item.title,
    note: item.note ?? "",
    complexity: item.complexity,
    timeBucket: item.timeBucket,
    areaId: item.areaId,
    projectId: item.projectId,
    dueDate: item.dueDate,
    isUrgent: item.isUrgent,
    assigneePersonId: item.assigneePersonId,
  }));

  React.useEffect(() => {
    setForm({
      title: item.title,
      note: item.note ?? "",
      complexity: item.complexity,
      timeBucket: item.timeBucket,
      areaId: item.areaId,
      projectId: item.projectId,
      dueDate: item.dueDate,
      isUrgent: item.isUrgent,
      assigneePersonId: item.assigneePersonId,
    });
  }, [item]);

  // 即时保存：pill/开关/日期/拖入一改就持久化，不再等"保存"按钮。
  const set = <K extends keyof YikeUpdatePayload>(key: K, value: YikeUpdatePayload[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    onSetField?.(item.id, { [key]: value } as YikeUpdatePayload);
  };
  // 文本（标题/备注/备忘）改时只更本地，失焦再持久化，避免每个键击都打接口。
  const setLocal = <K extends keyof YikeUpdatePayload>(key: K, value: YikeUpdatePayload[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const isMemo = item.itemType === "memo";

  const setProject = (projectId: string | null) => {
    set("projectId", projectId);
  };

  // 备忘只有一个备忘栏：编辑时把全文存进 note，失焦时从全文截一个短标题回填 title（后端 title 必填）。
  const memoText = form.note?.trim() ? (form.note as string) : (form.title ?? "");
  const setMemoText = (text: string) => setForm((prev) => ({ ...prev, note: text }));
  const deriveMemoTitle = (text: string) => {
    const firstLine = text.split(/\n/)[0]?.trim() ?? "";
    const base = firstLine || text.trim();
    return base.slice(0, 120) || "未命名备忘";
  };
  const commitMemo = () => {
    const full = memoText.trim();
    if (!full) return;
    onSetField?.(item.id, { title: deriveMemoTitle(full), note: full });
  };
  const commitTitle = () => {
    const t = form.title?.trim();
    if (!t) return;
    onSetField?.(item.id, { title: t });
  };
  const commitNote = () => {
    onSetField?.(item.id, { note: form.note?.trim() ? form.note.trim() : null });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2 pr-1 pt-1 pb-4">
        <div>
          <p className="text-[14px] font-medium text-zinc-800">编辑事项</p>
          <p className="text-[12px] text-zinc-500">
            {item.itemType === "memo" ? "备忘" : "任务"} · 点选即填，不再翻二级页
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onCollapse} aria-label="收起面板" title="收起面板">
          <PanelRightClose />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1 py-1">
        {isMemo ? (
          <Field label="备忘">
            <Textarea
              value={memoText}
              onChange={(e) => setMemoText(e.target.value)}
              onBlur={commitMemo}
              placeholder="记一句话，想到什么写什么…"
              rows={4}
            />
          </Field>
        ) : (
          <>
            <Field label="标题">
              <Input
                value={form.title ?? ""}
                onChange={(e) => setLocal("title", e.target.value)}
                onBlur={commitTitle}
                placeholder="标题"
              />
            </Field>

            <Field label="备注">
              <Textarea
                value={form.note ?? ""}
                onChange={(e) => setLocal("note", e.target.value)}
                onBlur={commitNote}
                placeholder="补充说明…"
                rows={3}
              />
            </Field>
          </>
        )}

        <DockField label="领域分类" icon={<Tag className="h-3.5 w-3.5" />}>
          <PillRow
            options={areas.map((a) => ({
              value: a.id,
              label: a.name,
              dot: resolveAreaColor(a.color)?.solid ?? null,
            }))}
            value={form.areaId ?? null}
            onChange={(v) => set("areaId", v)}
            allowNone
            noneLabel="未分类"
            onAdd={() => onManage("area")}
            addLabel="领域"
            dropField="areaId"
            onDropField={(dragged, v) => onSetField?.(dragged.id, { areaId: v })}
            tintFromDot
            wrap
          />
        </DockField>

        <DockField label="复杂度" icon={<Gauge className="h-3.5 w-3.5" />}>
          <PillRow
            options={YIKE_COMPLEXITIES.map((c) => ({ value: c, label: COMPLEXITY_LABELS[c] }))}
            value={form.complexity ?? null}
            onChange={(v) => v && set("complexity", v as YikeComplexity)}
            dropField="complexity"
            onDropField={(dragged, v) => onSetField?.(dragged.id, { complexity: v as YikeComplexity })}
          />
        </DockField>

        <DockField label="时间桶" icon={<Clock className="h-3.5 w-3.5" />}>
          <PillRow
            options={YIKE_TIME_BUCKETS.map((t) => ({ value: t, label: TIME_BUCKET_LABELS[t] }))}
            value={form.timeBucket ?? null}
            onChange={(v) => v && set("timeBucket", v as YikeTimeBucket)}
            dropField="timeBucket"
            onDropField={(dragged, v) => onSetField?.(dragged.id, { timeBucket: v as YikeTimeBucket })}
          />
        </DockField>

        <DockField label="所属项目" icon={<FolderKanban className="h-3.5 w-3.5" />}>
          <PillRow
            options={projects.map((p) => ({ value: p.id, label: p.name }))}
            value={form.projectId ?? null}
            onChange={setProject}
            allowNone
            onAdd={() => onManage("project")}
            addLabel="项目"
            dropField="projectId"
            onDropField={(dragged, v) => onSetField?.(dragged.id, { projectId: v })}
          />
        </DockField>

        <DockField label="负责人（别人做）" icon={<UserRound className="h-3.5 w-3.5" />}>
          <PillRow
            options={people.map((p) => ({ value: p.id, label: p.name }))}
            value={form.assigneePersonId ?? null}
            onChange={(v) => set("assigneePersonId", v)}
            allowNone
            noneLabel="自己"
            onAdd={() => onManage("person")}
            addLabel="负责人"
            dropField="assigneePersonId"
            onDropField={(dragged, v) => onSetField?.(dragged.id, { assigneePersonId: v })}
          />
        </DockField>

        <div className="grid grid-cols-2 items-end gap-3">
          <Field label="截止日期">
            <Input
              type="date"
              value={form.dueDate ?? ""}
              onChange={(e) => set("dueDate", e.target.value || null)}
            />
          </Field>

          <button
            type="button"
            onClick={() => set("isUrgent", !form.isUrgent)}
            className={cn(
              "flex h-9 items-center justify-between rounded-lg px-3 text-[13px] transition-colors",
              form.isUrgent
                ? "bg-[#C9604D]/[0.08] text-[#C9604D]"
                : "bg-zinc-100/70 text-zinc-500 hover:bg-zinc-200/70",
            )}
          >
            <span>加急</span>
            <span
              className={cn(
                "inline-flex h-4 w-7 items-center rounded-full p-0.5 transition-colors",
                form.isUrgent ? "bg-[#C9604D]" : "bg-zinc-300",
              )}
            >
              <span
                className={cn(
                  "h-3 w-3 rounded-full bg-white transition-transform",
                  form.isUrgent && "translate-x-3",
                )}
              />
            </span>
          </button>
        </div>

        <p className="flex items-center gap-1 pt-1 text-[11px] text-zinc-400">
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 text-[#6FAA7D]" />}
          {saving ? "保存中…" : "改动已自动保存"}
        </p>
      </div>
    </div>
  );
}

/** 空态：侧边默认展开但未选中任何事项时的提示占位 */
export function EmptyEditPanel({ onCollapse }: { onCollapse: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2 pr-1 pt-1 pb-4">
        <div>
          <p className="text-[14px] font-medium text-zinc-800">编辑事项</p>
          <p className="text-[12px] text-zinc-500">点选即填，不再翻二级页</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onCollapse} aria-label="收起面板" title="收起面板">
          <PanelRightClose />
        </Button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 pb-10 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-100 text-zinc-300">
          <Tag className="h-5 w-5" />
        </div>
        <p className="text-[13px] text-zinc-500">点左侧任一卡片，在这里编辑</p>
        <p className="text-[12px] text-zinc-400">或在上方输入框丢一句话，新建后自动带到这</p>
      </div>
    </div>
  );
}
