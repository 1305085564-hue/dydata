"use client";

import type { RefObject } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TopicSelectDropdown, type SelectedTopicInfo } from "@/components/submission/TopicSelectDropdown";
import { cn } from "@/lib/utils";
import type { FormMetaState } from "../video-submit-form-model";
import type { AssigneeDisplay, SubmissionAssigneeRole } from "../video-submit-form-state";
import { RoleItemRow, VideoStatusSegmented } from "./role-controls";

type RoleSelection = { role: SubmissionAssigneeRole; label: string; selectedUserId: string | null };

const ROLE_ROWS: Array<{ role: SubmissionAssigneeRole; label: string; key: "scriptAuthorUserId" | "videoEditorUserId" | "operatorUserId" }> = [
  { role: "script_author", label: "文案", key: "scriptAuthorUserId" },
  { role: "video_editor", label: "剪辑", key: "videoEditorUserId" },
  { role: "operator", label: "运营", key: "operatorUserId" },
];

const CHIP_CLASS =
  "inline-flex items-center justify-center h-7 sm:h-6 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 px-3 rounded-md text-[12px] sm:text-[14px] font-normal transition cursor-pointer";

export interface FormV2MoreSectionProps {
  open: boolean;
  onToggle: () => void;
  meta: FormMetaState;
  updateMeta: <Key extends keyof FormMetaState>(key: Key, value: FormMetaState[Key]) => void;
  topicTagSectionRef: RefObject<HTMLDivElement | null>;
  topicTagMissing: boolean;
  roleVisible: Record<SubmissionAssigneeRole, boolean>;
  hasAnyVisibleRole: boolean;
  hiddenRoleRestoreLabel: string | null;
  showAllRoles: () => void;
  resolveRoleDisplay: (assignedUserId: string | null) => AssigneeDisplay;
  loadOperatorMembers: () => void;
  setSelectingRole: (role: RoleSelection | null) => void;
  hideRole: (role: SubmissionAssigneeRole) => void;
  selectedTopicId: string | null;
  selectedTopicTitle: string | null;
  handleSelectTopic: (topic: SelectedTopicInfo | null) => void;
}

