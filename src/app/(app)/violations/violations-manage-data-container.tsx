import {
  getWeekStartDate,
  loadInboxData,
  loadProcessedData,
  PROCESSED_RPC_READY,
} from "@/app/(app)/violations/admin-components/data";
import { ConversionHubShell } from "@/app/(app)/violations/admin-components/hub-shell";
import { ErrorState } from "@/components/ui/error-state";

interface ViolationsManageDataContainerProps {
  userId: string;
  isOwner: boolean;
}

export async function ViolationsManageDataContainer({
  userId,
  isOwner,
}: ViolationsManageDataContainerProps) {
  try {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "审核队列加载失败";
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-5">
        <ErrorState title="审核队列加载失败" description={message} />
      </div>
    );
  }
}
