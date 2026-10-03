"use client";

import type { RefObject } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { ItemHeading } from "@/components/ui/item-heading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PublishedAtPicker } from "../history-report-edit-form";
import { 截图槽位区 } from "@/components/submission/截图槽位区";
import type { SubmissionSlotRole } from "@/components/submission/提交状态机";
import type { ExtendedSubmissionIssueSummary } from "@/components/submission/填报表单状态";
import { cn } from "@/lib/utils";
import type {
  FormMetaState,
  SlotViewState,
} from "../video-submit-form-model";
import type {
  AssigneeDisplay,
  SubmissionAssigneeRole,
} from "../video-submit-form-state";
import { RoleItemRow } from "./role-controls";

type RoleSelection = {
  role: SubmissionAssigneeRole;
  label: string;
  selectedUserId: string | null;
};

type SlotsUpdater = (
  updater:
    | Record<SubmissionSlotRole, SlotViewState>
    | ((current: Record<SubmissionSlotRole, SlotViewState>) => Record<SubmissionSlotRole, SlotViewState>),
) => void;

export interface FormV2LeftColumnProps {
  slots: Record<SubmissionSlotRole, SlotViewState>;
  slotsSectionRef: RefObject<HTMLDivElement | null>;
  metricsSectionRef: RefObject<HTMLDivElement | null>;
  handleSlotUpload: (role: SubmissionSlotRole, file: File) => void;
  handleUnifiedUpload: (files: File[]) => void;
  setDeleteTargetRole: (role: SubmissionSlotRole | null) => void;
  handleSlotRetry: (role: SubmissionSlotRole) => void;
  updateSlotsState: SlotsUpdater;
  screenshotsRequired: boolean;
  focusedRole: SubmissionSlotRole | null;
  highlightedOcrIndex: number | null;
  pulseSlots: boolean;
  hiddenRoleRestoreLabel: string | null;
  showAllRoles: () => void;
  hasAnyVisibleRole: boolean;
  isScriptAuthorVisible: boolean;
  isVideoEditorVisible: boolean;
  isOperatorVisible: boolean;
  resolveRoleDisplay: (assignedUserId: string | null) => AssigneeDisplay;
  meta: FormMetaState;
  loadOperatorMembers: () => void;
  setSelectingRole: (role: RoleSelection | null) => void;
  hideRole: (role: SubmissionAssigneeRole) => void;
  topicTagSectionRef: RefObject<HTMLDivElement | null>;
  updateMeta: <Key extends keyof FormMetaState>(
    key: Key,
    value: FormMetaState[Key],
  ) => void;
  isMoreSettingsExpanded: boolean;
  setIsMoreSettingsExpanded: (next: boolean) => void;
  publishedAtSectionRef: RefObject<HTMLDivElement | null>;
  updatePublishedAt: (nextPublishedAt: string) => void;
  issueSummary: ExtendedSubmissionIssueSummary;
  publishedAtUnconfirmedReason: string;
}

