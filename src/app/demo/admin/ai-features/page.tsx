import { AppShell, AppShellHero, AppShellSection, AdminSecondaryNav } from "@/components/app-shell";
import { DemoModeChip } from "@/components/demo/demo-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDemoAIFeatureData } from "@/lib/demo-data";

export default function DemoAIFeaturesPage() {
  const sections = getDemoAIFeatureData();

  return (
    <AppShell width="wide" className="pb-8">
      <AppShellHero
        eyebrow="Demo AI Feature Console"
        title="AI 功能管理"
        description="功能开关、模型、渠道和提示词结构都完整保留，外部访客能直接感受到配置区复杂度。"
        meta={<DemoModeChip />}
      >
        <AdminSecondaryNav pathname="/admin/ai-features" canManageAdmin hrefPrefix="/demo" />
      </AppShellHero>

      <AppShellSection
        eyebrow="Feature Settings"
        title="功能配置面板"
        description="这里全部是只读演示数据，不会改动任何真实 AI 功能。"
      >
        <div className="space-y-5">
          {sections.map((section) => (
            <div key={section.group} className="space-y-3">
              <div>
                <div className="text-sm font-semibold text-[var(--color-text-primary)]">{section.group}</div>
                <div className="mt-1 text-xs text-[var(--color-text-secondary)]">{section.description}</div>
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                {section.features.map((feature) => (
                  <Card key={feature.id} className="border-white/70 bg-white/82 shadow-[var(--shadow-card)]">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between gap-3 text-base">
                        <span>{feature.metadata.title}</span>
                        <Badge variant="outline" className={feature.is_enabled ? "rounded-full bg-emerald-50 text-emerald-700" : "rounded-full bg-slate-100 text-slate-600"}>
                          {feature.is_enabled ? "已启用" : "已关闭"}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm leading-6 text-[var(--color-text-secondary)]">
                      <p><span className="font-medium text-[var(--color-text-primary)]">页面位置：</span>{feature.metadata.location}</p>
                      <p><span className="font-medium text-[var(--color-text-primary)]">当前渠道：</span>{feature.channel_name ?? "自动路由"}</p>
                      <p><span className="font-medium text-[var(--color-text-primary)]">当前模型：</span>{feature.model}</p>
                      <p><span className="font-medium text-[var(--color-text-primary)]">提示词摘要：</span>{feature.system_prompt}</p>
                      <div className="flex flex-wrap gap-3 pt-1">
                        <Button type="button" size="sm" disabled>
                          保存配置
                        </Button>
                        <Button type="button" size="sm" variant="outline" disabled>
                          展开提示词
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      </AppShellSection>
    </AppShell>
  );
}
