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

  return (
    <FulfillmentWorkbenchView
      state={state}
      actions={actions}
      initialView={initialView}
      canManage={canManage}
    />
  );
}
