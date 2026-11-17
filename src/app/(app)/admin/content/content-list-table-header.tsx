import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DEFAULT_EVALUATION_STANDARDS,
  EVALUATION_METRICS,
  type EvaluationMetric,
  type EvaluationStandards,
} from "@/lib/evaluation-standards";
import { KPI_PLAY_EXCELLENT, KPI_PLAY_FLOOR, KPI_PLAY_GOOD } from "@/lib/breakout-rating";
import type { SortField } from "@/lib/content/domain/content-list";

type ContentListTableHeaderProps = {
  isSpacious: boolean;
  sortField: SortField;
  sortDir: "asc" | "desc";
  handleSort: (field: SortField) => void;
  hoveredColKey?: string | null;
  evaluationStandards?: EvaluationStandards;
};

function MetricHeaderTooltip({
  children,
  tip,
}: {
  children: React.ReactElement;
  tip: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="top" align="end" className="max-w-xs text-left leading-relaxed">
        {tip}
      </TooltipContent>
    </Tooltip>
  );
}

export function ContentListTableHeader({
  isSpacious,
  sortField,
  sortDir,
  handleSort,
  hoveredColKey,
  evaluationStandards = DEFAULT_EVALUATION_STANDARDS,
}: ContentListTableHeaderProps) {
  const standardLineFor = (metric: EvaluationMetric): string => {
    const meta = EVALUATION_METRICS.find((item) => item.key === metric)!;
    const band = evaluationStandards[metric];
    const goodOp = meta.lowerIsBetter ? "≤" : "≥";
    const poorOp = meta.lowerIsBetter ? ">" : metric === "avgPlayRatio" ? "<" : "≤";
    return `${meta.label}：好 ${goodOp}${band.good}${meta.unit} · 差 ${poorOp}${band.poor}${meta.unit}（低于 ${evaluationStandards.minPlayCount.toLocaleString("zh-CN")} 播放计样本不足）`;
  };
  // 当前列的 aria-sort 值。此前排序状态只由 ▼/▲/↕ 三个字符表达，
  // 且未排序列的 ↕ 是 opacity-0 只有 hover 才显形——读屏与键盘用户完全无从得知
  // 当前按哪列、升序还是降序（2026-10-11 审计 M4）。
  const ariaSortFor = (field: SortField): "ascending" | "descending" | "none" =>
    sortField === field ? (sortDir === "desc" ? "descending" : "ascending") : "none";

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
<thead className="sticky top-0 z-30 bg-[#FCFCFB]/85 backdrop-blur-md border-b border-[#E2E2DF]/60 text-[12px] font-normal uppercase tracking-wider text-[#78716C] select-none">
  <tr>
    {/* 1. 状态（横向滚动冻结首列） */}
    <th data-col-key="status" className={cn("sticky left-0 z-30 bg-[#FCFCFB] font-normal py-2 px-1 text-center w-[61px] shrink-0 whitespace-nowrap transition-colors", hoveredColKey === "status" && "bg-surface-sand")}>状态</th>

    {/* 2. 视频标题 / 负责人（横向滚动冻结次列，右侧发丝分割线） */}
    <th data-col-key="title" className={cn("sticky left-[61px] z-30 bg-[#FCFCFB] shadow-[1px_0_0_0_#E2E2DF] font-normal py-2 px-3 text-left w-[347px] whitespace-nowrap transition-colors", hoveredColKey === "title" && "bg-surface-sand")}>视频标题 / 负责人</th>

    {/* 6. 播放量 */}
    <th data-col-key="play_count" className={cn("font-normal py-2 px-2 text-right w-[69px] shrink-0 whitespace-nowrap transition-colors", hoveredColKey === "play_count" && "bg-surface-sand")} aria-sort={ariaSortFor("play_count")}>
      <button
        aria-label={`按播放量排序${sortField === "play_count" ? (sortDir === "desc" ? "（当前降序，点击改升序）" : "（当前升序，点击改降序）") : ""}`}
        type="button"
        onClick={() => handleSort("play_count")}
        className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#141413] transition-colors cursor-pointer"
      >
        {renderSortIndicator("play_count")}
        <span>播放量</span>
      </button>
    </th>

    {/* 7. 涨粉（48px，px-2） */}
    <th data-col-key="follower_gain" className={cn("font-normal py-2 px-2 text-right w-[50px] shrink-0 whitespace-nowrap transition-colors", hoveredColKey === "follower_gain" && "bg-surface-sand")} aria-sort={ariaSortFor("follower_gain")}>
      <button
        aria-label={`按涨粉排序${sortField === "follower_gain" ? (sortDir === "desc" ? "（当前降序，点击改升序）" : "（当前升序，点击改降序）") : ""}`}
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
        <th data-col-key="likes" className={cn("font-normal py-2 pl-4 pr-2 text-right w-[64px] shrink-0 whitespace-nowrap transition-colors", hoveredColKey === "likes" && "bg-surface-sand")} aria-sort={ariaSortFor("likes")}>
          <button
        aria-label={`按点赞排序${sortField === "likes" ? (sortDir === "desc" ? "（当前降序，点击改升序）" : "（当前升序，点击改降序）") : ""}`}
            type="button"
            onClick={() => handleSort("likes")}
            className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#78716C] hover:text-[#141413] transition-colors cursor-pointer"
          >
            {renderSortIndicator("likes")}
            <span>点赞</span>
          </button>
        </th>
        <th data-col-key="comments" className={cn("font-normal py-2 px-2 text-right w-[50px] shrink-0 whitespace-nowrap transition-colors", hoveredColKey === "comments" && "bg-surface-sand")} aria-sort={ariaSortFor("comments")}>
          <button
        aria-label={`按评论排序${sortField === "comments" ? (sortDir === "desc" ? "（当前降序，点击改升序）" : "（当前升序，点击改降序）") : ""}`}
            type="button"
            onClick={() => handleSort("comments")}
            className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#78716C] hover:text-[#141413] transition-colors cursor-pointer"
          >
            {renderSortIndicator("comments")}
            <span>评论</span>
          </button>
        </th>
        <th data-col-key="shares" className={cn("font-normal py-2 px-2 text-right w-[50px] shrink-0 whitespace-nowrap transition-colors", hoveredColKey === "shares" && "bg-surface-sand")} aria-sort={ariaSortFor("shares")}>
          <button
        aria-label={`按分享排序${sortField === "shares" ? (sortDir === "desc" ? "（当前降序，点击改升序）" : "（当前升序，点击改降序）") : ""}`}
            type="button"
            onClick={() => handleSort("shares")}
            className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#78716C] hover:text-[#141413] transition-colors cursor-pointer"
          >
            {renderSortIndicator("shares")}
            <span>分享</span>
          </button>
        </th>
        <th data-col-key="favorites" className={cn("font-normal py-2 px-2 text-right w-[50px] shrink-0 whitespace-nowrap transition-colors", hoveredColKey === "favorites" && "bg-surface-sand")} aria-sort={ariaSortFor("favorites")}>
          <button
        aria-label={`按收藏排序${sortField === "favorites" ? (sortDir === "desc" ? "（当前降序，点击改升序）" : "（当前升序，点击改降序）") : ""}`}
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

    {/* 完播指标：统一在列头展示合格/优秀标准线 */}
    <th data-col-key="bounce_rate_2s" className={cn("font-normal py-2 pl-4 pr-2 text-right w-[77px] shrink-0 whitespace-nowrap transition-colors", hoveredColKey === "bounce_rate_2s" && "bg-surface-sand")} aria-sort={ariaSortFor("bounce_rate_2s")}>
      <MetricHeaderTooltip tip={standardLineFor("bounceRate2s")}>
        <button
          aria-label={`按2s跳出排序${sortField === "bounce_rate_2s" ? (sortDir === "desc" ? "（当前降序，点击改升序）" : "（当前升序，点击改降序）") : ""}`}
          type="button"
          onClick={() => handleSort("bounce_rate_2s")}
          className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#78716C] hover:text-[#141413] transition-colors cursor-pointer"
        >
          {renderSortIndicator("bounce_rate_2s")}
          <span className="border-b border-dashed border-[#D6D3D1] group-hover:border-[#78716C] transition-colors"><span>2s跳出</span></span>
        </button>
      </MetricHeaderTooltip>
    </th>
    <th data-col-key="completion_rate_5s" className={cn("font-normal py-2 px-2 text-right w-[73px] shrink-0 whitespace-nowrap transition-colors", hoveredColKey === "completion_rate_5s" && "bg-surface-sand")} aria-sort={ariaSortFor("completion_rate_5s")}>
      <MetricHeaderTooltip tip={standardLineFor("completionRate5s")}>
        <button
          aria-label={`按5s完播排序${sortField === "completion_rate_5s" ? (sortDir === "desc" ? "（当前降序，点击改升序）" : "（当前升序，点击改降序）") : ""}`}
          type="button"
          onClick={() => handleSort("completion_rate_5s")}
          className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#78716C] hover:text-[#141413] transition-colors cursor-pointer"
        >
          {renderSortIndicator("completion_rate_5s")}
          <span className="border-b border-dashed border-[#D6D3D1] group-hover:border-[#78716C] transition-colors"><span>5s完播</span></span>
        </button>
      </MetricHeaderTooltip>
    </th>
    <th data-col-key="avg_play_duration" className={cn("font-normal py-2 px-2 text-right w-[63px] shrink-0 whitespace-nowrap transition-colors", hoveredColKey === "avg_play_duration" && "bg-surface-sand")} aria-sort={ariaSortFor("avg_play_duration")}>
      <MetricHeaderTooltip tip={standardLineFor("avgPlayDuration")}>
        <button
          aria-label={`按均播排序${sortField === "avg_play_duration" ? (sortDir === "desc" ? "（当前降序，点击改升序）" : "（当前升序，点击改降序）") : ""}`}
          type="button"
          onClick={() => handleSort("avg_play_duration")}
          className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#78716C] hover:text-[#141413] transition-colors cursor-pointer"
        >
          {renderSortIndicator("avg_play_duration")}
          <span className="border-b border-dashed border-[#D6D3D1] group-hover:border-[#78716C] transition-colors"><span>均播</span></span>
        </button>
      </MetricHeaderTooltip>
    </th>
    <th data-col-key="avg_play_ratio" className={cn("font-normal py-2 px-2 text-right w-[78px] shrink-0 whitespace-nowrap transition-colors", hoveredColKey === "avg_play_ratio" && "bg-surface-sand")} aria-sort={ariaSortFor("avg_play_ratio")}>
      <MetricHeaderTooltip tip={standardLineFor("avgPlayRatio")}>
        <button
          aria-label={`按播放占比排序${sortField === "avg_play_ratio" ? (sortDir === "desc" ? "（当前降序，点击改升序）" : "（当前升序，点击改降序）") : ""}`}
          type="button"
          onClick={() => handleSort("avg_play_ratio")}
          className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#78716C] hover:text-[#141413] transition-colors cursor-pointer"
        >
          {renderSortIndicator("avg_play_ratio")}
          <span className="border-b border-dashed border-[#D6D3D1] group-hover:border-[#78716C] transition-colors"><span>播放占比</span></span>
        </button>
      </MetricHeaderTooltip>
    </th>
    <th data-col-key="completion_rate" className={cn("font-normal py-2 px-2 text-right w-[63px] shrink-0 whitespace-nowrap transition-colors", hoveredColKey === "completion_rate" && "bg-surface-sand")} aria-sort={ariaSortFor("completion_rate")}>
      <MetricHeaderTooltip tip={standardLineFor("completionRate")}>
        <button
          aria-label={`按完播排序${sortField === "completion_rate" ? (sortDir === "desc" ? "（当前降序，点击改升序）" : "（当前升序，点击改降序）") : ""}`}
          type="button"
          onClick={() => handleSort("completion_rate")}
          className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#78716C] hover:text-[#141413] transition-colors cursor-pointer"
        >
          {renderSortIndicator("completion_rate")}
          <span className="border-b border-dashed border-[#D6D3D1] group-hover:border-[#78716C] transition-colors"><span>完播</span></span>
        </button>
      </MetricHeaderTooltip>
    </th>

    <th data-col-key="interaction_rate" className={cn("font-normal py-2 px-2 text-right w-[62px] shrink-0 whitespace-nowrap transition-colors", hoveredColKey === "interaction_rate" && "bg-surface-sand")} aria-sort={ariaSortFor("interaction_rate")}>
      <MetricHeaderTooltip tip={`（点赞+评论+分享+收藏）÷ 播放量；参考基准 ${evaluationStandards.targets.interactionRate}%（达成率好 ≥${evaluationStandards.interactionAchievement.good}% · 差 ≤${evaluationStandards.interactionAchievement.poor}%）`}>
        <button
          aria-label={`按互动率排序${sortField === "interaction_rate" ? (sortDir === "desc" ? "（当前降序，点击改升序）" : "（当前升序，点击改降序）") : ""}`}
          type="button"
          onClick={() => handleSort("interaction_rate")}
          className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#78716C] hover:text-[#141413] transition-colors cursor-pointer"
        >
          {renderSortIndicator("interaction_rate")}
          <span className="border-b border-dashed border-[#D6D3D1] group-hover:border-[#78716C] transition-colors"><span>互动率</span></span>
        </button>
      </MetricHeaderTooltip>
    </th>

    <th data-col-key="retention_achievement" className={cn("font-normal py-2 px-2 text-right w-[78px] shrink-0 whitespace-nowrap transition-colors", hoveredColKey === "retention_achievement" && "bg-surface-sand")} aria-sort={ariaSortFor("retention_achievement")}>
      <MetricHeaderTooltip tip="按 2s 跳出 / 5s 完播 / 均播与播放占比 / 整体完播权重加权计算达成率；缺项时按均播或占比折算">
        <button
          aria-label={`按留存达成排序${sortField === "retention_achievement" ? (sortDir === "desc" ? "（当前降序，点击改升序）" : "（当前升序，点击改降序）") : ""}`}
          type="button"
          onClick={() => handleSort("retention_achievement")}
          className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#78716C] hover:text-[#141413] transition-colors cursor-pointer"
        >
          {renderSortIndicator("retention_achievement")}
          <span className="border-b border-dashed border-[#D6D3D1] group-hover:border-[#78716C] transition-colors"><span>留存达成</span></span>
        </button>
      </MetricHeaderTooltip>
    </th>
    <th data-col-key="overall_grade" className={cn("font-normal py-2 px-2 text-right w-[58px] shrink-0 whitespace-nowrap transition-colors", hoveredColKey === "overall_grade" && "bg-surface-sand")} aria-sort={ariaSortFor("overall_grade")}>
      <MetricHeaderTooltip tip={`互动与留存达成均 ≥100% 且均 ≥80% 评优；≥80% 且均 ≥60% 评良；低于 ${KPI_PLAY_FLOOR.toLocaleString("zh-CN")} 播放直接评普，低于 ${KPI_PLAY_GOOD.toLocaleString("zh-CN")} 最高普，低于 ${KPI_PLAY_EXCELLENT.toLocaleString("zh-CN")} 最高良`}>
        <button
          aria-label={`按评级排序${sortField === "overall_grade" ? (sortDir === "desc" ? "（当前降序，点击改升序）" : "（当前升序，点击改降序）") : ""}`}
          type="button"
          onClick={() => handleSort("overall_grade")}
          className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#78716C] hover:text-[#141413] transition-colors cursor-pointer"
        >
          {renderSortIndicator("overall_grade")}
          <span className="border-b border-dashed border-[#D6D3D1] group-hover:border-[#78716C] transition-colors"><span>评级</span></span>
        </button>
      </MetricHeaderTooltip>
    </th>

    {/* 发布时间 */}
    <th data-col-key="published_at" className={cn("font-normal py-2 px-1 text-right w-[67px] shrink-0 whitespace-nowrap transition-colors", hoveredColKey === "published_at" && "bg-surface-sand")} aria-sort={ariaSortFor("published_at")}>
      <button
        aria-label={`按发布时间排序${sortField === "published_at" ? (sortDir === "desc" ? "（当前降序，点击改升序）" : "（当前升序，点击改降序）") : ""}`}
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
