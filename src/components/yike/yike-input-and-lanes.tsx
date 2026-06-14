"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Loader2, Send, Settings2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { ExecutionSpotlight, YikeItem, YikeItemStatus, YikeLane, YikeProjectFocus } from "./types";
import { STATUS_LABELS, ALLOWED_TRANSITIONS } from "./types";
import { FocusCard, LaneCard, LoadingHeroTask, LoadingSlot, ProjectSlotCard, SlotPlaceholder } from "./yike-cards";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useYikeDrag } from "./drag-context";

const MAX_RAW_INPUT_LENGTH = 2000;

export function QuickInput({
  onSubmit,
  isLoading,
  splitN,
  splitMode = "punct",
  onOpenSettings,
}: {
  onSubmit?: (text: string) => void;
  isLoading?: boolean;
  splitN?: number;
  splitMode?: "punct" | "chars";
  onOpenSettings?: () => void;
}) {
  const [text, setText] = React.useState("");
  const [focused, setFocused] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || isLoading) return;
    onSubmit?.(text.trim().slice(0, MAX_RAW_INPUT_LENGTH));
    setText("");
  };

  const overLimit = text.length > MAX_RAW_INPUT_LENGTH;
  // 实时预览：按当前模式拆分标题/备注
  const preview = React.useMemo(() => {
    const t = text.trim();
    if (!t) return null;
    if (splitMode === "punct") {
      const m = t.match(/[，。、；：！？,.;:!?/]/);
      if (m && m.index != null && m.index > 0) {
        return { title: t.slice(0, m.index), note: t.slice(m.index + 1) };
      }
      return { title: t, note: "" };
    }
    if (!splitN) return null;
    return { title: t.slice(0, splitN), note: t.slice(splitN) };
  }, [text, splitN, splitMode]);

  return (
    <motion.form
      onSubmit={handleSubmit}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1], delay: 0.06 }}
      className={cn(
        "yike-quick-input relative rounded-2xl px-5 py-4 transition-colors duration-200",
        isLoading && "bg-zinc-50/80",
        overLimit && "border-[#C9604D]/40",
      )}
    >
      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={isLoading}
          placeholder="把脑子里的下一件事丢进来 (Enter 保存)…"
          maxLength={MAX_RAW_INPUT_LENGTH + 100}
          className="flex-1 bg-transparent text-[15px] leading-[1.7] text-zinc-800 placeholder:text-zinc-400 outline-none disabled:cursor-not-allowed"
        />
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
            aria-label="拆分设置"
            title="设置前几个字转为标题"
          >
            <Settings2 className="h-4 w-4" />
          </button>
        )}
        <motion.button
          type="submit"
          disabled={!text.trim() || isLoading || overLimit}
          whileHover={{ scale: text.trim() && !isLoading && !overLimit ? 1.05 : 1 }}
          whileTap={{ scale: text.trim() && !isLoading && !overLimit ? 0.95 : 1 }}
          className={cn(
            "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-150",
            text.trim() && !isLoading && !overLimit
              ? "bg-[#D97757] text-white hover:bg-[#C96442] active:bg-[#B8532E]"
              : "bg-zinc-100 text-zinc-300",
          )}
          aria-label="创建"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : <Send className="h-4 w-4" />}
        </motion.button>
      </div>
      <div className="pointer-events-none absolute bottom-0 left-5 right-5 h-px bg-zinc-100">
        <motion.div
          className={cn("h-full", overLimit ? "bg-[#C9604D]" : "bg-[#D97757]")}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: focused || overLimit ? 1 : 0 }}
          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          style={{ originX: 0 }}
        />
      </div>
      <AnimatePresence initial={false}>
        {preview && preview.note && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <p className="mt-2 text-[11px] text-zinc-400">
              标题「<span className="text-zinc-600">{preview.title}</span>」 · 备注「
              <span className="text-zinc-500">{preview.note.slice(0, 30)}{preview.note.length > 30 ? "…" : ""}</span>」
            </p>
          </motion.div>
        )}
      </AnimatePresence>
      {(focused || text.length > 0) && !preview?.note && (
        <div className="mt-1.5 flex justify-end text-[11px] tabular-nums">
          <span className={cn(overLimit && "text-[#C9604D]")}>
            {text.length}/{MAX_RAW_INPUT_LENGTH}
          </span>
        </div>
      )}
    </motion.form>
  );
}

