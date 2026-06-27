import { loadReviewQueue } from "@/lib/publish-drafts/read-model";
import { ManageShell } from "../components/manage-shell";

interface ReviewQueueDataContainerProps {
  userId: string;
}

export async function ReviewQueueDataContainer({ userId }: ReviewQueueDataContainerProps) {
  const { data, errorMessage } = await loadReviewQueue(userId);

  if (errorMessage) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-[13px] leading-[1.7] text-[#D99E55]">
        {errorMessage}
      </div>
    );
  }

  const queue = data?.queue ?? [];
  const pendingCount = data?.pending_count ?? 0;

  return <ManageShell initialQueue={queue} initialPendingCount={pendingCount} />;
}
