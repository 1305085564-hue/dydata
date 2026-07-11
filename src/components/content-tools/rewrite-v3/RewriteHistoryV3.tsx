'use client';

import React from 'react';
import { FileText, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Conversation } from '../types';

interface RewriteHistoryV3Props {
  conversations: Conversation[];
  currentConversationId: string | null;
  onSelectConversation: (id: string) => void;
  isOpen: boolean;
}

function isToday(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function getDayDiff(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const currentDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const targetDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.floor((currentDay - targetDay) / 86400000);
}

function groupConversations(conversations: Conversation[]) {
  const today: Conversation[] = [];
  const lastThreeDays: Conversation[] = [];
  const lastSevenDays: Conversation[] = [];
  const earlier: Conversation[] = [];

  for (const c of conversations) {
    if (isToday(c.updatedAt)) {
      today.push(c);
      continue;
    }
    const diffDay = getDayDiff(c.updatedAt);
    if (diffDay <= 3) {
      lastThreeDays.push(c);
      continue;
    }
    if (diffDay <= 7) {
      lastSevenDays.push(c);
    } else {
      earlier.push(c);
    }
  }

  return { today, lastThreeDays, lastSevenDays, earlier };
}

export function RewriteHistoryV3({
  conversations,
  currentConversationId,
  onSelectConversation,
  isOpen,
}: RewriteHistoryV3Props) {
  const { today, lastThreeDays, lastSevenDays, earlier } = groupConversations(conversations);

  const sections = [
    { key: 'today', label: '今日', items: today },
    { key: 'last-three-days', label: '最近三日', items: lastThreeDays },
    { key: 'last-seven-days', label: '近七天', items: lastSevenDays },
    { key: 'earlier', label: '更早', items: earlier },
  ].filter((section) => section.items.length > 0);

  return (
    <div
      className={cn(
        'shrink-0 h-full flex flex-col border-r border-stone-200/50 bg-stone-100/40 transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]',
        isOpen ? 'w-[200px] opacity-100' : 'w-0 opacity-0 overflow-hidden border-r-0'
      )}
    >
      {/* 头部极简标识 */}
      <div className="shrink-0 px-4 py-3 flex items-center justify-between border-b border-stone-200/40">
        <span className="text-[12px] font-medium uppercase tracking-[0.2em] text-stone-500">
          历史记录
        </span>
        <span className="text-[12px] text-stone-500 font-medium tabular-nums">
          {conversations.length} 条
        </span>
      </div>

      {/* 列表流式内容区 */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4 scrollbar-none">
        {conversations.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center px-4 py-12">
            <FileText className="h-6 w-6 text-stone-500 animate-pulse" />
            <p className="text-[12px] font-medium text-stone-500 mt-2">暂无记录</p>
          </div>
        ) : (
          sections.map((section) => (
            <div key={section.key} className="space-y-1">
              <div className="text-[12px] font-medium text-stone-500 px-2 uppercase tracking-[0.16em]">
                {section.label}
              </div>
              <div className="space-y-0.5">
                {section.items.map((c) => {
                  const isActive = currentConversationId === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => onSelectConversation(c.id)}
                      className={cn(
                        'group flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-left transition-all duration-150 active:scale-[0.98]',
                        isActive
                          ? 'bg-[#8AA8C7]/15 text-stone-900 font-medium'
                          : 'text-stone-500 hover:bg-stone-200/50 hover:text-stone-900'
                      )}
                    >
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span
                          className={cn(
                            'h-1.5 w-1.5 rounded-full shrink-0 transition-colors',
                            isActive ? 'bg-[#8AA8C7]' : 'bg-stone-300 group-hover:bg-stone-400'
                          )}
                        />
                        <span className="truncate text-[12px] leading-none">
                          {c.title || '无标题文案'}
                        </span>
                      </div>
                      <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-stone-500" />
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
