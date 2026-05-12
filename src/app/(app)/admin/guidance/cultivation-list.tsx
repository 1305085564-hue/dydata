"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
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

function CultivationTable({ items }: { items: CultivationItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-200 bg-white py-10 text-center text-[13px] text-zinc-500">
        暂无符合条件的重点培养账号
      </div>
    );
  }

  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-zinc-200 md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-9 text-[12px] font-medium text-zinc-500">成员 / 账号</TableHead>
              <TableHead className="h-9 text-[12px] font-medium text-zinc-500">分组</TableHead>
              <TableHead className="h-9 text-[12px] font-medium text-zinc-500">爆款率</TableHead>
              <TableHead className="h-9 text-[12px] font-medium text-zinc-500">进步幅度</TableHead>
              <TableHead className="h-9 text-[12px] font-medium text-zinc-500">建议动作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.accountId} className="h-11">
                <TableCell className="align-top">
                  <div className="space-y-0.5">
                    <div className="text-[13px] font-medium text-zinc-800">{item.ownerName}</div>
                    <div className="text-[12px] text-zinc-500">{item.accountName}</div>
                  </div>
                </TableCell>
                <TableCell className="align-top">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-[12px]">{item.stageLabel}</Badge>
                    <Badge variant="outline" className="text-[12px]">{item.scaleLabel}</Badge>
                    <Badge variant="outline" className="text-[12px]">{item.formatLabel}</Badge>
                  </div>
                </TableCell>
                <TableCell className="text-[13px] font-medium text-zinc-700">{item.metrics[0]?.value ?? "—"}</TableCell>
                <TableCell className="text-[13px] font-medium text-[#6FAA7D]">{item.metrics[1]?.value ?? "—"}</TableCell>
                <TableCell className="max-w-xs whitespace-normal text-[13px] text-zinc-600">{item.action}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-2 md:hidden">
        {items.map((item) => (
          <div key={item.accountId} className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4">
            <div className="space-y-0.5">
              <div className="text-[14px] font-medium text-zinc-800">{item.ownerName}</div>
              <div className="text-[12px] text-zinc-500">{item.accountName}</div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline" className="text-[12px]">{item.stageLabel}</Badge>
              <Badge variant="outline" className="text-[12px]">{item.scaleLabel}</Badge>
              <Badge variant="outline" className="text-[12px]">{item.formatLabel}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[13px]">
              {item.metrics.map((metric) => (
                <div key={metric.label} className="rounded-xl bg-zinc-50 px-3 py-2">
                  <p className="text-[11px] text-zinc-400">{metric.label}</p>
                  <p className="mt-1 font-medium text-zinc-700">{metric.value}</p>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-[#6FAA7D]/15 bg-[#6FAA7D]/5 px-3 py-2 text-[13px] text-[#6FAA7D]">
              {item.action}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function CultivationList(props: GuidanceInput) {
  const [activeTab, setActiveTab] = useState<TabKey>("cultivation");
  const result = useMemo(() => buildGuidanceResult(props), [props]);

  const counts = {
    cultivation: result.cultivation.length,
    intervention: result.intervention.length,
    mismatch: result.mismatch.length,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 text-[12px] text-zinc-500">
        <span>纳入账号 {result.accountCount}</span>
        <span>重点培养 {counts.cultivation}</span>
        <span>下滑干预 {counts.intervention}</span>
        <span>方向错配 {counts.mismatch}</span>
      </div>

      <div className="inline-flex items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-50 p-1">
        {TABS.map((tab) => {
          const count = counts[tab.key];
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-[12px] transition-[background-color,color] duration-150 ${
                active
                  ? "bg-white text-zinc-800 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              {tab.label}
              <Badge
                variant="outline"
                className={`ml-0.5 text-[11px] ${
                  active ? "border-zinc-200 bg-zinc-50" : "border-transparent bg-white/60"
                }`}
              >
                {count}
              </Badge>
            </button>
          );
        })}
      </div>

      {activeTab === "cultivation" ? <CultivationTable items={result.cultivation} /> : null}
      {activeTab === "intervention" ? <InterventionList items={result.intervention} /> : null}
      {activeTab === "mismatch" ? <MismatchList items={result.mismatch} /> : null}
    </div>
  );
}
