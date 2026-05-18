import { AppShell, AppShellHero, AppShellMetricStrip, AppShellSection } from "@/components/app-shell";
import { DemoModeChip } from "@/components/demo/demo-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DemoButton } from "@/components/demo/demo-button";
import { Card, CardContent } from "@/components/ui/card";
import { getDemoAdminContentData } from "@/lib/demo-data";

export default function DemoAdminContentPage() {
  const data = getDemoAdminContentData();
  const totalVideos = data.rows.length;
  const snapshotCount = data.rows.filter((row) => row.snapshot).length;
  const abnormalCount = data.rows.filter((row) => row.anomaly_status !== "正常").length;

  return (
    <AppShell width="wide" className="pb-8">
      <AppShellHero
        eyebrow="Demo Content Console"
        title="内容管理保留完整列表观感"
        description="演示环境展示复盘队列、标签、指标和异常状态，但不会下发真实建议。"
        meta={<DemoModeChip />}
      >
        <AppShellMetricStrip
          columns={4}
          items={[
            { label: "内容总量", value: totalVideos, hint: "当前展示的演示样本", tone: "primary" },
            { label: "24h 样本", value: snapshotCount, hint: "已挂接演示快照", tone: "success" },
            { label: "异常样本", value: abnormalCount, hint: "用于模拟筛选和排查", tone: "warning" },
            { label: "次日复盘", value: 9, hint: "复盘动作仅作结构展示", tone: "neutral" },
          ]}
        />
      </AppShellHero>

      <AppShellSection
        eyebrow="Review Queue"
        title="复盘列表"
        description="保留卡片密度、筛选信息和操作位，方便外部访客直接给后台页面提意见。"
      >
        <div className="grid gap-4 xl:grid-cols-2">
          {data.rows.map((row) => (
            <Card key={row.id} className="border-white/70 bg-white/82 shadow-[var(--shadow-card)]">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-[var(--color-text-primary)]">{row.video_title}</div>
                    <div className="mt-1 text-xs text-[var(--color-text-secondary)]">
                      {row.owner_name} / {row.account_name} / {row.published_at?.slice(0, 10) ?? "--"}
                    </div>
                  </div>
                  <Badge variant={row.anomaly_status === "正常" ? "outline" : "secondary"} className="rounded-full">
                    {row.anomaly_status}
                  </Badge>
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-2xl border border-[var(--color-border)] bg-white/90 p-3">
                    <div className="text-xs text-[var(--color-text-secondary)]">播放</div>
                    <div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{Math.round((row.snapshot?.play_count ?? 0) / 10000)}万</div>
                  </div>
                  <div className="rounded-2xl border border-[var(--color-border)] bg-white/90 p-3">
                    <div className="text-xs text-[var(--color-text-secondary)]">5秒完播</div>
                    <div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{row.snapshot?.completion_rate_5s?.toFixed(1) ?? "--"}%</div>
                  </div>
                  <div className="rounded-2xl border border-[var(--color-border)] bg-white/90 p-3">
                    <div className="text-xs text-[var(--color-text-secondary)]">涨粉</div>
                    <div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{row.snapshot?.follower_gain ?? 0}</div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {row.tags.map((tag) => (
                    <Badge key={tag.id} variant="outline" className="rounded-full">
                      {tag.tag_dimension} · {tag.tag_value}
                    </Badge>
                  ))}
                </div>

                <div className="flex flex-wrap gap-3">
                  <DemoButton type="button" size="sm" actionName="查看详情">
                    查看详情
                  </DemoButton>
                  <DemoButton type="button" size="sm" variant="outline" actionName="发次日复盘">
                    发次日复盘
                  </DemoButton>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </AppShellSection>
    </AppShell>
  );
}
