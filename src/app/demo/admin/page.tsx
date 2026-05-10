import { AppShell, AppShellHero, AppShellMetricStrip, AppShellSection, AdminSecondaryNav } from "@/components/app-shell";
import { DemoModeChip } from "@/components/demo/demo-nav";
import { ResultTrend } from "@/components/charts/result-trend";
import { InteractionTrend } from "@/components/charts/interaction-trend";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDemoAdminOverviewData } from "@/lib/demo-data";

export default function DemoAdminPage() {
  const data = getDemoAdminOverviewData();

  return (
    <AppShell width="wide" className="pb-10">
      <AppShellHero
        eyebrow="Demo Admin"
        title="后台总览对外只开放只读体验"
        description="保留总览、成员状态、趋势、快捷动作和日志区，让访客能评价后台信息架构，但不能改任何真实配置。"
        meta={<DemoModeChip />}
      >
        <AdminSecondaryNav pathname="/admin" canManageAdmin hrefPrefix="/demo" />
        <AppShellMetricStrip
          columns={4}
          items={[
            { label: "今日提交", value: data.summary.todayReportCount, hint: "15 人演示团队样本", tone: "primary" },
            { label: "在岗成员", value: data.summary.activeProfilesCount, hint: `共 ${data.summary.totalProfiles} 人`, tone: "success" },
            { label: "待处理事项", value: data.summary.pendingRequestCount, hint: "仅展示结构，不触发真实审批", tone: "warning" },
            { label: "邀请码存量", value: data.summary.inviteCodeCount, hint: "演示环境不支持真实生成", tone: "neutral" },
          ]}
        />
      </AppShellHero>

      <AppShellSection
        eyebrow="Team Snapshot"
        title="团队趋势和今日优先事项"
        description="保留首屏高频管理视角，方便别人评价层次是否清晰。"
      >
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="glass-card border-white/60 bg-white/72">
            <CardHeader>
              <CardTitle className="font-semibold tracking-tight">团队趋势总览</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <ResultTrend
                data={data.trendData.结果趋势}
                personalLabel="团队总量"
                teamAverageLabel="团队人均"
                emptyText="演示环境始终保留 30 天趋势"
              />
              <InteractionTrend
                data={data.trendData.互动趋势}
                personalLabel="团队质量分"
                teamAverageLabel="团队人均"
                emptyText="演示环境始终保留 30 天趋势"
              />
            </CardContent>
          </Card>

          <Card className="glass-card-static border-white/70 bg-white/78">
            <CardHeader>
              <CardTitle className="font-semibold tracking-tight">快捷动作预览</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.quickActions.map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/75 bg-white/80 p-4 shadow-[var(--shadow-light)]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--color-text-primary)]">{item.label}</p>
                      <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">{item.description}</p>
                    </div>
                    <Button type="button" size="sm" variant="outline" disabled>
                      仅演示
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </AppShellSection>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <AppShellSection
          eyebrow="Members"
          title="成员状态"
          description="成员、账号、提交状态和豁免状态全部可见，但所有管理按钮都锁定。"
        >
          <div className="overflow-hidden rounded-2xl border border-white/70 bg-white/85 shadow-[var(--shadow-card)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>成员</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>账号数</TableHead>
                  <TableHead>今日提交</TableHead>
                  <TableHead className="text-right">动作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.memberRows.slice(0, 10).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>
                      <Badge variant={row.status === "active" ? "outline" : "secondary"} className="rounded-full">
                        {row.status === "active" ? "在岗" : "豁免"}
                      </Badge>
                    </TableCell>
                    <TableCell>{row.accountCount}</TableCell>
                    <TableCell>{row.todaySubmitted ? "已提交" : "待提交"}</TableCell>
                    <TableCell className="text-right">
                      <Button type="button" size="sm" variant="outline" disabled>
                        管理
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </AppShellSection>

        <AppShellSection
          eyebrow="Audit"
          title="日志预览"
          description="操作日志区保留原意图，方便外部访客判断后台是否可信、是否有秩序。"
        >
          <div className="space-y-3">
            {data.recentLogs.map((log) => (
              <div key={log.id} className="rounded-2xl border border-white/75 bg-white/82 p-4 shadow-[var(--shadow-light)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">{log.action}</p>
                    <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{log.actor}</p>
                  </div>
                  <span className="text-xs text-[var(--color-text-secondary)]">{log.createdAt}</span>
                </div>
              </div>
            ))}
          </div>
        </AppShellSection>
      </div>
    </AppShell>
  );
}
