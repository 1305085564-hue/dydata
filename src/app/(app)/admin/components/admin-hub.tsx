"use client";

import Link from "next/link";
import {
  BarChart3,
  Target,
  FileText,
  ShieldAlert,
  Sparkles,
  Users,
  Lock,
  Settings2,
  TrendingUp,
  ShoppingBag,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types";

interface HubCard {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

interface HubGroup {
  label: string;
  labelEn: string;
  cards: HubCard[];
}

const HUB_GROUPS: HubGroup[] = [
  {
    label: "数据与经营",
    labelEn: "DATA & BUSINESS",
    cards: [
      {
        href: "/admin/analytics",
        title: "经营分析",
        description: "查看团队数据趋势、排行榜和重点信号",
        icon: BarChart3,
      },
      {
        href: "/admin/conversion-hub",
        title: "转化中心",
        description: "管理转化脚本、查看违规记录、获取运营建议",
        icon: Target,
      },
    ],
  },
  {
    label: "内容与合规",
    labelEn: "CONTENT & COMPLIANCE",
    cards: [
      {
        href: "/admin/content",
        title: "内容管理",
        description: "审核和发布内容，管理内容方向",
        icon: FileText,
      },
      {
        href: "/admin/violations",
        title: "违规处理",
        description: "查看和处理违规记录",
        icon: ShieldAlert,
      },
      {
        href: "/admin/ai-rewrite",
        title: "AI 助手",
        description: "智能文案改写、内容建议",
        icon: Sparkles,
      },
    ],
  },
  {
    label: "团队与配置",
    labelEn: "TEAM & CONFIG",
    cards: [
      {
        href: "/admin/team-manager",
        title: "团队管理",
        description: "管理团队成员、审核加入申请",
        icon: Users,
      },
      {
        href: "/admin/modules",
        title: "权限设置",
        description: "配置成员权限和角色",
        icon: Lock,
      },
      {
        href: "/admin/ai-channels",
        title: "渠道配置",
        description: "配置 AI 渠道和模型参数",
        icon: Settings2,
      },
      {
        href: "/admin/guidance",
        title: "成长辅导",
        description: "查看成员成长状态和干预建议",
        icon: TrendingUp,
      },
      {
        href: "/admin/market",
        title: "市场模块",
        description: "市场相关数据和分析",
        icon: ShoppingBag,
      },
    ],
  },
];

function HubCardItem({ card }: { card: HubCard }) {
  const Icon = card.icon;
  return (
    <Link
      href={card.href}
      className={cn(
        "group relative flex flex-col rounded-2xl border border-[#E4E4E7] bg-[#FAFAFB] p-5 transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
        "hover:border-[#D97757]/30 hover:shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
      )}
    >
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#D97757]/10 text-[#D97757]">
        <Icon className="size-5 stroke-[1.5]" />
      </div>
      <h3 className="text-[18px] font-medium tracking-tight text-[#27272A]">
        {card.title}
      </h3>
      <p className="mt-1 text-[13px] leading-[1.6] text-[#71717A]">
        {card.description}
      </p>
      <div className="mt-auto pt-4">
        <ArrowRight className="size-4 stroke-[1.5] text-[#A1A1AA] transition-[color,transform] duration-150 group-hover:translate-x-0.5 group-hover:text-[#D97757]" />
      </div>
    </Link>
  );
}

function HubGroupSection({ group }: { group: HubGroup }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-[#A1A1AA]">
          {group.label}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-[#A1A1AA]/60">
          · {group.labelEn}
        </span>
      </div>
      <div
        className={cn(
          "grid gap-4",
          group.cards.length === 2
            ? "grid-cols-1 sm:grid-cols-2"
            : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        )}
      >
        {group.cards.map((card) => (
          <HubCardItem key={card.href} card={card} />
        ))}
      </div>
    </section>
  );
}

interface AdminHubProps {
  userRole: UserRole;
}

export function AdminHub({ userRole }: AdminHubProps) {
  const visibleGroups = HUB_GROUPS.map((group) => ({
    ...group,
    cards: group.cards.filter((card) => {
      // AI 渠道配置仅 owner 可见
      if (card.href === "/admin/ai-channels" && userRole !== "owner") {
        return false;
      }
      return true;
    }),
  })).filter((group) => group.cards.length > 0);

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-[24px] font-semibold tracking-tight text-[#27272A]">
          团队管理
        </h1>
        <p className="text-[13px] leading-[1.7] text-[#71717A]">
          选择你要处理的事务
        </p>
      </div>

      {/* Hub Groups */}
      <div className="space-y-10">
        {visibleGroups.map((group) => (
          <HubGroupSection key={group.labelEn} group={group} />
        ))}
      </div>
    </div>
  );
}
