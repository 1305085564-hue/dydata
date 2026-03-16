"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface RankItem {
  name: string;
  total_play: number;
  total_likes: number;
  total_comments: number;
  total_shares: number;
  total_favorites: number;
  count: number;
}

interface LeaderboardProps {
  todayData: RankItem[];
  weekData: RankItem[];
  monthData: RankItem[];
}

export function Leaderboard({ todayData, weekData, monthData }: LeaderboardProps) {
  const [range, setRange] = useState<"today" | "week" | "month">("week");
  const [sortBy, setSortBy] = useState<"play" | "interaction">("play");

  const data = range === "today" ? todayData : range === "week" ? weekData : monthData;

  const sorted = [...data].sort((a, b) => {
    if (sortBy === "play") return b.total_play - a.total_play;
    const aInt = a.total_likes + a.total_comments + a.total_shares + a.total_favorites;
    const bInt = b.total_likes + b.total_comments + b.total_shares + b.total_favorites;
    return bInt - aInt;
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant={range === "today" ? "default" : "outline"} onClick={() => setRange("today")}>当天</Button>
        <Button size="sm" variant={range === "week" ? "default" : "outline"} onClick={() => setRange("week")}>近 7 天</Button>
        <Button size="sm" variant={range === "month" ? "default" : "outline"} onClick={() => setRange("month")}>近 30 天</Button>
        <div className="w-px bg-border mx-1" />
        <Button size="sm" variant={sortBy === "play" ? "default" : "outline"} onClick={() => setSortBy("play")}>按播放量</Button>
        <Button size="sm" variant={sortBy === "interaction" ? "default" : "outline"} onClick={() => setSortBy("interaction")}>按互动量</Button>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">暂无数据</p>
      ) : (
        <>
          {/* 桌面端 */}
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">排名</TableHead>
                  <TableHead>姓名</TableHead>
                  <TableHead className="text-right">{sortBy === "play" ? "总播放(万)" : "互动总量"}</TableHead>
                  <TableHead className="text-right">总点赞</TableHead>
                  <TableHead className="text-right">总评论</TableHead>
                  <TableHead className="text-right">总分享</TableHead>
                  <TableHead className="text-right">提交天数</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((r, i) => (
                  <TableRow key={r.name}>
                    <TableCell className="font-bold">{rankEmoji(i)}</TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {sortBy === "play"
                        ? (r.total_play / 10000).toFixed(2)
                        : (r.total_likes + r.total_comments + r.total_shares + r.total_favorites).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.total_likes}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.total_comments}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.total_shares}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* 手机端 */}
          <div className="sm:hidden space-y-2">
            {sorted.map((r, i) => {
              const interaction = r.total_likes + r.total_comments + r.total_shares + r.total_favorites;
              return (
                <div key={r.name} className="flex items-center justify-between rounded-lg border p-3 bg-background">
                  <div className="flex items-center gap-3">
                    <span className="text-lg w-8 text-center">{rankEmoji(i)}</span>
                    <div>
                      <p className="text-sm font-medium">{r.name}</p>
                      <p className="text-xs text-muted-foreground">{r.count} 天</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums">
                      {sortBy === "play"
                        ? `${(r.total_play / 10000).toFixed(2)}万`
                        : `互动 ${interaction.toLocaleString()}`}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {sortBy === "play"
                        ? `赞${r.total_likes} 评${r.total_comments}`
                        : `${(r.total_play / 10000).toFixed(1)}万播放`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function rankEmoji(index: number): string {
  if (index === 0) return "🥇";
  if (index === 1) return "🥈";
  if (index === 2) return "🥉";
  return `${index + 1}`;
}
