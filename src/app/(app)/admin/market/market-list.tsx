"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MarketForm } from "./market-form";
import type { MarketContextDaily } from "@/types";

interface MarketListProps {
  initialData: MarketContextDaily[];
}

function formatSignedPercent(value: number) {
  const formatted = `${Math.abs(value).toFixed(2)}%`;
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return `0.00%`;
}

function getNumberClassName(value: number) {
  if (value > 0) return "text-emerald-600";
  if (value < 0) return "text-rose-600";
  return "text-foreground";
}

function getSentimentVariant(sentiment: MarketContextDaily["market_sentiment"]) {
  if (sentiment === "强") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (sentiment === "中") return "bg-amber-50 text-amber-700 ring-amber-200";
  if (sentiment === "弱") return "bg-rose-50 text-rose-700 ring-rose-200";
  return "bg-muted text-muted-foreground ring-border";
}

export function MarketList({ initialData }: MarketListProps) {
  const [editingRow, setEditingRow] = useState<MarketContextDaily | null>(null);
  const [isRefreshing, startTransition] = useTransition();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  function handleEdit(row: MarketContextDaily) {
    setEditingRow(row);
  }

  function handleSaved() {
    setEditingRow(null);
    startTransition(async () => {
      await supabase
        .from("market_context_daily")
        .select("id")
        .limit(1);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {editingRow && (
        <MarketForm initialData={editingRow} onSaved={handleSaved} />
      )}

      <Card className="rounded-2xl border border-border/70 bg-background/85 shadow-sm backdrop-blur-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border/60">
          <CardTitle>最近 30 天记录</CardTitle>
          <span className="text-xs text-muted-foreground">
            {isRefreshing ? "刷新中..." : `共 ${initialData.length} 条`}
          </span>
        </CardHeader>
        <CardContent className="pt-5">
          {initialData.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
              暂无市场环境记录
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-background">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>日期</TableHead>
                    <TableHead>交易日</TableHead>
                    <TableHead>上证</TableHead>
                    <TableHead>深成指</TableHead>
                    <TableHead>创业板</TableHead>
                    <TableHead>情绪</TableHead>
                    <TableHead>热点板块</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {initialData.map((row) => {
                    const shanghai = Number(row.market_change?.["上证"] ?? 0);
                    const shenzhen = Number(row.market_change?.["深成指"] ?? 0);
                    const chinext = Number(row.market_change?.["创业板"] ?? 0);

                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.context_date}</TableCell>
                        <TableCell>{row.is_trading_day ? "✅" : "❌"}</TableCell>
                        <TableCell className={getNumberClassName(shanghai)}>
                          {formatSignedPercent(shanghai)}
                        </TableCell>
                        <TableCell className={getNumberClassName(shenzhen)}>
                          {formatSignedPercent(shenzhen)}
                        </TableCell>
                        <TableCell className={getNumberClassName(chinext)}>
                          {formatSignedPercent(chinext)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`rounded-full ring-1 ${getSentimentVariant(row.market_sentiment)}`}>
                            {row.market_sentiment ?? "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-xs whitespace-normal text-sm text-muted-foreground">
                          {row.hot_sectors?.length ? row.hot_sectors.join("、") : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-xl"
                            onClick={() => handleEdit(row)}
                          >
                            编辑
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
