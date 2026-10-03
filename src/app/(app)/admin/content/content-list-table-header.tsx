import type { SortField } from "@/lib/content/domain/content-list";

type ContentListTableHeaderProps = {
  isSpacious: boolean;
  sortField: SortField;
  sortDir: "asc" | "desc";
  handleSort: (field: SortField) => void;
};

export function ContentListTableHeader({
  isSpacious,
  sortField,
  sortDir,
  handleSort,
}: ContentListTableHeaderProps) {
  const renderSortIndicator = (field: SortField) => {
    if (sortField !== field) {
      return <span className="text-[12px] text-[#E2E2DF] opacity-0 group-hover:opacity-100 transition-opacity">↕</span>;
    }
    return (
      <span className="text-[12px] font-normal text-[#141413]">
        {sortDir === "desc" ? "▼" : "▲"}
      </span>
    );
  };

  return (
<thead className="sticky top-0 z-10 bg-[#FCFCFB]/85 backdrop-blur-md border-b border-[#E2E2DF]/60 text-[12px] font-normal uppercase tracking-wider text-[#78716C] select-none">
  <tr>
    {/* 1. 状态 */}
    <th className="py-2 px-1 text-center w-[56px] shrink-0 whitespace-nowrap">状态</th>

    {/* 2. 视频标题 / 账号 */}
    <th className="py-2 px-3 text-left w-auto min-w-0">视频标题 / 账号</th>

    {/* 3. 综合评级 */}
    <th className="py-2 px-2 text-center w-[72px] shrink-0 whitespace-nowrap">
      <button
        type="button"
        onClick={() => handleSort("overall_grade")}
        className="group inline-flex items-center justify-center w-full gap-1 font-normal text-[#141413] transition-colors cursor-pointer"
      >
        <span>综合评级</span>
        {renderSortIndicator("overall_grade")}
      </button>
    </th>

    {/* 4. 核心指标（放在互动率前面） */}
    <th className="py-2 px-2 text-right w-[88px] shrink-0 whitespace-nowrap">
      <button
        type="button"
        onClick={() => handleSort("core_metric")}
        className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#78716C] hover:text-[#141413] transition-colors cursor-pointer"
      >
        {renderSortIndicator("core_metric")}
        <span>核心指标</span>
      </button>
    </th>

    {/* 5. 互动率（放在核心指标后面，宽度 58px 不变） */}
    <th className="py-2 px-2 text-right w-[58px] shrink-0 whitespace-nowrap">
      <button
        type="button"
        onClick={() => handleSort("interaction_rate")}
        className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#78716C] hover:text-[#141413] transition-colors cursor-pointer"
      >
        {renderSortIndicator("interaction_rate")}
        <span>互动率</span>
      </button>
    </th>

    {/* 6. 播放量 */}
    <th className="py-2 px-2 text-right w-[64px] shrink-0 whitespace-nowrap">
      <button
        type="button"
        onClick={() => handleSort("play_count")}
        className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#141413] transition-colors cursor-pointer"
      >
        {renderSortIndicator("play_count")}
        <span>播放量</span>
      </button>
    </th>

    {/* 7. 涨粉（48px，px-2） */}
    <th className="py-2 px-2 text-right w-[48px] shrink-0 whitespace-nowrap">
      <button
        type="button"
        onClick={() => handleSort("follower_gain")}
        className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#141413] transition-colors cursor-pointer"
      >
        {renderSortIndicator("follower_gain")}
        <span>涨粉</span>
      </button>
    </th>

    {/* 完整版专属：点赞、评论、分享、收藏 4 列互动明细（统一 48px，px-2 标准边距） */}
    {!isSpacious && (
      <>
        <th className="py-2 px-2 text-right w-[48px] shrink-0 whitespace-nowrap">
          <button
            type="button"
            onClick={() => handleSort("likes")}
            className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#78716C] hover:text-[#141413] transition-colors cursor-pointer"
          >
            {renderSortIndicator("likes")}
            <span>点赞</span>
          </button>
        </th>
        <th className="py-2 px-2 text-right w-[48px] shrink-0 whitespace-nowrap">
          <button
            type="button"
            onClick={() => handleSort("comments")}
            className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#78716C] hover:text-[#141413] transition-colors cursor-pointer"
          >
            {renderSortIndicator("comments")}
            <span>评论</span>
          </button>
        </th>
        <th className="py-2 px-2 text-right w-[48px] shrink-0 whitespace-nowrap">
          <button
            type="button"
            onClick={() => handleSort("shares")}
            className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#78716C] hover:text-[#141413] transition-colors cursor-pointer"
          >
            {renderSortIndicator("shares")}
            <span>分享</span>
          </button>
        </th>
        <th className="py-2 px-2 text-right w-[48px] shrink-0 whitespace-nowrap">
          <button
            type="button"
            onClick={() => handleSort("favorites")}
            className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#78716C] hover:text-[#141413] transition-colors cursor-pointer"
          >
            {renderSortIndicator("favorites")}
            <span>收藏</span>
          </button>
        </th>
      </>
    )}

    {/* 完播指标 (2s跳出、5s完播、均播、完播) - 统一 px-2 标准间距，完播列微调至 58px 消除断层空白 */}
    <th className="py-2 px-2 text-right w-[58px] shrink-0 whitespace-nowrap">
      <button
        type="button"
        onClick={() => handleSort("bounce_rate_2s")}
        className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#78716C] hover:text-[#141413] transition-colors cursor-pointer"
      >
        {renderSortIndicator("bounce_rate_2s")}
        <span>2s跳出</span>
      </button>
    </th>
    <th className="py-2 px-2 text-right w-[58px] shrink-0 whitespace-nowrap">
      <button
        type="button"
        onClick={() => handleSort("completion_rate_5s")}
        className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#78716C] hover:text-[#141413] transition-colors cursor-pointer"
      >
        {renderSortIndicator("completion_rate_5s")}
        <span>5s完播</span>
      </button>
    </th>
    <th className="py-2 px-2 text-right w-[50px] shrink-0 whitespace-nowrap">
      <button
        type="button"
        onClick={() => handleSort("avg_play_duration")}
        className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#78716C] hover:text-[#141413] transition-colors cursor-pointer"
      >
        {renderSortIndicator("avg_play_duration")}
        <span>均播</span>
      </button>
    </th>
    <th className="py-2 px-2 text-right w-[50px] shrink-0 whitespace-nowrap">
      <button
        type="button"
        onClick={() => handleSort("completion_rate")}
        className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#78716C] hover:text-[#141413] transition-colors cursor-pointer"
      >
        {renderSortIndicator("completion_rate")}
        <span>完播</span>
      </button>
    </th>

    {/* 发布时间（84px 严整留白，彻底防止与完播重合） */}
    <th className="py-2 pl-2 pr-4 text-right w-[84px] shrink-0 whitespace-nowrap">
      <button
        type="button"
        onClick={() => handleSort("published_at")}
        className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#141413] transition-colors cursor-pointer"
      >
        {renderSortIndicator("published_at")}
        <span>发布时间</span>
      </button>
    </th>
  </tr>
</thead>
  );
}
