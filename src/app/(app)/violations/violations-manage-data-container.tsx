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

async function loadManageData(userId: string) {
  try {
    const [{ data: inbox, counts: inboxCounts }, { processed }] = await Promise.all([
      loadInboxData(userId),
      loadProcessedData(userId),
    ]);
    return { ok: true as const, inbox, inboxCounts, processed };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "审核队列加载失败",
    };
  }
}

export async function ViolationsManageDataContainer({
  userId,
  isOwner,
}: ViolationsManageDataContainerProps) {
  const result = await loadManageData(userId);
  if (!result.ok) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-5">
        <ErrorState title="审核队列加载失败" description={result.message} />
      </div>
    );
  }

  return (
    <ConversionHubShell
      weekStart={getWeekStartDate()}
      inbox={result.inbox}
      inboxCounts={result.inboxCounts}
      processed={result.processed}
      processedPending={!PROCESSED_RPC_READY}
      layoutVariant="embedded"
      isOwner={isOwner}
    />
  );
}