export function FormV2LeftColumn({
  slots,
  slotsSectionRef,
  metricsSectionRef,
  handleSlotUpload,
  handleUnifiedUpload,
  setDeleteTargetRole,
  handleSlotRetry,
  updateSlotsState,
  screenshotsRequired,
  focusedRole,
  highlightedOcrIndex,
  pulseSlots,
  hiddenRoleRestoreLabel,
  showAllRoles,
  hasAnyVisibleRole,
  isScriptAuthorVisible,
  isVideoEditorVisible,
  isOperatorVisible,
  resolveRoleDisplay,
  meta,
  loadOperatorMembers,
  setSelectingRole,
  hideRole,
  topicTagSectionRef,
  updateMeta,
  isMoreSettingsExpanded,
  setIsMoreSettingsExpanded,
  publishedAtSectionRef,
  updatePublishedAt,
  issueSummary,
  publishedAtUnconfirmedReason,
}: FormV2LeftColumnProps) {
  return (
    <div className="flex min-w-0 flex-col gap-3 lg:contents">
      <div ref={slotsSectionRef} className="lg:col-start-1 lg:row-start-1">
        <截图槽位区
          slots={slots}
          onSelectFile={handleSlotUpload}
          onUploadFiles={handleUnifiedUpload}
          onDelete={(role) => setDeleteTargetRole(role)}
          onRetry={handleSlotRetry}
          onManualFill={(role) => {
            updateSlotsState((current) => {
              const hasUploadedScreenshot = Boolean(current[role].assetUrl);
              return {
                ...current,
                [role]: {
                  ...current[role],
                  status: hasUploadedScreenshot ? "confirmed" : "empty",
                  confirmed: hasUploadedScreenshot,
                  requiresManualConfirmation: false,
                  error: null,
                  assetUrl: hasUploadedScreenshot ? current[role].assetUrl : null,
                  previewUrl: hasUploadedScreenshot ? current[role].previewUrl : null,
                  file: hasUploadedScreenshot ? current[role].file : null,
                  fileName: hasUploadedScreenshot ? current[role].fileName : undefined,
                  recognizedFields: null,
                  ocrSummary: undefined,
                  ocrFallback: hasUploadedScreenshot,
                },
              };
            });
            metricsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
          screenshotsRequired={screenshotsRequired}
          focusedRole={focusedRole}
          highlightedOcrIndex={highlightedOcrIndex}
          pulseEmptySlots={pulseSlots}
        />
      </div>

      {/* 左栏下半：设置组。lg 起与右栏「标题文案」同处第三行，共用一条通栏发丝线 */}
      <div className="flex min-w-0 flex-col gap-3 lg:gap-6 lg:col-start-1 lg:row-start-3">
        {/* 共创伙伴 - 底纸纯排版解套，单条发丝线自然分界（lg 起交给通栏线） */}
        <div className="space-y-2 pt-2.5 border-t border-[#E2E2DF]/60 lg:border-t-0 lg:flex-1">
          <div className="flex items-center justify-between">
            <ItemHeading as="h3" className="flex items-center gap-1">
              <span>共创伙伴</span>
            </ItemHeading>
            {hiddenRoleRestoreLabel && (
              <button
                type="button"
                onClick={showAllRoles}
                className="text-[12px] font-normal text-[#D97757] hover:underline"
              >
                {hiddenRoleRestoreLabel}
              </button>
            )}
          </div>

          {!hasAnyVisibleRole ? (
            <div className="text-[12px] text-[#78716C]">
              独立创作完成 · 文案 / 剪辑 / 运营
            </div>
          ) : (
            <div className="space-y-1">
              {isScriptAuthorVisible && (
                <RoleItemRow
                  label="文案"
                  display={resolveRoleDisplay(meta.scriptAuthorUserId)}
                  onOpenSelector={() => {
                    loadOperatorMembers();
                    setSelectingRole({
                       role: "script_author",
                       label: "文案",
                       selectedUserId: meta.scriptAuthorUserId,
                     })
                  }}
                  onResetSelf={() => hideRole("script_author")}
                />
              )}
              {isVideoEditorVisible && (
                <RoleItemRow
                  label="剪辑"
                  display={resolveRoleDisplay(meta.videoEditorUserId)}
                  onOpenSelector={() => {
                    loadOperatorMembers();
                    setSelectingRole({
                       role: "video_editor",
                       label: "剪辑",
                       selectedUserId: meta.videoEditorUserId,
                     })
                  }}
                  onResetSelf={() => hideRole("video_editor")}
                />
              )}
              {isOperatorVisible && (
                <RoleItemRow
                  label="运营"
                  display={resolveRoleDisplay(meta.operatorUserId)}
                  onOpenSelector={() => {
                    loadOperatorMembers();
                    setSelectingRole({
                       role: "operator",
                       label: "运营",
                       selectedUserId: meta.operatorUserId,
                     })
                  }}
                  onResetSelf={() => hideRole("operator")}
                />
              )}
            </div>
          )}

          {/* 题材与形式：标准分段微滑块 */}
          <div className="space-y-2 border-t border-[#E2E2DF]/60 pt-2.5" ref={topicTagSectionRef}>
            {/* 题材标签 */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-normal text-[#1F1E1D]">
                题材标签
              </span>
              <div className="flex items-center p-0.5 rounded-xl bg-[#F1F1F0] sm:h-7">
                {(["干货", "复盘"] as const).map((tag) => {
                  const isSelected = meta.topicTag === tag;
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => updateMeta("topicTag", isSelected ? "" : tag)}
                      className={cn(
                        "inline-flex items-center justify-center h-7 sm:h-6 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 px-3 rounded-md text-[12px] sm:text-[13px] font-normal transition-all cursor-pointer",
                        isSelected
                          ? "bg-white text-[#141413] shadow-input font-normal"
                          : "text-[#78716C] hover:text-[#141413]"
                      )}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 视频形式 */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-normal text-[#1F1E1D]">
                视频形式
              </span>
              <div className="flex items-center p-0.5 rounded-xl bg-[#F1F1F0] sm:h-7">
                {(["出镜", "图文"] as const).map((form) => {
                  const isSelected = meta.videoForm === form;
                  return (
                    <button
                      key={form}
                      type="button"
                      onClick={() => updateMeta("videoForm", form)}
                      className={cn(
                        "inline-flex items-center justify-center h-7 sm:h-6 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 px-3 rounded-md text-[12px] sm:text-[13px] font-normal transition-all cursor-pointer",
                        isSelected
                          ? "bg-white text-[#141413] shadow-input font-normal"
                          : "text-[#78716C] hover:text-[#141413]"
                      )}
                    >
                      {form}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 异常状态补充 */}
          {meta.anomalyStatus === "abnormal" && (
            <div className="pt-2 space-y-2 border-t border-[#E2E2DF]/60">
              {/* 计入月度产量定心丸提示 */}
              <div className="rounded-xl bg-[#F1F1F0] p-2.5 text-[12px] leading-relaxed text-[#78716C] shadow-card-ring">
                <span className="font-normal text-[#141413]">💡 计入月度产量：</span>限流与删稿依然算作今日创作成果，请如实录入已产生的数据或平台处罚通知。
              </div>
              <div className="space-y-1">
                <Label htmlFor="platform_notice">
                  平台通知 (选填)
                </Label>
                <Input
                  id="platform_notice"
                  value={meta.platformNotice || ""}
                  onChange={(e) => updateMeta("platformNotice", e.target.value)}
                  placeholder="如处罚通知文案"
                  className="h-8 rounded-md bg-white border-[#E2E2DF] text-[12px] text-[#1F1E1D] shadow-input focus-visible:border-[#78716C] focus-visible:ring-1 focus-visible:ring-[#141413]/10"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="appeal">
                  申诉进展 (选填)
                </Label>
                <Input
                  id="appeal"
                  value={meta.appeal || ""}
                  onChange={(e) => updateMeta("appeal", e.target.value)}
                  placeholder="如申诉处理中"
                  className="h-8 rounded-md bg-white border-[#E2E2DF] text-[12px] text-[#1F1E1D] shadow-input focus-visible:border-[#78716C] focus-visible:ring-1 focus-visible:ring-[#141413]/10"
                />
              </div>
            </div>
          )}

          {/* 更多设置 */}
          <div>
            <button
              type="button"
              onClick={() => setIsMoreSettingsExpanded(!isMoreSettingsExpanded)}
              className="inline-flex min-h-[44px] sm:min-h-0 items-center gap-1 text-[12px] font-normal text-[#78716C] hover:text-[#1F1E1D] cursor-pointer"
            >
              <ChevronDown
                className={cn(
                  "size-3.5 transition-transform",
                  isMoreSettingsExpanded && "rotate-180"
                )}
              />
              {isMoreSettingsExpanded ? "收起" : "更多设置"}
            </button>

            <AnimatePresence initial={false}>
              {isMoreSettingsExpanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-2 pt-2"
                >
                  <div ref={publishedAtSectionRef} className="space-y-1">
                    <Label>
                      发布时间（以完播截图识别为准）
                    </Label>
                    <PublishedAtPicker
                      value={meta.publishedAt}
                      onChange={updatePublishedAt}
                      disabled
                    />
                    <p className="text-[12px] leading-relaxed text-[#78716C]">
                      所有提交均以完播截图识别的发布时间为准，不能手动修改。
                    </p>
                    {issueSummary.publishedAtUnconfirmed && (
                      <p className="text-[12px] leading-relaxed text-status-warning">
                        {publishedAtUnconfirmedReason}
                      </p>
                    )}
                  </div>
                  <div className="flex justify-between text-[12px] text-[#78716C]">
                    <span>上传时间戳</span>
                    <span className="tabular-nums">{meta.uploadedAt || "—"}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
