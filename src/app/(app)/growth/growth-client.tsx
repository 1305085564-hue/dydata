"use client";

import { useEffect, useState } from "react";
import { Sparkles, Target } from "lucide-react";
import { 六维雷达面板 } from "@/components/growth/六维雷达面板";
import { DiagnosisCard } from "@/components/growth/diagnosis-card";
import { StatusCardGrid } from "@/components/growth/status-card-grid";
import { ScriptBreakdown } from "@/components/growth/script-breakdown";
import { GrowthActionPlanPanel } from "@/components/growth/growth-action-plan-panel";
import { GrowthPkPanel } from "@/components/growth/growth-pk-panel";
import { AppShell, AppShellHero, AppShellSection } from "@/components/app-shell";
import { mergeGrowthPageData, scheduleGrowthFullHydration } from "@/lib/growth-hydration";

import type { GrowthPageData, GrowthPageHydrationData } from "@/lib/loaders/growth-page";

interface GrowthHydrationState {
  status: "idle" | "loading" | "ready" | "error";
}

async function fetchFullGrowthPageData(signal: AbortSignal) {
  const response = await fetch("/api/growth/page-data?mode=full", {
    method: "GET",
    credentials: "include",
    signal,
  });

  if (!response.ok) {
    throw new Error(`growth full load failed: ${response.status}`);
  }

  return (await response.json()) as GrowthPageHydrationData;
}

export function GrowthClientShell(initialData: GrowthPageData) {
  const [fullData, setFullData] = useState<GrowthPageHydrationData | null>(initialData.isPartial ? null : null);
  const [hydrationState, setHydrationState] = useState<GrowthHydrationState>({
    status: initialData.isPartial ? "loading" : "ready",
  });

  useEffect(() => {
    if (!initialData.isPartial) return;

    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrationState({ status: "loading" });
    const cleanup = scheduleGrowthFullHydration(() => {
      fetchFullGrowthPageData(controller.signal)
        .then((data) => {
          setFullData(data);
          setHydrationState({ status: "ready" });
        })
        .catch((error) => {
          if ((error as { name?: string }).name === "AbortError") return;
          setHydrationState({ status: "error" });
        });
    });

    return () => {
      cleanup();
      controller.abort();
    };
  }, [initialData]);

  const data = mergeGrowthPageData(initialData, fullData);
  const hydrationLabel =
    hydrationState.status === "loading"
      ? "团队对标、PK 和结构化拆解补全中"
      : hydrationState.status === "error"
        ? "重数据补全失败，当前先展示首屏基础版"
        : data.isPartial
          ? "已展示首屏基础版"
          : "重数据已补全";

  return (
    <AppShell width="wide" className="pb-12">
      <AppShellHero
        title="个人成长总览"
        description="按“看弱点、找对标、拆文案、定动作”的顺序走，先定位最该补的一环。"
        meta={
          <div className="flex flex-col items-end gap-1.5">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-[12px] text-stone-500">
              <Sparkles className="size-3.5 stroke-[1.5]" />
              {data.reportCount >= 3 ? "已满足最小样本要求" : data.reportCount > 0 ? "虚拟数据预览中，再提交真实数据替换" : "虚拟数据预览中，提交数据后替换"}
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-[12px] text-stone-500">
              <span className={`inline-block h-2 w-2 rounded-full ${hydrationState.status === "error" ? "bg-rose-400" : hydrationState.status === "ready" ? "bg-emerald-400" : "bg-amber-400"}`} />
              {hydrationLabel}
            </div>
            <div className="hidden items-center gap-2 text-[12px] text-stone-500 sm:flex">
              <span>分析主体 · {data.profileName || "当前账号"}</span>
              <span className="text-stone-500">·</span>
              <span>{data.accountCount} 个账号</span>
              <span className="text-stone-500">·</span>
              <span>{data.reportCount} 条样本</span>
              <span className="text-stone-500">·</span>
              <span>最弱 {data.summary.weakestDimension ?? "待积累"}</span>
            </div>
          </div>
        }
      >
        <StatusCardGrid items={data.statusCards} />
      </AppShellHero>

      <div className="grid gap-5 lg:grid-cols-[minmax(360px,0.4fr)_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-[18px] font-medium text-stone-900">能力分布</h2>
              <p className="mt-1 text-[13px] leading-[1.7] text-stone-500">看清六维差距来自哪里。</p>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-[12px] text-stone-500">
              <Target className="size-3.5 stroke-[1.5] text-[#D99E55]" />
              最弱：{data.summary.weakestDimension ?? "待积累"}
            </div>
          </div>
          <六维雷达面板 capabilityCards={data.capabilityCards} weakBenchmarkCards={data.weakBenchmarkCards} teamMembers={data.teamMembers} />
        </section>

        <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
          <div className="mb-4">
            <h2 className="text-[18px] font-medium text-stone-900">诊断与行动</h2>
            <p className="mt-1 text-[13px] leading-[1.7] text-stone-500">结合团队均值，先明确当前最该动的地方。</p>
          </div>
          <DiagnosisCard myReports={data.myReports} teamReports={data.teamReports} />
        </section>
      </div>

      {data.pkPanel ? (
        <AppShellSection title="找对标" description="和最接近你的对手对比，优先找能直接复制的差距。">
          <GrowthPkPanel leftName={data.pkPanel.leftName} rightName={data.pkPanel.rightName} rows={data.pkPanel.rows} />
        </AppShellSection>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <AppShellSection title="文案拆解" description="先定位问题发生在开头、中段还是结尾。">
          <ScriptBreakdown title="文案拆解" data={data.scriptBreakdown} />
        </AppShellSection>

        <AppShellSection title="AI 洞察与行动建议" description="把结论、证据、示例和动作收成一套。">
          <GrowthActionPlanPanel advice={data.advice} noData={data.myReports.length === 0} />
        </AppShellSection>
      </div>
    </AppShell>
  );
}
