import { RefreshCw } from "lucide-react";

export function TopicHubToolbar({
  activeLoading,
  poolLoading,
  onRefresh,
}: {
  activeLoading: boolean;
  poolLoading: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#F1F1F0] text-[12px] font-normal text-[#78716C]">
        <span className="size-1.5 rounded-full bg-current text-status-success" />
        <span>八大母题体系</span>
      </span>
      <button
        type="button"
        onClick={onRefresh}
        title="刷新大盘数据"
        className="p-2 sm:p-1.5 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center rounded-md text-[#78716C] hover:text-[#141413] hover:bg-[#EBEBE9] transition-colors cursor-pointer"
        aria-label="刷新大盘数据"
      >
        <RefreshCw
          className={`size-3.5 ${
            activeLoading || poolLoading ? "animate-spin text-[#D97757]" : ""
          }`}
        />
      </button>
    </div>
  );
}