function Chips<T extends string>({ options, value, onPick }: { options: readonly T[]; value: string; onPick: (next: T) => void }) {
  return (
    <div className="flex items-center rounded-xl bg-[#F1F1F0] p-0.5 sm:h-7">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onPick(option)}
          className={cn(
            CHIP_CLASS,
            value === option ? "bg-white text-[#141413] shadow-input" : "text-[#78716C] hover:text-[#141413]",
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

/**
 * 很少变的收成一行：署名、题材、形式、作品状态、关联选题。
 * 折叠时这一行直接写出当前值，一眼能确认；要改才展开。
 */
export function FormV2MoreSection({
  open,
  onToggle,
  meta,
  updateMeta,
  topicTagSectionRef,
  topicTagMissing,
  roleVisible,
  hasAnyVisibleRole,
  hiddenRoleRestoreLabel,
  showAllRoles,
  resolveRoleDisplay,
  loadOperatorMembers,
  setSelectingRole,
  hideRole,
  selectedTopicId,
  selectedTopicTitle,
  handleSelectTopic,
}: FormV2MoreSectionProps) {
  const visibleRows = ROLE_ROWS.filter((row) => roleVisible[row.role]);
  const externalRows = visibleRows.filter((row) => resolveRoleDisplay(meta[row.key]).external);
  const creditText = !hasAnyVisibleRole || externalRows.length === 0
    ? "文案、剪辑、运营都是我"
    : visibleRows.map((row) => `${row.label} ${resolveRoleDisplay(meta[row.key]).text}`).join(" · ");
  const isAbnormal = meta.anomalyStatus === "abnormal";
  const summaryParts = [
    creditText,
    meta.topicTag || "题材未选",
    meta.videoForm || "出镜",
    ...(isAbnormal ? [`作品异常（${meta.punishType || "限流"}）`] : []),
    ...(selectedTopicTitle ? [`选题《${selectedTopicTitle}》`] : []),
  ];

  return (
    <div ref={topicTagSectionRef} className="space-y-2">
      <div className="flex min-h-9 items-center gap-2 rounded-md px-2 text-[14px]">
        <span className="min-w-0 flex-1 truncate text-[#1F1E1D]">
          {summaryParts.map((part, index) => (
            <span key={`${part}-${index}`} className={cn(part === "题材未选" && "text-status-warning-text")}>
              {index > 0 ? <span className="px-2 text-[#A8A29E]">·</span> : null}
              {part}
            </span>
          ))}
        </span>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="inline-flex min-h-[44px] sm:min-h-0 h-7 shrink-0 items-center rounded-md px-2 text-[12px] text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413] cursor-pointer"
        >
          {open ? "收起" : "修改"}
        </button>
      </div>

      {open && (
        <div className="grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-xl border border-[#E2E2DF] bg-white p-3 text-[12px]">
          <span className="text-[#78716C]">署名</span>
          <div className="space-y-1">
            {!hasAnyVisibleRole ? (
              <div className="text-[#78716C]">独立创作完成 · 文案 / 剪辑 / 运营</div>
            ) : (
              visibleRows.map((row) => (
                <RoleItemRow
                  key={row.role}
                  label={row.label}
                  display={resolveRoleDisplay(meta[row.key])}
                  onOpenSelector={() => {
                    loadOperatorMembers();
                    setSelectingRole({ role: row.role, label: row.label, selectedUserId: meta[row.key] });
                  }}
                  onResetSelf={() => hideRole(row.role)}
                />
              ))
            )}
            {hiddenRoleRestoreLabel && (
              <button
                type="button"
                onClick={showAllRoles}
                className="text-[12px] text-[#78716C] hover:text-[#141413] hover:underline cursor-pointer"
              >
                {hiddenRoleRestoreLabel}
              </button>
            )}
          </div>

          <span className={cn("text-[#78716C]", topicTagMissing && "text-status-warning-text")}>题材标签</span>
          <Chips
            options={["干货", "复盘"] as const}
            value={meta.topicTag}
            onPick={(tag) => updateMeta("topicTag", meta.topicTag === tag ? "" : tag)}
          />

          <span className="text-[#78716C]">视频形式</span>
          <Chips options={["出镜", "图文"] as const} value={meta.videoForm} onPick={(form) => updateMeta("videoForm", form)} />

          <span className="text-[#78716C]">作品状态</span>
          <div className="flex flex-wrap items-center gap-2">
            <VideoStatusSegmented value={meta.anomalyStatus} onChange={(value) => updateMeta("anomalyStatus", value)} />
            {isAbnormal && (
              <Select value={meta.punishType || "限流"} onValueChange={(value) => updateMeta("punishType", value || undefined)}>
                <SelectTrigger className="h-7 rounded-md border border-[#E2E2DF] bg-white px-2 text-[12px] text-[#1F1E1D] shadow-input">
                  <SelectValue>{meta.punishType || "限流"}</SelectValue>
                </SelectTrigger>
                <SelectContent className="min-w-28 rounded-xl border border-[#E2E2DF] bg-white shadow-claude-float">
                  <SelectItem value="限流">限流</SelectItem>
                  <SelectItem value="删稿">删稿</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {isAbnormal && (
            <>
              <span />
              <p className="leading-relaxed text-[#78716C]">限流和删稿照样算今天的作品，截图可以不交，把已有的数据和平台通知如实填上。</p>
              <Label htmlFor="platform_notice" className="text-[12px] font-normal text-[#78716C]">平台通知</Label>
              <Input
                id="platform_notice"
                value={meta.platformNotice || ""}
                onChange={(e) => updateMeta("platformNotice", e.target.value)}
                placeholder="选填，如处罚通知原文"
                className="h-8 rounded-md border-[#E2E2DF] bg-white text-[12px] shadow-input"
              />
              <Label htmlFor="appeal" className="text-[12px] font-normal text-[#78716C]">申诉进展</Label>
              <Input
                id="appeal"
                value={meta.appeal || ""}
                onChange={(e) => updateMeta("appeal", e.target.value)}
                placeholder="选填，如申诉处理中"
                className="h-8 rounded-md border-[#E2E2DF] bg-white text-[12px] shadow-input"
              />
            </>
          )}

          <span className="text-[#78716C]">关联选题</span>
          <div>
            <TopicSelectDropdown
              selectedTopicId={selectedTopicId}
              selectedTopicTitle={selectedTopicTitle}
              onSelectTopic={handleSelectTopic}
            />
          </div>
        </div>
      )}
    </div>
  );
}
