"use client";

import { useCallback } from "react";
import type { FulfillmentMemberSummary } from "@/types/fulfillment";
import type { RosterSegment } from "./fulfillment-page-view";

interface FulfillmentWorkbenchSelectionProps {
  exceptionMembers: FulfillmentMemberSummary[];
  today: string;
  setSelectedTeam: (team: string | null) => void;
  setSelectedIds: (value: Set<string> | ((previous: Set<string>) => Set<string>)) => void;
  setSegment: (segment: RosterSegment) => void;
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
  setSegment,
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

  // 分段只收窄大表；今天待处理名单不跟着变，已选不必清空
  const handleSegmentChange = useCallback((next: RosterSegment) => {
    setSegment(next);
  }, [setSegment]);

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
    handleSegmentChange,
    handleSelectToggle,
    handleSelectAll,
    handleQueueMemberClick,
    handleMatrixCellClick,
  };
}
