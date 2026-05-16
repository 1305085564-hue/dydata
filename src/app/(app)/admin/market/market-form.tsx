"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MarketContextDaily, MarketSentiment } from "@/types";

interface MarketFormProps {
  initialData?: MarketContextDaily | null;
  onSaved?: (row: MarketContextDaily) => void;
}

interface MarketFormState {
  contextDate: string;
  isTradingDay: boolean;
  shanghai: string;
  shenzhen: string;
  chinext: string;
  marketSentiment: MarketSentiment;
  hotSectors: string;
}

const SENTIMENT_OPTIONS: MarketSentiment[] = ["强", "中", "弱"];

function getToday() {
  return new Date().toISOString().split("T")[0];
}

function toInputValue(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "";
  return String(value);
}

function getInitialState(data?: MarketContextDaily | null): MarketFormState {
  return {
    contextDate: data?.context_date ?? getToday(),
    isTradingDay: data?.is_trading_day ?? true,
    shanghai: toInputValue(data?.market_change?.["上证"] as number | undefined),
    shenzhen: toInputValue(data?.market_change?.["深成指"] as number | undefined),
    chinext: toInputValue(data?.market_change?.["创业板"] as number | undefined),
    marketSentiment: data?.market_sentiment ?? "中",
    hotSectors: data?.hot_sectors?.join(",") ?? "",
  };
}

function parseNumber(value: string) {
  if (value.trim() === "") return 0;
  return Number(value);
}

export function MarketForm({ initialData, onSaved }: MarketFormProps) {
  const [form, setForm] = useState<MarketFormState>(() => getInitialState(initialData));
  const [isPending, startTransition] = useTransition();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    setForm(getInitialState(initialData));
  }, [initialData]);

  const isEditMode = Boolean(initialData);

  function updateField<K extends keyof MarketFormState>(key: K, value: MarketFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function resetForm() {
    setForm(getInitialState(null));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const marketChange = {
      上证: parseNumber(form.shanghai),
      深成指: parseNumber(form.shenzhen),
      创业板: parseNumber(form.chinext),
    };

    if (Object.values(marketChange).some((value) => Number.isNaN(value))) {
      feedbackToast.error("涨跌幅请输入有效数字");
      return;
    }

    const hotSectors = form.hotSectors
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    startTransition(async () => {
      const { error } = await supabase.from("market_context_daily").upsert(
        {
          context_date: form.contextDate,
          is_trading_day: form.isTradingDay,
          market_change: marketChange,
          market_sentiment: form.marketSentiment,
          hot_sectors: hotSectors,
          source: "manual",
        },
        { onConflict: "context_date" }
      );

      if (error) {
        feedbackToast.error(error.message || "保存失败，请稍后重试");
        return;
      }

      feedbackToast.success(isEditMode ? "市场环境已更新" : "市场环境已保存");
      const savedRow: MarketContextDaily = {
        ...(initialData ?? {}),
        context_date: form.contextDate,
        is_trading_day: form.isTradingDay,
        market_change: marketChange,
        market_sentiment: form.marketSentiment,
        hot_sectors: hotSectors,
        source: "manual",
      } as MarketContextDaily;
      if (!isEditMode) {
        resetForm();
      }
      onSaved?.(savedRow);
    });
  }

  return (
    <Card className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <CardHeader className="space-y-1 border-b border-border/60">
        <CardTitle>{isEditMode ? "编辑市场环境" : "新增市场环境"}</CardTitle>
      </CardHeader>
      <CardContent className="pt-5">
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="context_date">日期</Label>
              <Input
                id="context_date"
                type="date"
                value={form.contextDate}
                onChange={(event) => updateField("contextDate", event.target.value)}
                required
                className="h-10 rounded-xl"
              />
            </div>

            <div className="space-y-2 rounded-2xl border border-border/60 bg-muted/30 p-4 md:col-span-2 xl:col-span-1">
              <Label htmlFor="is_trading_day" className="cursor-pointer justify-between">
                <span>是否交易日</span>
                <Checkbox
                  id="is_trading_day"
                  checked={form.isTradingDay}
                  onCheckedChange={(checked) => updateField("isTradingDay", checked === true)}
                />
              </Label>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="shanghai">上证涨跌幅(%)</Label>
              <Input
                id="shanghai"
                type="number"
                step="0.01"
                value={form.shanghai}
                onChange={(event) => updateField("shanghai", event.target.value)}
                className="h-10 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shenzhen">深成指涨跌幅(%)</Label>
              <Input
                id="shenzhen"
                type="number"
                step="0.01"
                value={form.shenzhen}
                onChange={(event) => updateField("shenzhen", event.target.value)}
                className="h-10 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="chinext">创业板涨跌幅(%)</Label>
              <Input
                id="chinext"
                type="number"
                step="0.01"
                value={form.chinext}
                onChange={(event) => updateField("chinext", event.target.value)}
                className="h-10 rounded-xl"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>市场情绪</Label>
              <Select
                value={form.marketSentiment}
                onValueChange={(value) => updateField("marketSentiment", value as MarketSentiment)}
              >
                <SelectTrigger className="h-10 w-full rounded-xl px-3">
                  <SelectValue>{form.marketSentiment}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {SENTIMENT_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="hot_sectors">热点板块</Label>
              <Input
                id="hot_sectors"
                value={form.hotSectors}
                onChange={(event) => updateField("hotSectors", event.target.value)}
                placeholder="机器人, AI应用, 券商"
                className="h-10 rounded-xl"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-end">
            {isEditMode && (
              <Button type="button" variant="outline" onClick={resetForm} className="rounded-xl">
                清空
              </Button>
            )}
            <Button type="submit" disabled={isPending} className="rounded-xl px-5">
              {isPending ? "保存中..." : isEditMode ? "更新记录" : "保存记录"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
