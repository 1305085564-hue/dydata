import { AppShell, AppShellHero, AppShellSection, AdminSecondaryNav } from "@/components/app-shell";
import { DemoModeChip } from "@/components/demo/demo-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDemoAIChannelsData } from "@/lib/demo-data";

export default function DemoAIChannelsPage() {
  const channels = getDemoAIChannelsData();

  return (
    <AppShell width="wide" className="pb-8">
      <AppShellHero
        eyebrow="Demo AI Channel Console"
        title="AI 渠道管理"
        description="渠道优先级、熔断状态和健康信息全部可见，但新增、恢复、测试操作一律锁定。"
        meta={<DemoModeChip />}
      >
        <AdminSecondaryNav pathname="/admin/ai-channels" canManageAdmin hrefPrefix="/demo" />
      </AppShellHero>

      <AppShellSection
        eyebrow="Channel Settings"
        title="渠道配置面板"
        description="保持正式站的表格和状态信息密度，让外部访客可以直接评价后台配置区。"
      >
        <div className="overflow-hidden rounded-3xl border border-white/70 bg-white/85 shadow-[var(--shadow-card)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>渠道</TableHead>
                <TableHead>模型</TableHead>
                <TableHead>优先级</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>最近成功</TableHead>
                <TableHead className="text-right">动作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {channels.map((channel) => (
                <TableRow key={channel.id}>
                  <TableCell>
                    <div className="font-medium text-[var(--color-text-primary)]">{channel.name}</div>
                    <div className="mt-1 text-xs text-[var(--color-text-secondary)]">{channel.base_url}</div>
                  </TableCell>
                  <TableCell>{channel.model ?? "默认模型"}</TableCell>
                  <TableCell>{channel.priority}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={channel.is_enabled && !channel.unhealthy_until ? "rounded-full bg-emerald-50 text-emerald-700" : "rounded-full bg-amber-50 text-amber-700"}
                    >
                      {!channel.is_enabled ? "已禁用" : channel.unhealthy_until ? "熔断中" : "健康"}
                    </Badge>
                  </TableCell>
                  <TableCell>{channel.last_success_at?.slice(0, 16).replace("T", " ") ?? "--"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button type="button" size="sm" variant="outline" disabled>
                        测试
                      </Button>
                      <Button type="button" size="sm" disabled>
                        编辑
                      </Button>
                    </div>
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
