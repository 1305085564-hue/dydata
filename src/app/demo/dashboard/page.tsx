import { AppShell, AppShellHero, AppShellMetricStrip, AppShellSection } from "@/components/app-shell";
import { DemoModeChip } from "@/components/demo/demo-nav";
import { DemoTodayReportPanel } from "@/components/demo/demo-today-report-panel";
import { Leaderboard } from "@/components/leaderboard/leaderboard";
import { ResultTrend } from "@/components/charts/result-trend";
import { InteractionTrend } from "@/components/charts/interaction-trend";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DemoButton } from "@/components/demo/demo-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDemoDashboardPageData } from "@/lib/demo-data";

export default function DemoDashboardPage() {
  const data = getDemoDashboardPageData();

  return (
    <AppShell width="wide" className="pb-10">
      <AppShellHero
        eyebrow="Demo Dashboard"
        title="先看今天的提报体验，再看趋势和排行"
        description="这是演示环境，保留正式站的布局层次与主要模块，但所有提交、编辑和导出动作都锁定。"
        meta={<DemoModeChip />}
      >
        <AppShellMetricStrip
          columns={4}
          items={[
            { label: "账号总数", value: data.summary.totalAccounts, hint: "演示成员当前名下账号", tone: "primary" },
            { label: "已提交", value: data.summary.submittedCount, hint: "今日虚拟数据已生成", tone: "success" },
            { label: "待提交", value: data.summary.pendingCount, hint: "保留真实流程位，但不可写入", tone: "warning" },
            { label: "历史记录", value: data.summary.historyCount, hint: "展示最近 12 条演示日报", tone: "neutral" },
          ]}
        />

        <Card className="glass-card-static border-white/70 bg-white/78 shadow-[var(--shadow-heavy)]">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-semibold tracking-tight">今日提报体验</CardTitle>
              <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
                这里保留账号选择、截图导入、提交确认的完整位置关系，但在演示环境统一灰掉，避免产生真实数据。
              </p>
            </div>
            <Badge variant="outline" className="rounded-full bg-zinc-50 text-[#D99E55]">
              只读
            </Badge>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl border border-[var(--color-border)] bg-white/90 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">账号选择</p>
                  <p className="mt-1 text-xs text-[var(--color-text-secondary)]">演示中默认展示 2 个账号入口，支持展开查看今日提报明细。</p>
                </div>
                <DemoButton type="button" variant="outline" size="sm" actionName="切换账号">
                  切换账号
                </DemoButton>
              </div>
              <div className="mt-3">
                <DemoTodayReportPanel accounts={data.accounts} reportsByAccountId={data.reportsByAccountId} />
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--color-border)] bg-white/90 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">提交动作</p>
                  <p className="mt-1 text-xs text-[var(--color-text-secondary)]">按钮保留原位置，只做演示说明。</p>
                </div>
                <Badge variant="outline" className="rounded-full">
                  演示锁定
                </Badge>
              </div>
              <div className="mt-3 grid gap-3">
                {[
                  "导入截图并自动识别关键字段",
                  "补充文案、发布时间和异常状态",
                  "校验后提交到日报与视频快照",
                ].map((item) => (
                  <div key={item} className="rounded-2xl border border-dashed border-[var(--color-border)] px-3 py-3 text-sm text-[var(--color-text-secondary)]">
                    {item}
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <DemoButton type="button" actionName="提交今日数据">
                  提交今日数据
                </DemoButton>
                <DemoButton type="button" variant="outline" actionName="导入截图">
                  导入截图
                </DemoButton>
              </div>
            </div>
          </CardContent>
        </Card>
      </AppShellHero>

      <AppShellSection
        eyebrow="Trend Snapshot"
        title="趋势图保留真实观感"
        description="下面全部是虚拟数据，但图表、切换和对比结构保持正式站风格。"
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <ResultTrend
            data={data.trendData.结果趋势}
            personalLabel="我的数据"
            teamAverageLabel="团队 P80"
            emptyText="演示环境至少保留 30 天样本"
          />
          <InteractionTrend
            data={data.trendData.互动趋势}
            personalLabel="我的质量分"
            teamAverageLabel="团队 P80"
            emptyText="演示环境至少保留 30 天样本"
          />
        </div>
      </AppShellSection>

      <AppShellSection
        eyebrow="Leaderboard"
        title="排行榜"
        description="总榜、同标签榜、进步榜都可查看，但不会联动真实团队。"
      >
        <Leaderboard
          data={data.leaderboardData}
          ownAccountIds={data.accountIds}
          ownContentDirections={data.ownContentDirections}
          currentDate={data.today}
          defaultRange="week"
          defaultCompact
        />
      </AppShellSection>

      <AppShellSection
        eyebrow="Recent History"
        title="历史记录预览"
        description="展示最近 12 条演示日报，帮助外部访客理解信息密度和查看路径。"
      >
        <div className="overflow-hidden rounded-2xl border border-white/70 bg-white/85 shadow-[var(--shadow-card)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>日期</TableHead>
                <TableHead>账号</TableHead>
                <TableHead>标题</TableHead>
                <TableHead className="text-right">播放</TableHead>
                <TableHead className="text-right">涨粉</TableHead>
                <TableHead className="text-right">动作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.history.map((report) => (
                <TableRow key={report.id}>
                  <TableCell>{report.report_date}</TableCell>
                  <TableCell>{data.accounts.find((account) => account.id === report.account_id)?.display_name ?? "示例账号"}</TableCell>
                  <TableCell className="max-w-[280px] truncate">{report.title}</TableCell>
                  <TableCell className="text-right">{Math.round((report.play_count ?? 0) / 10000)}万</TableCell>
                  <TableCell className="text-right">{report.follower_gain}</TableCell>
                  <TableCell className="text-right">
                    <DemoButton type="button" variant="outline" size="sm" actionName="查看">
                      查看
                    </DemoButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </AppShellSection>
    </AppShell>
  );
}
