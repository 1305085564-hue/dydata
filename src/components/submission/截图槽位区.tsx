"use client";

import type { SubmissionSlotRole, SubmissionSlotState } from "./提交状态机";
import { SubmissionSlotCard } from "./截图槽位卡";

interface SubmissionSlotsProps {
  slots: Record<SubmissionSlotRole, SubmissionSlotState & { fileName?: string; error?: string | null; assetUrl?: string | null; ocrSummary?: string[]; errorCode?: string | null }>;
  onSelectFile: (role: SubmissionSlotRole, file: File) => void;
  onDelete: (role: SubmissionSlotRole) => void;
  onRetry?: (role: SubmissionSlotRole) => void;
  onManualFill?: (role: SubmissionSlotRole) => void;
  issueCount?: number;
  screenshotsRequired?: boolean;
  focusedRole?: SubmissionSlotRole | null;
  highlightedOcrIndex?: number | null;
}

const SLOT_META: Array<{
  role: SubmissionSlotRole;
  title: string;
  description: string;
  required: boolean;
}> = [
  { role: "screenshot_1", title: "互动截图", description: "播放数据 + 互动数据 + 推流曲线", required: true },
  { role: "screenshot_2", title: "完播截图", description: "完播/均播/2s跳出/5s完播 + 跳出率/回看率曲线", required: true },
];

export function SubmissionSlotsSection({
  slots,
  onSelectFile,
  onDelete,
  onRetry,
  onManualFill,
  issueCount = 0,
  screenshotsRequired = true,
  focusedRole = null,
  highlightedOcrIndex = null,
}: SubmissionSlotsProps) {
  const showStatusBar = !screenshotsRequired || issueCount > 0;

  return (
    <div className="space-y-4">
      {showStatusBar ? (
        <div className="flex items-center justify-between gap-3">
          {!screenshotsRequired ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-500">
              <span className="size-1.5 rounded-full bg-zinc-300" />
              当前视频状态下截图改为可选
            </span>
          ) : (
            <span />
          )}
          {issueCount > 0 ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#D99E55]/40 bg-white px-2.5 py-1 text-[11px] font-medium text-[#D99E55]">
              <span className="size-1.5 rounded-full bg-[#D99E55]" />
              待处理 {issueCount}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-5">
        {SLOT_META.map((item) => {
          const slot = slots[item.role];
          return (
            <SubmissionSlotCard
              key={item.role}
              role={item.role}
              title={item.title}
              description={item.description}
              required={screenshotsRequired && item.required}
              status={slot.status}
              fileName={slot.fileName}
              error={slot.error}
              assetUrl={slot.assetUrl}
              isHighlighted={focusedRole === item.role}
              confidenceScore={slot.confidenceScore}
              ocrSummary={slot.ocrSummary}
              highlightedOcrIndex={highlightedOcrIndex}
              onSelectFile={(file) => onSelectFile(item.role, file)}
              onDelete={() => onDelete(item.role)}
              onRetry={onRetry ? () => onRetry(item.role) : undefined}
              onManualFill={onManualFill ? () => onManualFill(item.role) : undefined}
              errorCode={slot.errorCode}
            />
          );
        })}
      </div>
    </div>
  );
}

export { SubmissionSlotsSection as 截图槽位区 };
