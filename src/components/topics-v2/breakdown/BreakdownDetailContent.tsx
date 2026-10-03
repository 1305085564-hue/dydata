import type { TopicClaimsDetailResponse, TopicWorksResponse, SubTopicItem } from "../types";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { BreakdownSummarySections } from "./BreakdownSummarySections";
import { BreakdownWorksSection } from "./BreakdownWorksSection";
import type { WorksSort } from "@/lib/topics/domain/work-breakdown";

export function BreakdownDetailContent({
  isLoading,
  subTopicInfo,
  membershipRequired,
  detailError,
  handleClose,
  bestPlay,
  avgPlay,
  qualifiedCount,
  worksTotalItems,
  total7dParticipants,
  completed7dCount,
  inProgress7dCount,
  claimsError,
  claimsData,
  worksQuery,
  loadWorksPage,
  worksError,
  worksLoading,
  activeWorks,
  canReviewContent,
}: {
  isLoading: boolean;
  subTopicInfo: SubTopicItem | null;
  membershipRequired: boolean;
  detailError: string | null;
  handleClose: () => void;
  bestPlay: number | null;
  avgPlay: number | null;
  qualifiedCount: number | null;
  worksTotalItems: number;
  total7dParticipants: number | null;
  completed7dCount: number | null;
  inProgress7dCount: number | null;
  claimsError: string | null;
  claimsData: TopicClaimsDetailResponse | null;
  worksQuery: { page: number; sort: WorksSort };
  loadWorksPage: (page: number, sort: WorksSort) => Promise<void>;
  worksError: string | null;
  worksLoading: boolean;
  activeWorks: TopicWorksResponse | null;
  canReviewContent: boolean;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto pr-1 space-y-5">
      {isLoading && !subTopicInfo ? (
        <div className="py-20 text-center">
          <Loader2 className="size-6 text-[#D97757] animate-spin mx-auto mb-2" />
          <p className="text-[12px] text-[#78716C]">正在加载选题详情...</p>
        </div>
      ) : membershipRequired ? (
        <Card className="p-6">
          <EmptyState
            variant="compact"
            title="请先申请加入团队"
            description="当前账号没有有效团队归属，选题详情暂不可用。"
            action={{
              label: "关闭",
              onClick: handleClose,
            }}
          />
        </Card>
      ) : detailError ? (
        <div className="flex items-start gap-2 rounded-md border border-[#E2E2DF]/60 bg-[#F1F1F0]/60 p-3 text-[13px] text-[#1F1E1D]">
          <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-status-danger/[0.08] text-status-danger mt-0.5">
            <span className="size-1.5 rounded-full bg-current text-status-danger" />
          </span>
          <div className="space-y-0.5 min-w-0 flex-1">
            <p className="font-normal text-[#141413] text-[13px]">详情加载失败</p>
            <p className="text-[12px] text-[#78716C]">{detailError}</p>
          </div>
        </div>
      ) : (
        <>
          <BreakdownSummarySections
            subTopicInfo={subTopicInfo}
            bestPlay={bestPlay}
            avgPlay={avgPlay}
            qualifiedCount={qualifiedCount}
            worksTotalItems={worksTotalItems}
            total7dParticipants={total7dParticipants}
            completed7dCount={completed7dCount}
            inProgress7dCount={inProgress7dCount}
            claimsError={claimsError}
            claimsData={claimsData}
          />
          <BreakdownWorksSection
            worksQuery={worksQuery}
            loadWorksPage={loadWorksPage}
            worksError={worksError}
            worksLoading={worksLoading}
            activeWorks={activeWorks}
            worksTotalItems={worksTotalItems}
            canReviewContent={canReviewContent}
          />
        </>
      )}
    </div>
  );
}
