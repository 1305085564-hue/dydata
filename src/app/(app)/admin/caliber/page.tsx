import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { CALIBER } from "@/lib/metrics/caliber";
import { getUserPermissions } from "@/lib/permissions";

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
    title: "有效作品线",
    rule: <>播放量低于 <strong>{CALIBER.effectiveMinPlay.toLocaleString("zh-CN")}</strong> 的作品，不参与“平均播放”的计算</>,
    reason: "没跑起来的作品不代表真实水平。跑了一万被限流的，数据依然有效；无效的是压根没播放的",
    value: `${CALIBER.effectiveMinPlay.toLocaleString("zh-CN")} 播放`,
  },
  {
    title: "爆款判定",
    rule: <>同时满足两个条件才算爆款：播放达到 <strong>{CALIBER.hitMinPlay.toLocaleString("zh-CN")}</strong>，且超过这个账号自己最近 <strong>{CALIBER.hitBaselineSize}</strong> 条平均水平的 <strong>{CALIBER.hitTimesOverMean} 倍</strong>（不足 <strong>{CALIBER.hitMinBaseline}</strong> 条历史参照不判）</>,
    reason: "不看绝对量，看的是“相对自己有没有起飞”。大号小号一视同仁",
    value: `${CALIBER.hitMinPlay.toLocaleString("zh-CN")} 播放 · 最近 ${CALIBER.hitBaselineSize} 条 · ${CALIBER.hitTimesOverMean} 倍 · 至少 ${CALIBER.hitMinBaseline} 条参照`,
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
] as const;

export default async function CaliberPage() {
  const permission = await getUserPermissions();
  if (!permission) redirect("/login");
  if (!canAccessAdminPath("/admin/caliber", permission.role, permission.permissions)) redirect("/admin");

  return (
    <AdminWorkspaceLayout
      eyebrow="管理中心"
      title="数据口径"
      description="下面写的就是这个平台里每个数字的算法。数字变了，这里会跟着变。"
      indexItems={[]}
      width="wide"
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {rules.map((item, index) => (
          <article key={item.title} className="rounded-2xl border border-[#E2E2DF] bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[12px] uppercase tracking-[0.18em] text-[#A8A29E]">规则 {index + 1}</p>
                <h2 className="mt-1.5 text-[17px] font-medium text-[#141413]">{item.title}</h2>
              </div>
              {"value" in item ? <span className="shrink-0 rounded-full bg-[#F1F1F0] px-2.5 py-1 text-[12px] tabular-nums text-[#57534E]">{item.value}</span> : null}
            </div>
            <div className="mt-4 space-y-3 text-[13px] leading-7 text-[#1F1E1D]">
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
    </AdminWorkspaceLayout>
  );
}
