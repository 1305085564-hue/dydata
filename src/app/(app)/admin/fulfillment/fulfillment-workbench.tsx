"use client";

import type {
  FulfillmentCalendarData,
  TimeRangePreset,
} from "@/types/fulfillment";
import {
  fetchFulfillmentAppeals,
  fetchFulfillmentSettings,
  loadFulfillmentSettings,
} from "@/lib/fulfillment/data/workbench";
import {
  formatDisplayDate,
  updateMemberDayOptimistically,
} from "@/lib/fulfillment/domain/workbench";
import { usePublishPageEpigraph } from "@/components/editorial/page-epigraph";
import { buildFulfillmentEpigraph } from "@/components/editorial/page-epigraph-copy";
import { useFulfillmentWorkbenchState } from "./fulfillment-workbench-state";
import { useFulfillmentWorkbenchActions } from "./fulfillment-workbench-actions";
import { FulfillmentWorkbenchView } from "./fulfillment-workbench-view";

export {
  fetchFulfillmentAppeals,
  fetchFulfillmentSettings,
  loadFulfillmentSettings,
  formatDisplayDate,
  updateMemberDayOptimistically,
};

interface FulfillmentWorkbenchProps {
  initialData: FulfillmentCalendarData;
  initialRange: TimeRangePreset;
  initialView?: "todo" | "matrix";
  currentUserId?: string;
  canManageSystem?: boolean;
  canManage?: boolean;
}

export function FulfillmentWorkbench({
  initialData,
  initialRange,
  initialView = "matrix",
  currentUserId,
  canManageSystem = false,
  canManage = true,
}: FulfillmentWorkbenchProps) {
  const state = useFulfillmentWorkbenchState({
    initialData,
    initialRange,
    currentUserId,
    canManageSystem,
    canManage,
  });
  const actions = useFulfillmentWorkbenchActions({ state });
  usePublishPageEpigraph("fulfillment", buildFulfillmentEpigraph(state.calendarData.stats));

  return (
    <FulfillmentWorkbenchView
      state={state}
      actions={actions}
      initialView={initialView}
      canManage={canManage}
    />
  );
}
