export const FULFILLMENT_DATA_CHANGED_EVENT = "dydata:fulfillment-data-changed";

export type FulfillmentDataChangedDetail = {
  source: "command-hub" | "fulfillment-calendar";
  requestIds: string[];
};

export function dispatchFulfillmentDataChanged(detail: FulfillmentDataChangedDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<FulfillmentDataChangedDetail>(FULFILLMENT_DATA_CHANGED_EVENT, {
      detail,
    }),
  );
}
