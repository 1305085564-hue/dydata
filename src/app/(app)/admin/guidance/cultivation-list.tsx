"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InterventionList } from "./intervention-list";
import { MismatchList } from "./mismatch-list";
import { buildGuidanceResult, type CultivationItem, type GuidanceInput } from "./guidance-utils";

type TabKey = "cultivation" | "intervention" | "mismatch";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "cultivation", label: "重点培养" },
  { key: "intervention", label: "下滑干预" },
  { key: "mismatch", label: "方向错配" },
];

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <Card className={`border-zinc-200 bg-white shadow-sm ${tone}`}>
      <CardContent className="pt-6 pb-5">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
        <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}

function CultivationTable({ items }: { items: CultivationItem[] }) {
  if (items.length === 0) {
    return (
      <Card className="border-dashed border-zinc-200 bg-white">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          暂无符合条件的重点培养账号
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>成员 / 账号</TableHead>
              <TableHead>分组</TableHead>
              <TableHead>爆款率</TableHead>
              <TableHead>进步幅度</TableHead>
              <TableHead>建议动作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.accountId}>
                <TableCell className="align-top">
                  <div className="space-y-1">
                    <div className="font-medium text-foreground">{item.ownerName}</div>
                    <div className="text-sm text-muted-foreground">{item.accountName}</div>
                  </div>
                </TableCell>
                <TableCell className="align-top">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline">{item.stageLabel}</Badge>
                    <Badge variant="outline">{item.scaleLabel}</Badge>
                    <Badge variant="outline">{item.formatLabel}</Badge>
                  </div>
                </TableCell>
                <TableCell className="font-medium">{item.metrics[0]?.value ?? "—"}</TableCell>
                <TableCell className="font-medium text-[#6FAA7D]">{item.metrics[1]?.value ?? "—"}</TableCell>
                <TableCell className="max-w-xs whitespace-normal text-sm text-muted-foreground">{item.action}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 md:hidden">
        {items.map((item) => (
          <Card key={item.accountId} className="border-zinc-200 bg-white">
            <CardContent className="space-y-4 pt-5">
              <div className="space-y-1">
                <div className="font-medium text-foreground">{item.ownerName}</div>
                <div className="text-sm text-muted-foreground">{item.accountName}</div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline">{item.stageLabel}</Badge>
                <Badge variant="outline">{item.scaleLabel}</Badge>
                <Badge variant="outline">{item.formatLabel}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {item.metrics.map((metric) => (
                  <div key={metric.label} className="rounded-2xl bg-muted/50 px-3 py-2">
                    <p className="text-xs text-muted-foreground">{metric.label}</p>
                    <p className="mt-1 font-medium text-foreground">{metric.value}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-xl bg-[#6FAA7D]/5 border border-[#6FAA7D]/15 px-3 py-3 text-[13px] text-[#6FAA7D]">{item.action}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

export function CultivationList(props: GuidanceInput) {
  const [activeTab, setActiveTab] = useState<TabKey>("cultivation");
  const result = useMemo(() => buildGuidanceResult(props), [props]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="纳入账号" value={result.accountCount} tone="" />
        <SummaryCard label="重点培养" value={result.cultivation.length} tone="" />
        <SummaryCard label="下滑干预" value={result.intervention.length} tone="" />
        <SummaryCard label="方向错配" value={result.mismatch.length} tone="" />
      </div>

      <Card className="border-zinc-200 bg-white shadow-sm">
        <CardHeader className="space-y-3">
          <CardTitle className="text-base font-semibold tracking-tight">管理名单</CardTitle>
          <CardDescription>切换查看三张指导名单，桌面端以表格呈现，移动端自动降级为卡片列表。</CardDescription>
          <div className="flex flex-wrap gap-2 rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-sm">
            {TABS.map((tab) => {
              const count =
                tab.key === "cultivation"
                  ? result.cultivation.length
                  : tab.key === "intervention"
                    ? result.intervention.length
                    : result.mismatch.length;
              const active = activeTab === tab.key;
              return (
                <Button
                  key={tab.key}
                  variant={active ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setActiveTab(tab.key)}
                  className={active ? "bg-white text-foreground shadow-sm" : "text-muted-foreground"}
                >
                  {tab.label}
                  <Badge variant={active ? "secondary" : "outline"} className="ml-1">
                    {count}
                  </Badge>
                </Button>
              );
            })}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {activeTab === "cultivation" ? <CultivationTable items={result.cultivation} /> : null}
          {activeTab === "intervention" ? <InterventionList items={result.intervention} /> : null}
          {activeTab === "mismatch" ? <MismatchList items={result.mismatch} /> : null}
        </CardContent>
      </Card>
    </div>
  );
}
