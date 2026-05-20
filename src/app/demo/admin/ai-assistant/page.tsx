import { AppShell, AppShellHero, AppShellSection } from "@/components/app-shell";
import { DemoModeChip } from "@/components/demo/demo-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DemoButton } from "@/components/demo/demo-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { getDemoAIAssistantData } from "@/lib/demo-data";

export default function DemoAIAssistantPage() {
  const data = getDemoAIAssistantData();

  return (
    <AppShell width="wide" className="pb-8">
      <AppShellHero
        eyebrow="演示文案助手"
        title="后台 AI 助手完整展示"
        description="左侧问答区、右侧历史区都保留，访客能看见整个操作形态，但不会触发任何真实工具。"
        meta={<DemoModeChip />}
      />

      <AppShellSection
        eyebrow="助手工作区"
        title="对话工作区"
        description="这里展示消息气泡、确认节点和历史记录布局，帮助你收集外部反馈。"
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Card className="overflow-hidden rounded-2xl border-white/70 bg-white/82 shadow-[var(--shadow-card)]">
            <CardHeader className="border-b border-[var(--color-border)]">
              <CardTitle className="flex items-center justify-between gap-3 text-base">
                <span>对话区</span>
                <Badge variant="outline" className="rounded-full bg-zinc-50 text-[#D99E55]">
                  演示只读
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-5">
              {data.messages.map((message) => (
                <div
                  key={message.id}
                  className={message.role === "assistant" ? "mr-10 rounded-2xl border border-[var(--color-border)] bg-white p-4" : "ml-10 rounded-2xl bg-primary/8 p-4"}
                >
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">
                    {message.role === "assistant" ? "Assistant" : "User"}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-[var(--color-text-primary)]">{message.content}</div>
                </div>
              ))}

              <div className="rounded-2xl border border-dashed border-[var(--color-border)] p-4">
                <div className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">输入区预览</div>
                <Textarea disabled value="把张三改成管理员" className="min-h-28 resize-none" />
                <div className="mt-3 flex gap-3">
                  <DemoButton type="button" actionName="发送指令">
                    发送指令
                  </DemoButton>
                  <DemoButton type="button" variant="outline" actionName="等待确认">
                    等待确认
                  </DemoButton>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-2xl border-white/70 bg-white/82 shadow-[var(--shadow-card)]">
            <CardHeader className="border-b border-[var(--color-border)]">
              <CardTitle className="text-base">操作历史</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              {data.history.map((item) => (
                <div key={item.id} className="rounded-2xl border border-[var(--color-border)] bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-[var(--color-text-primary)]">{item.description}</span>
                    <Badge variant={item.result === "success" ? "outline" : "secondary"} className="rounded-full">
                      {item.result === "success" ? "成功" : "待确认"}
                    </Badge>
                  </div>
                  <div className="mt-2 text-xs text-[var(--color-text-secondary)]">
                    {item.adminName} · {item.createdAt.slice(0, 16).replace("T", " ")}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </AppShellSection>
    </AppShell>
  );
}
