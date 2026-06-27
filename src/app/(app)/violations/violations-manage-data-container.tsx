import {
  getWeekStartDate,
  loadInboxData,
  loadProcessedData,
  PROCESSED_RPC_READY,
} from "@/app/(app)/violations/admin-components/data";
import { ConversionHubShell } from "@/app/(app)/violations/admin-components/hub-shell";

interface ViolationsManageDataContainerProps {
  userId: string;
  isOwner: boolean;
}

export async function ViolationsManageDataContainer({
  userId,
  isOwner,
}: ViolationsManageDataContainerProps) {
  const [{ data: inbox, counts: inboxCounts }, { processed }] = await Promise.all([
    loadInboxData(userId),
    loadProcessedData(userId),
  ]);

  return (
    <ConversionHubShell
      weekStart={getWeekStartDate()}
      inbox={inbox}
      inboxCounts={inboxCounts}
      processed={processed}
      processedPending={!PROCESSED_RPC_READY}
      layoutVariant="embedded"
      isOwner={isOwner}
    />
  );
}
