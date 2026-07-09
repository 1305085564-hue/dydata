import React from 'react';
import { Plus, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Conversation } from '../types';

interface RewriteHistoryProps {
  conversations: Conversation[];
  currentConversationId: string | null;
  featureLabel: string;
  onNewConversation: () => void;
  onSelectConversation: (conversation: Conversation) => void;
  onPrefetchConversation?: (conversation: Conversation) => void;
  getConversationTag: (conversation: Conversation) => string;
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
      continue;
    } else {
      earlier.push(c);
    }
  }

  return { today, lastThreeDays, lastSevenDays, earlier };
}

function ConversationItem({
  conversation,
  active,
  onSelect,
  onPrefetch,
  getConversationTag,
}: {
  conversation: Conversation;
  active: boolean;
  onSelect: (c: Conversation) => void;
  onPrefetch?: (c: Conversation) => void;
  getConversationTag: (c: Conversation) => string;
}) {
  const tag = getConversationTag(conversation);
  const showTag = tag !== '普通自定义';

  return (
    <button
      type="button"
      onClick={() => onSelect(conversation)}
      onMouseEnter={() => onPrefetch?.(conversation)}
      className={cn(
        'group relative w-full rounded-lg border border-transparent px-3 py-2 text-left transition-colors',
        active
          ? 'bg-stone-200/95'
          : 'hover:bg-stone-100'
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'inline-flex h-1.5 w-1.5 shrink-0 rounded-full border transition-colors',
            active
              ? 'border-stone-500 bg-transparent'
            : isToday(conversation.updatedAt)
                ? 'border-stone-400 bg-transparent'
                : 'border-stone-300 bg-transparent group-hover:border-stone-400'
          )}
        />
        <p
          className={cn(
            'truncate text-[13px] font-medium leading-tight',
            active ? 'text-stone-800' : 'text-stone-600'
          )}
        >
          {conversation.title || '新文案'}
        </p>
        {showTag ? (
          <span className="ml-auto shrink-0 text-[12px] text-stone-400">
            · {tag}
          </span>
        ) : null}
      </div>
    </button>
  );
}

export function RewriteHistory({
  conversations,
  currentConversationId,
  featureLabel,
  onNewConversation,
  onSelectConversation,
  onPrefetchConversation,
  getConversationTag,
}: RewriteHistoryProps) {
  const { today, lastThreeDays, lastSevenDays, earlier } = groupConversations(conversations);

  const sections = [
    { key: 'today', label: '今日', items: today },
    { key: 'last-three-days', label: '最近三日', items: lastThreeDays },
    { key: 'last-seven-days', label: '近七天', items: lastSevenDays },
    { key: 'earlier', label: '更早', items: earlier },
  ].filter((section) => section.items.length > 0);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 px-3 pt-3 pb-2">
        <div className="flex items-center gap-2 px-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-stone-400">
            历史记录
          </span>
          <div className="h-px flex-1 bg-stone-200" />
          <span className="text-[10px] text-stone-400 font-mono tabular-nums">{conversations.length}</span>
        </div>
        <button
          onClick={onNewConversation}
          className="active:translate-y-0 mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-[11px] font-medium text-stone-600 transition-colors hover:border-stone-300 hover:text-stone-800"
        >
          <Plus className="h-3 w-3" />
          <span className="tracking-wide">新文案</span>
        </button>
      </div>

      {/* Divider */}
      <div className="mx-3 h-px bg-stone-200" />

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {conversations.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-3 text-center">
            <span className="mb-2 inline-flex h-6 w-6 items-center justify-center rounded-lg border border-stone-200">
              <FileText className="h-3 w-3 text-stone-300" />
            </span>
            <p className="text-[11px] font-medium text-stone-500">暂无记录</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-stone-400">
              改写的文案会保存在这里
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sections.map((section) => (
              <div key={section.key} className="space-y-1">
                <div className="flex items-center gap-2 px-1 py-1">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-stone-400">
                    {section.label}
                  </span>
                  <div className="h-px flex-1 bg-stone-200" />
                  <span className="text-[10px] text-stone-400 font-mono tabular-nums">{section.items.length}</span>
                </div>
                <div className="space-y-1">
                  {section.items.map((conversation) => (
                    <ConversationItem
                      key={conversation.id}
                      conversation={conversation}
                      active={currentConversationId === conversation.id}
                      onSelect={onSelectConversation}
                      onPrefetch={onPrefetchConversation}
                      getConversationTag={getConversationTag}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 px-3 pt-3 pb-2">
        <p className="truncate text-[10px] uppercase tracking-[0.2em] text-stone-400">
          {featureLabel}
        </p>
      </div>
    </div>
  );
}
