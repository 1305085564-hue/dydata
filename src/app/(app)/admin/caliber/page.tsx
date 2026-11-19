import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { PageEpigraph } from "@/components/editorial/page-epigraph";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { canEditEvaluationStandards } from "@/lib/evaluation-standards";
import { loadEvaluationSettings } from "@/lib/evaluation-standards-store";
import { getCurrentPermissionContext } from "@/lib/current-permission-context";
import { CALIBER } from "@/lib/metrics/caliber";
import { createAdminClient } from "@/lib/supabase/admin";
import { EvaluationStandardsTabs } from "./evaluation-standards-tabs";

export const metadata: Metadata = {
  title: "数据口径 - DYData",
  description: "查看 DYData 各项数据的计算方式和当前口径。",
};

const rules = [
  {
    title: "产量口径",
    rule: <>发了几条就算几条。被限流、被删稿的作品<strong>照样算一条</strong></>,
    reason: "这是考勤，不是评优。如果限流可以不算，那人人都可以说自己限流就不用发了",
  },
  {
    title: "平均播放有效线",
    rule: <>播放量低于 <strong>{CALIBER.effectiveMinPlay.toLocaleString("zh-CN")}</strong> 的作品，不参与“平均播放”的计算</>,
    reason: "没跑起来的作品不代表真实水平，2000 播放以内的数据多半是被限流造成的",
    value: `平均播放 ≥${CALIBER.effectiveMinPlay.toLocaleString("zh-CN")}`,
  },
  {
    title: "互动率 / 转粉率",
    rule: <>先加总再相除，不是每条算完再平均</>,
    reason: "避免小播放量的作品把比率带偏",
  },
  {
    title: "归属日期",
    rule: <>按作品发布时间的上海日期算；认不出发布时间的，才按你填的归属日期算</>,
    reason: "以事实为准，不以填报时间为准",
  },
  {
    title: "补交门禁",
    rule: <>发布时间超过 <strong>{CALIBER.submitGraceHours} 小时</strong>才来填，不能直接交，要先申请补交</>,
    reason: "防止事后补录造假",
    value: `${CALIBER.submitGraceHours} 小时`,
  },
  {
    title: "三个岗位视角",
    rule: <>文案、剪辑、运营是三个<strong>看数据的角度</strong>，同一条作品在各视角各出现一次。<strong>看总产量请看达人列表</strong></>,
    reason: "达人=账号主人，一条作品只归属一个达人，不会重复",
  },
  {
    title: "数据来源",
    rule: <>数据来自两张作品截图自动识别，识别完你可以逐项核对修改。识别不出来的数字，你自己填，系统照收</>,
    reason: "保留人工核对，防止识别错误污染报表",
  },
  {
    title: "没绑作品的日报",
    rule: <>少数早期日报没有关联到具体作品，这类记录<strong>只计入产量，不参与平均播放和各项比率</strong></>,
    reason: "没有作品就取不到数据底稿，不能拿它去稀释有作品的平均水平",
  },
] as const;

export default async function CaliberPage() {
  const context = await getCurrentPermissionContext();
  if (!context) redirect("/login");
  const { permissionInfo, scope } = context;
  if (!canAccessAdminPath("/admin/caliber", permissionInfo.role, permissionInfo.permissions)) redirect("/admin");

  let initialSettings: Awaited<ReturnType<typeof loadEvaluationSettings>> | null = null;
  let loadError: string | null = null;
  try {
    initialSettings = await loadEvaluationSettings(createAdminClient(), scope.teamId);
  } catch {
    loadError = "评价标准暂时无法读取，请稍后重试。";
  }

  return (
    <AdminWorkspaceLayout
      title="数据口径"
      description={<PageEpigraph pageKey="caliber" />}
      width="wide"
    >
      <EvaluationStandardsTabs
        calculationContent={
          <div className="grid gap-5 lg:grid-cols-2">
            {rules.map((item, index) => (
              <article key={item.title} className="rounded-xl border border-[#E2E2DF]/60 bg-white p-5 shadow-card-ring">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[12px] uppercase tracking-[0.18em] text-[#78716C]">规则 {index + 1}</p>
                    <h2 className="font-normal mt-1 text-[14px] text-[#141413]">{item.title}</h2>
                  </div>
                  {"value" in item ? <span className="shrink-0 rounded-full bg-[#F1F1F0] px-2.5 py-1 text-[12px] tabular-nums text-ink-body">{item.value}</span> : null}
                </div>
                <div className="mt-3 space-y-3 text-[14px] leading-7 text-[#1F1E1D] [&_strong]:font-normal [&_strong]:text-[#141413]">
                  <div>
                    <p className="text-[12px] text-[#78716C]">规则是什么</p>
                    <p className="mt-0.5">{item.rule}</p>
                  </div>
                  <div>
                    <p className="text-[12px] text-[#78716C]">为什么这么定</p>
                    <p className="mt-0.5">{item.reason}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        }
        initialSettings={initialSettings}
        canEdit={canEditEvaluationStandards(permissionInfo)}
        loadError={loadError}
      />
    </AdminWorkspaceLayout>
  );
}
