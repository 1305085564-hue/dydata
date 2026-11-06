import { useState, useTransition, type Dispatch, type SetStateAction } from "react";

import { ExemptionDialogV2 } from "@/app/(app)/dashboard/redesign/exemption-dialog-v2";
import { submitExemptionRequest } from "@/app/(app)/dashboard/actions";
import type { ExemptionDateBuckets } from "@/lib/豁免";

type VideoSubmitPanelExemptionDialogProps = {
  isExemptionDialogOpen: boolean;
  setIsExemptionDialogOpen: (open: boolean) => void;
  today: string;
  submittedDatesIncludingActivity: string[];
  allExemptionDateBuckets: ExemptionDateBuckets;
  localPendingExemptionDates: string[];
  setLocalHasPendingExemption: (value: boolean) => void;
  setLocalPendingExemptionDates: Dispatch<SetStateAction<string[]>>;
  loadActivity: () => void | Promise<void>;
};

export function VideoSubmitPanelExemptionDialog({
  isExemptionDialogOpen,
  setIsExemptionDialogOpen,
  today,
  submittedDatesIncludingActivity,
  allExemptionDateBuckets,
  localPendingExemptionDates,
  setLocalHasPendingExemption,
  setLocalPendingExemptionDates,
  loadActivity,
}: VideoSubmitPanelExemptionDialogProps) {
  // 提交豁免成功后 revalidatePath("/dashboard") 会重取整页；包进过渡保留当前画面、不闪骨架（对齐 health-bar / premium-settings-modal）。
  const [, startExemptionTransition] = useTransition();
  // 弹窗常驻挂载，关闭时才能播完退场动画；每次重新打开换一个 key，保证日历选择等状态清零（等同以前的卸载重建）。
  const [openCount, setOpenCount] = useState(0);
  const [wasOpen, setWasOpen] = useState(isExemptionDialogOpen);
  if (isExemptionDialogOpen !== wasOpen) {
    setWasOpen(isExemptionDialogOpen);
    if (isExemptionDialogOpen) setOpenCount((n) => n + 1);
  }

  return (
    <>
      {/* 申请豁免弹窗 */}
      <ExemptionDialogV2
          key={openCount}
          isOpen={isExemptionDialogOpen}
          onClose={() => setIsExemptionDialogOpen(false)}
          today={today}
          submittedDates={submittedDatesIncludingActivity}
          waiveDates={allExemptionDateBuckets.waiveDates}
          leaveDates={allExemptionDateBuckets.leaveDates}
          pendingDates={localPendingExemptionDates}
          onSubmitRequest={(request) =>
            new Promise<Awaited<ReturnType<typeof submitExemptionRequest>>>((resolve, reject) => {
              startExemptionTransition(async () => {
                try {
                  const result = await submitExemptionRequest(request);
                  if (!result.error) {
                    setLocalHasPendingExemption(true);
                    setLocalPendingExemptionDates((current) =>
                      Array.from(
                        new Set([...current, ...(result.submittedDates ?? [])]),
                      ).sort(),
                    );
                    setIsExemptionDialogOpen(false);
                    void loadActivity();
                  }
                  resolve(result);
                } catch (error) {
                  // 断网/请求中断/发版后 action 失配等：把异常接回给弹窗，
                  // 由其 catch 复位按钮并提示失败，避免 Promise 永不 settle 导致永久卡在"提交中"。
                  reject(error);
                }
              });
            })
          }
        />

    </>
  );
}
