"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import type { FulfillmentDayRecord } from "@/types/fulfillment";
import {
  countsTowardFulfillmentRequirement,
  isFulfilledFulfillmentStatus,
  isManualFulfillmentMarkStatus,
  isWaivedFulfillmentStatus,
  FULFILLMENT_ACTION_LABELS,
  type ManualFulfillmentMarkStatus,
} from "@/lib/fulfillment-status";
import { dispatchFulfillmentDataChanged } from "@/lib/fulfillment-sync";
import { trackUsageEvent } from "@/lib/usage-events/client";
import {
  formatDisplayDate,
  updateMemberDayOptimistically,
} from "@/lib/fulfillment/domain/workbench";
import type { FulfillmentWorkbenchState } from "./fulfillment-workbench-state";

type MarkAction = ManualFulfillmentMarkStatus;

interface FulfillmentWorkbenchActionProps {
  state: FulfillmentWorkbenchState;
}

export function useFulfillmentWorkbenchActions({
  state,
}: FulfillmentWorkbenchActionProps) {
  const {
    today,
    calendarData,
    setCalendarData,
    setFeishuEnabled,
    setIsUpdatingSettings,
    fetchAppeals,
    refreshVisibleCalendar,
    source,
    queueRef,
    queueIndexRef,
    setSelectedIds,
    setSelectedMember,
    setSelectedDate,
    setSheetOpen,
  } = state;

  // 6. 飞书总开关变更处理
  const handleFeishuChange = async (checked: boolean) => {
    setIsUpdatingSettings(true);
    // 乐观更新
    setFeishuEnabled(checked);
    try {
      const res = await fetch("/api/admin/system/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feishuFulfillmentReminderEnabled: checked }),
      });
      if (!res.ok) {
        throw new Error("更新失败");
      }
    } catch {
      toast.error("更新飞书催交配置失败，已回滚");
      setFeishuEnabled(!checked);
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  // 7. 处理补交审批动作：只更新补交单状态，不触碰考勤日历
  const handleHandleAppeal = useCallback(
    async (appealId: string, decision: "approve" | "reject", reason?: string) => {
      try {
        const res = await fetch("/api/admin/fulfillment/appeal/handle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ appealId, decision, ...(reason ? { reason } : {}) }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "操作失败" }));
          toast.error(err.error || "操作失败");
          return;
        }

        await fetchAppeals();
      } catch {
        toast.error("处理补交发生网络错误");
      }
    },
    [fetchAppeals],
  );

  const handleReviewPendingExemption = useCallback(
    async (requestId: string, action: "approved" | "rejected") => {
      const response = await fetch("/api/exemptions/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: requestId, action, feedback: null }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: "未能保存审批结果" }));
        throw new Error(payload.error || "未能保存审批结果");
      }
      await refreshVisibleCalendar();
      dispatchFulfillmentDataChanged({
        source: "fulfillment-calendar",
        requestIds: [requestId],
      });
    },
    [refreshVisibleCalendar],
  );

  // 10. 操作回调
  const handleActionComplete = useCallback(() => {
    setSelectedIds(new Set());

    // 重新拉取最新的日历和申诉
    fetchAppeals();
    fetch(
      `/api/admin/fulfillment/calendar?year=${calendarData.year}&month=${calendarData.month}`,
    ).then(async (res) => {
      if (res.ok) {
        const r = await res.json();
        setCalendarData(r.data);
      }
    });

    if (source === "queue") {
      const queue = queueRef.current;
      const nextIndex = queueIndexRef.current + 1;
      const nextMember = queue[nextIndex];

      if (nextMember) {
        queueIndexRef.current = nextIndex;
        setSelectedMember(nextMember);
        setSelectedDate(today);
      } else {
        setSheetOpen(false);
      }
    } else {
      setSheetOpen(false);
    }
  }, [source, today, calendarData.year, calendarData.month, fetchAppeals, queueIndexRef, queueRef, setCalendarData, setSelectedDate, setSelectedIds, setSelectedMember, setSheetOpen]);

  const handleUndoMark = useCallback(
    async (
      userId: string,
      date: string,
      expectedCurrentStatus: MarkAction,
      prevRecord?: FulfillmentDayRecord,
    ) => {
      // 1. 防御竞态：若当前格子已被后续操作变更，则安全阻断，避免覆盖更新的决策
      const currentTargetMember = calendarData.members.find((m) => m.userId === userId);
      const currentCellStatus = currentTargetMember?.days[date]?.status;
      if (currentCellStatus && currentCellStatus !== expectedCurrentStatus) {
        toast.info("该记录已发生后续调整，无法撤销旧操作");
        return;
      }

      const originalMembers = calendarData.members;
      const userName = currentTargetMember?.userName || "成员";
      const dateLabel = formatDisplayDate(date, today);
      const prevStatus = prevRecord?.status;

      // 乐观回滚
      if (prevStatus) {
        setCalendarData((prev) => ({
          ...prev,
          members: updateMemberDayOptimistically(
            prev.members,
            userId,
            date,
            prevStatus,
          ),
        }));
      }

      try {
        if (prevStatus && isManualFulfillmentMarkStatus(prevStatus)) {
          const res = await fetch("/api/admin/fulfillment/mark", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId,
              recordDate: date,
              status: prevStatus,
              reason: prevRecord?.reason || "",
            }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: "撤销失败" }));
            throw new Error(err.error || "撤销失败");
          }
        } else {
          const res = await fetch("/api/admin/fulfillment/remove", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId,
              recordDate: date,
            }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: "撤销失败" }));
            throw new Error(err.error || "撤销失败");
          }
        }

        toast.success(`已撤销对 ${userName} ${dateLabel} 的标记`);
        void fetchAppeals();
        void refreshVisibleCalendar();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "撤销失败，请重试");
        setCalendarData((prev) => ({ ...prev, members: originalMembers }));
      }
    },
    [calendarData.members, fetchAppeals, refreshVisibleCalendar, setCalendarData, today],
  );

  const handleQuickMarkCell = useCallback(
    async (userId: string, date: string, action: MarkAction) => {
      const originalMembers = calendarData.members;
      const targetMember = originalMembers.find((m) => m.userId === userId);
      const prevRecord = targetMember?.days[date];
      const userName = targetMember?.userName || "成员";
      const actionLabel = FULFILLMENT_ACTION_LABELS[action] || action;
      const dateLabel = formatDisplayDate(date, today);

      // 乐观更新
      setCalendarData((prev) => ({
        ...prev,
        members: updateMemberDayOptimistically(
          prev.members,
          userId,
          date,
          action,
        ),
      }));

      try {
        const res = await fetch("/api/admin/fulfillment/mark", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            recordDate: date,
            status: action,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "改判失败" }));
          throw new Error(err.error || "改判失败");
        }

        toast.success(`已将 ${userName} ${dateLabel} 标记为「${actionLabel}」`, {
          action: {
            label: "撤销",
            onClick: () => {
              void handleUndoMark(userId, date, action, prevRecord);
            },
          },
          duration: 5000,
        });

        trackUsageEvent({
          path: "/admin/fulfillment",
          eventType: "mark_fulfillment_status",
        });

        void fetchAppeals();
        const calendarRes = await fetch(
          `/api/admin/fulfillment/calendar?year=${calendarData.year}&month=${calendarData.month}`,
        );
        if (calendarRes.ok) {
          const refreshResult = await calendarRes.json();
          setCalendarData(refreshResult.data);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "网络错误，改判失败");
        setCalendarData((prev) => ({ ...prev, members: originalMembers }));
      }
    },
    [
      calendarData.members,
      calendarData.year,
      calendarData.month,
      fetchAppeals,
      handleUndoMark,
      setCalendarData,
      today,
    ],
  );

  // 11. 快速与批量打标的乐观更新机制
  const handleQuickMark = useCallback(
    async (userId: string, status: MarkAction) => {
      const originalMembers = calendarData.members;
      const targetMember = originalMembers.find((m) => m.userId === userId);
      const prevRecord = targetMember?.days[today];
      const userName = targetMember?.userName || "成员";
      const actionLabel = FULFILLMENT_ACTION_LABELS[status] || status;

      // 乐观更新状态
      setCalendarData((prev) => ({
        ...prev,
        members: updateMemberDayOptimistically(
          prev.members,
          userId,
          today,
          status,
        ),
      }));

      // 静默发包
      try {
        const res = await fetch("/api/admin/fulfillment/mark", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            recordDate: today,
            status,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "标记失败" }));
          throw new Error(err.error || "标记失败");
        }

        toast.success(`已将 ${userName} 今日标记为「${actionLabel}」`, {
          action: {
            label: "撤销",
            onClick: () => {
              void handleUndoMark(userId, today, status, prevRecord);
            },
          },
          duration: 5000,
        });

        trackUsageEvent({
          path: "/admin/fulfillment",
          eventType: "mark_fulfillment_status",
        });

        // 后台静默刷新以同步统计大盘
        const refreshRes = await fetch(
          `/api/admin/fulfillment/calendar?year=${calendarData.year}&month=${calendarData.month}`,
        );
        if (refreshRes.ok) {
          const refreshResult = await refreshRes.json();
          setCalendarData(refreshResult.data);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "标记失败，已回滚");
        setCalendarData((prev) => ({ ...prev, members: originalMembers }));
      }
    },
    [
      calendarData.members,
      calendarData.year,
      calendarData.month,
      handleUndoMark,
      setCalendarData,
      today,
    ],
  );

  const handleBatchMark = useCallback(
    async (userIds: string[], status: MarkAction, reason: string) => {
      const originalMembers = calendarData.members;

      // 乐观更新状态
      setCalendarData((prev) => {
        const nextMembers = prev.members.map((m) => {
          if (!userIds.includes(m.userId)) return m;
          const originalRecord = m.days[today];
          const newRecord = {
            ...originalRecord,
            userId: m.userId,
            userName: m.userName,
            teamId: m.teamId,
            teamName: m.teamName,
            date: today,
            status,
            reason,
            markedByName: "您",
            publishedCount: originalRecord?.publishedCount || 0,
            consecutiveMissing: 0,
          };
          const nextDays = { ...m.days, [today]: newRecord };

          let publishedDays = 0;
          let leaveDays = 0;
          let waivedDays = 0;
          let absentDays = 0;
          let publishedCount = 0;
          let requiredCount = 0;
          Object.values(nextDays).forEach((d) => {
            publishedCount += d.publishedCount;
            if (isFulfilledFulfillmentStatus(d.status))
              publishedDays++;
            else if (d.status === "leave") leaveDays++;
            else if (isWaivedFulfillmentStatus(d.status))
              waivedDays++;
            else if (d.status === "absent") absentDays++;
            if (countsTowardFulfillmentRequirement(d.status)) {
              requiredCount++;
            }
          });

          return {
            ...m,
            consecutiveMissing: 0,
            publishedDays,
            leaveDays,
            waivedDays,
            absentDays,
            publishedCount,
            requiredCount,
            remainingCount: Math.max(0, requiredCount - publishedCount),
            fulfillmentRate:
              requiredCount > 0
                ? Math.round((publishedCount / requiredCount) * 100)
                : 0,
            days: nextDays,
          };
        });
        return { ...prev, members: nextMembers };
      });

      setSelectedIds(new Set());

      // 静默发包
      try {
        const res = await fetch("/api/admin/fulfillment/bulk-mark", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userIds,
            recordDate: today,
            status,
            reason: reason || null,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "批量标记失败" }));
          throw new Error(err.error || "批量标记失败");
        }
        trackUsageEvent({
          path: "/admin/fulfillment",
          eventType: "mark_fulfillment_status",
        });

        // 后台静默刷新以同步统计大盘
        const refreshRes = await fetch(
          `/api/admin/fulfillment/calendar?year=${calendarData.year}&month=${calendarData.month}`,
        );
        if (refreshRes.ok) {
          const refreshResult = await refreshRes.json();
          setCalendarData(refreshResult.data);
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "批量标记失败，已回滚",
        );
        setCalendarData((prev) => ({ ...prev, members: originalMembers }));
      }
    },
    [calendarData.members, calendarData.year, calendarData.month, setCalendarData, setSelectedIds, today],
  );

  return {
    handleFeishuChange,
    handleHandleAppeal,
    handleReviewPendingExemption,
    handleActionComplete,
    handleQuickMarkCell,
    handleQuickMark,
    handleBatchMark,
    handleUndoMark,
  };
}