// 「做完了」从主泳道移除，改为头部入口弹窗；这里只保留三条活动泳道，等宽
const LANE_ORDER: YikeItemStatus[] = ["planned", "delegated", "doing"];

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04, delayChildren: 0.08 } },
};

interface StatusLanesProps {
  lanes: Record<YikeItemStatus, YikeLane>;
  execution: ExecutionSpotlight;
  onOpenItem?: (item: YikeItem) => void;
  onTransition?: (itemId: string, target: YikeItemStatus) => void;
  onConvert?: (itemId: string) => void;
  onSplit?: (item: YikeItem) => void;
  onPromote?: (itemId: string) => void;
  onOpenProject?: (project: YikeProjectFocus) => void;
  onCompleteFocus?: (itemId: string, continueWithItemId?: string) => void;
  onDelete?: (itemId: string) => void;
  busyId?: string | null;
  completingId?: string | null;
}

export function StatusLanes({
  lanes,
  execution,
  onOpenItem,
  onTransition,
  onConvert,
  onSplit,
  onPromote,
  onOpenProject,
  onCompleteFocus,
  onDelete,
  busyId,
  completingId,
}: StatusLanesProps) {
  // 拖拽统一走全局 drag context：每条泳道注册成落区，松手命中即转状态。
  const drag = useYikeDrag();
  const laneRefs = React.useRef<Partial<Record<YikeItemStatus, HTMLDivElement | null>>>({});

  React.useEffect(() => {
    if (!drag) return;
    const unregs = LANE_ORDER.map((status) =>
      drag.registerZone({
        id: `lane-${status}`,
        getRect: () => laneRefs.current[status]?.getBoundingClientRect() ?? null,
        accepts: (item) => item.status !== status && ALLOWED_TRANSITIONS[item.status].includes(status),
        onDrop: (item) => onTransition?.(item.id, status),
      }),
    );
    return () => unregs.forEach((u) => u());
  }, [drag, onTransition]);

  const handleDragStart = (item: YikeItem) => drag?.beginDrag(item);
  const handleDragEnd = (_item: YikeItem, point: { x: number; y: number }) => drag?.endDrag(point);

  const dragItem = drag?.dragItem ?? null;

  return (
    <motion.section
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="grid gap-x-3 gap-y-3 lg:grid-cols-3"
    >
      {LANE_ORDER.map((status) => {
        const lane = lanes[status];
        const isDoing = status === "doing";
        // 正在做 = 三件同时做的聚焦区：1 主 + 2 辅，外加 1 项目。三件都是真实在做的事，
        // 主任务只是被排到第一、优先做；辅任务是同样在做但次要的两件，不从计划做借位。
        const focusId = isDoing
          ? execution.primaryTaskId ?? lane.items[0]?.id ?? null
          : null;
        const focusItem = isDoing ? lane.items.find((i) => i.id === focusId) ?? null : null;
        // 辅任务只取「正在做」里除主任务外的真实事项；不足 2 个就空槽占位，不拉计划做补。
        const auxItems = isDoing ? lane.items.filter((i) => i.id !== focusItem?.id).slice(0, 2) : [];
        // 超出主+2辅的正在做事项叠在项目槽之后，不丢数据。
        const overflowItems = isDoing
          ? lane.items.filter((i) => i.id !== focusItem?.id && !auxItems.some((a) => a.id === i.id))
          : [];
        const project = isDoing ? execution.projectFocus : null;
        const restItems = isDoing ? [] : lane.items;
        const isDropTarget = drag?.hoverZoneId === `lane-${status}`;
        const isValidDrop = dragItem != null && ALLOWED_TRANSITIONS[dragItem.status].includes(status) && dragItem.status !== status;

        return (
          <div key={status} className="flex h-full flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="yike-lane-title text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  {STATUS_LABELS[status]}
                </span>
                <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-zinc-100 px-1.5 text-[11px] font-medium text-zinc-400">
                  {lane.items.length}
                </span>
              </div>
              {lane.hiddenCount > 0 && (
                <span className="text-[11px] text-zinc-400">+{lane.hiddenCount}</span>
              )}
            </div>

            <motion.div
              layout
              ref={(el: HTMLDivElement | null) => {
                laneRefs.current[status] = el;
              }}
              className={cn(
                "yike-lane-dropzone yike-lane-scroll flex flex-1 flex-col gap-2 rounded-xl transition-colors duration-150",
                isDropTarget && "yike-lane-dropzone-active",
                isValidDrop && !isDropTarget && "yike-lane-dropzone-ready",
              )}
            >
              <AnimatePresence mode="popLayout" initial={false}>
                {isDoing ? (
                  <React.Fragment key="doing-slots">
                    {focusItem && onCompleteFocus ? (
                      <FocusCard
                        key={focusItem.id}
                        item={focusItem}
                        onComplete={onCompleteFocus}
                        onOpen={onOpenItem}
                        completing={completingId === focusItem.id}
                      />
                    ) : (
                      <SlotPlaceholder key="slot-focus" label="主任务" hint="拖一张卡到这里，设为焦点" />
                    )}
                    {[0, 1].map((idx) => {
                      const aux = auxItems[idx];
                      return aux ? (
                        <LaneCard
                          key={aux.id}
                          item={aux}
                          auxRank={idx + 2}
                          onOpen={onOpenItem}
                          onTransition={onTransition}
                          onConvert={onConvert}
                          onSplit={onSplit}
                          busy={busyId === aux.id}
                          draggable
                          onDragStartCard={handleDragStart}
                          onDragEndCard={handleDragEnd}
                          onDelete={onDelete}
                        />
                      ) : (
                        <SlotPlaceholder key={`slot-aux-${idx}`} label={`辅任务 ${idx + 1}`} hint="再拖一件同时做" />
                      );
                    })}
                    {project ? (
                      <ProjectSlotCard key={`project-${project.projectId}`} project={project} onOpen={onOpenProject} />
                    ) : (
                      <SlotPlaceholder key="slot-project" label="项目" hint="有下一步的项目会落在这" />
                    )}
                    {overflowItems.map((item) => (
                      <LaneCard
                        key={item.id}
                        item={item}
                        onOpen={onOpenItem}
                        onTransition={onTransition}
                        onConvert={onConvert}
                        onSplit={onSplit}
                        onPromote={onPromote}
                        busy={busyId === item.id}
                        draggable
                        onDragStartCard={handleDragStart}
                        onDragEndCard={handleDragEnd}
                        onDelete={onDelete}
                      />
                    ))}
                  </React.Fragment>
                ) : (
                  <React.Fragment key="normal-lane">
                    {restItems.map((item) => (
                      <LaneCard
                        key={item.id}
                        item={item}
                        onOpen={onOpenItem}
                        onTransition={onTransition}
                        onConvert={onConvert}
                        onSplit={onSplit}
                        busy={busyId === item.id}
                        draggable
                        onDragStartCard={handleDragStart}
                        onDragEndCard={handleDragEnd}
                        onDelete={onDelete}
                      />
                    ))}
                    {restItems.length === 0 && (
                      <div className="yike-empty-slot yike-calipers relative flex h-[72px] items-center justify-center rounded-xl text-[11px] font-medium uppercase tracking-widest text-zinc-300">
                        空
                      </div>
                    )}
                  </React.Fragment>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        );
      })}
    </motion.section>
  );
}

export function StatusLanesSkeleton() {
  return (
    <div className="grid gap-x-3 gap-y-3 lg:grid-cols-3">
      {LANE_ORDER.map((status) => (
        <div key={status} className="flex flex-col gap-2">
          <div className="yike-skeleton ml-1 h-3 w-16" />
          <div className="flex flex-col gap-2">
            {status === "doing" ? (
              <>
                <LoadingHeroTask />
                <LoadingSlot lines={1} />
              </>
            ) : (
              <>
                <LoadingSlot lines={2} />
                <LoadingSlot lines={1} />
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** 「做完了」单独入口弹窗：回头看的归档，不占主版面 */
export function DoneDrawer({
  lane,
  open,
  onOpenChange,
  onOpenItem,
  onTransition,
  busyId,
}: {
  lane: YikeLane;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenItem?: (item: YikeItem) => void;
  onTransition?: (itemId: string, target: YikeItemStatus) => void;
  busyId?: string | null;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{STATUS_LABELS.done}</SheetTitle>
          <SheetDescription>
            {lane.items.length > 0 ? `近期完成 ${lane.items.length} 件` : "还没有完成的事项"}
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          {lane.items.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-[13px] text-zinc-400">
              暂无已完成
            </div>
          ) : (
            <motion.div layout className="flex flex-col gap-2">
              <AnimatePresence mode="popLayout" initial={false}>
                {lane.items.map((item) => (
                  <LaneCard
                    key={item.id}
                    item={item}
                    onOpen={onOpenItem}
                    onTransition={onTransition}
                    busy={busyId === item.id}
                  />
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
