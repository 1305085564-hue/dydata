"use client";

import { useCallback } from "react";
import type { FulfillmentMemberSummary } from "@/types/fulfillment";
import type { StatsFilterMode } from "./components/fulfillment-stats-overview";

interface FulfillmentWorkbenchSelectionProps {
  exceptionMembers: FulfillmentMemberSummary[];
  today: string;
  setSelectedTeam: (team: string | null) => void;
  setSelectedIds: (value: Set<string> | ((previous: Set<string>) => Set<string>)) => void;
  setStatsFilterMode: (mode: StatsFilterMode) => void;
  setSelectedMember: (member: FulfillmentMemberSummary) => void;
  setSelectedDate: (date: string) => void;
  setSource: (source: "queue" | "matrix") => void;
  setSheetOpen: (open: boolean) => void;
  queueRef: { current: FulfillmentMemberSummary[] };
  queueIndexRef: { current: number };
}

export function useFulfillmentWorkbenchSelection({
  exceptionMembers,
  today,
  setSelectedTeam,
  setSelectedIds,
  setStatsFilterMode,
  setSelectedMember,
  setSelectedDate,
  setSource,
  setSheetOpen,
  queueRef,
  queueIndexRef,
}: FulfillmentWorkbenchSelectionProps) {
  const handleTeamChange = useCallback((team: string | null) => {
    setSelectedTeam(team);
    setSelectedIds(new Set());
  }, [setSelectedIds, setSelectedTeam]);

  // 指标筛选切换会改变队列可见集合，必须同步清空已选，避免批量操作命中隐藏成员
  const handleStatsFilterChange = useCallback((mode: StatsFilterMode) => {
    setStatsFilterMode(mode);
    setSelectedIds(new Set());
  }, [setSelectedIds, setStatsFilterMode]);

  const handleSelectToggle = useCallback((userId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }, [setSelectedIds]);

  const handleSelectAll = useCallback(
    (selected: boolean, targetUserIds?: string[]) => {
      if (selected) {
        if (targetUserIds && targetUserIds.length > 0) {
          setSelectedIds((prev) => new Set([...prev, ...targetUserIds]));
        } else {
          setSelectedIds(new Set(exceptionMembers.map((m) => m.userId)));
        }
      } else {
        if (targetUserIds && targetUserIds.length > 0) {
          setSelectedIds((prev) => {
            const next = new Set(prev);
            targetUserIds.forEach((id) => next.delete(id));
            return next;
          });
        } else {
          setSelectedIds(new Set());
        }
      }
    },
    [exceptionMembers, setSelectedIds],
  );

  const handleQueueMemberClick = useCallback(
    (member: FulfillmentMemberSummary) => {
      queueRef.current = exceptionMembers;
      queueIndexRef.current = exceptionMembers.findIndex(
        (m) => m.userId === member.userId,
      );
      setSelectedMember(member);
      setSelectedDate(today);
      setSource("queue");
      setSheetOpen(true);
    },
    [
      exceptionMembers,
      queueIndexRef,
      queueRef,
      setSelectedDate,
      setSelectedMember,
      setSheetOpen,
      setSource,
      today,
    ],
  );

  const handleMatrixCellClick = useCallback(
    (member: FulfillmentMemberSummary, date: string) => {
      setSelectedMember(member);
      setSelectedDate(date);
      setSource("matrix");
      setSheetOpen(true);
    },
    [setSelectedDate, setSelectedMember, setSheetOpen, setSource],
  );

  return {
    handleTeamChange,
    handleStatsFilterChange,
    handleSelectToggle,
    handleSelectAll,
    handleQueueMemberClick,
    handleMatrixCellClick,
  };
}
