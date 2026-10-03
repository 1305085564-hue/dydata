import Link from "next/link";
import { Button } from "@/components/ui/button";
import { buildDashboardTopicHref } from "@/lib/topics/dashboard-context";
import type { SubTopicItem } from "../types";

export function BreakdownDetailFooter({
  subTopicId,
  subTopicInfo,
  isWritingByCurrentUser,
  onGoToFeishu,
  drawerMode,
}: {
  subTopicId: string;
  subTopicInfo: SubTopicItem | null;
  isWritingByCurrentUser: boolean;
  onGoToFeishu?: (topic: SubTopicItem) => void;
  drawerMode: "detail" | "edit" | "confirm_delete";
}) {
  const isMyWriting =
    isWritingByCurrentUser ||
    subTopicInfo?.isWritingByMe === true ||
    subTopicInfo?.myClaim?.status === "writing";

  return (
    <>
      {/* 详情模式固定底栏 */}
      {drawerMode === "detail" && (
          <div className="shrink-0 pt-3 border-t border-[#E2E2DF] mt-auto flex items-center justify-between gap-3">
            <Link
              href={buildDashboardTopicHref(subTopicId, subTopicInfo?.title)}
              className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-[#E2E2DF] bg-[#F1F1F0] hover:bg-[#EBEBE9] px-3.5 text-[12px] font-normal text-[#1F1E1D] transition-all active:scale-[0.99] active:duration-120 cursor-pointer"
            >
              <span>在工作台录入</span>
            </Link>

            <Button
              size="sm"
              onClick={() => {
                if (subTopicInfo && onGoToFeishu) {
                  onGoToFeishu(subTopicInfo);
                }
              }}
            >
              <span>{isMyWriting ? "继续创作" : "去飞书创作"}</span>
            </Button>
          </div>
      )}
    </>
  );
}
