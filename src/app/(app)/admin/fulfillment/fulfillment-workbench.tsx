"use client";

import type { FulfillmentCalendarData } from "@/types/fulfillment";
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
  currentUserId?: string;
  canManageSystem?: boolean;
  canManage?: boolean;
}

export function FulfillmentWorkbench({
  initialData,
  currentUserId,
  canManageSystem = false,
  canManage = true,
}: FulfillmentWorkbenchProps) {
  const state = useFulfillmentWorkbenchState({
    initialData,
    currentUserId,
    canManageSystem,
    canManage,
  });
  const actions = useFulfillmentWorkbenchActions({ state });

  return <FulfillmentWorkbenchView state={state} actions={actions} canManage={canManage} />;
}
