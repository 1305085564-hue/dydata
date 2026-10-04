import { prefetchPersonData } from "@/app/(app)/admin/collaboration/person-data";
import type { TabKey } from "@/lib/collaboration/domain/workbench-state";

export function preloadPersonalCardChunk() {
  void import("@/app/(app)/admin/collaboration/personal-card");
}

export function prefetchPerson(
  id: string,
  year: number,
  month: number,
  role?: TabKey,
) {
  preloadPersonalCardChunk();
  prefetchPersonData(id, year, month, role);
}
