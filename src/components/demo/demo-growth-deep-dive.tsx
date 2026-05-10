import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type OverviewItem = {
  label: string;
  value: string;
  hint: string;
  tone: "success" | "warning" | "neutral";
};

type SampleRow = {
  id: string;
  title: string;
  playCountText: string;
  completionRateText: string;
  followerGainText: string;
  insight: string;
};

type PriorityAction = {
  id: string;
  title: string;
  description: string;
  priority: "P1" | "P2" | "P3";
};

type Props = {
  overview: OverviewItem[];
  recentSamples: SampleRow[];
  priorityActions: PriorityAction[];
};

const toneClassName = {
  success: "border-zinc-200/15 bg-zinc-100/8 text-[#6FAA7D]",
  warning: "border-zinc-200/15 bg-zinc-100/8 text-[#D99E55]",
  neutral: "border-slate-500/15 bg-slate-500/8 text-slate-700",
};

export function DemoGrowthDeepDive({ overview, recentSamples, priorityActions }: Props) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <Card className="border-white/70 bg-white/82 shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base">近 7 天成长概览</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {overview.map((item) => (
              <div key={item.label} className="rounded-2xl border border-[var(--color-border)] bg-white/82 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-[var(--color-text-secondary)]">{item.label}</div>
                  <Badge variant="outline" className={`rounded-full ${toneClassName[item.tone]}`}>
                    {item.tone === "success" ? "向上" : item.tone === "warning" ? "优先改" : "观察中"}
                  </Badge>
                </div>
                <div className="mt-3 text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">{item.value}</div>
                <p className="mt-2 text-xs leading-5 text-[var(--color-text-secondary)]">{item.hint}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-white/70 bg-white/82 shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base">建议优先级</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {priorityActions.map((action) => (
              <div key={action.id} className="rounded-2xl border border-[var(--color-border)] bg-white/82 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-[var(--color-text-primary)]">{action.title}</div>
                  <Badge variant="outline" className="rounded-full">
                    {action.priority}
                  </Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">{action.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="border-white/70 bg-white/82 shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base">最近样本拆解</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {recentSamples.map((sample) => (
            <div key={sample.id} className="rounded-2xl border border-[var(--color-border)] bg-white/82 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[var(--color-text-primary)]">{sample.title}</div>
                  <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">{sample.insight}</p>
                </div>
                <div className="grid shrink-0 gap-2 text-right text-xs text-[var(--color-text-secondary)] sm:grid-cols-3 lg:min-w-[280px]">
                  <div>
                    <div>播放</div>
                    <div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{sample.playCountText}</div>
                  </div>
                  <div>
                    <div>完播</div>
                    <div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{sample.completionRateText}</div>
                  </div>
                  <div>
                    <div>涨粉</div>
                    <div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{sample.followerGainText}</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
