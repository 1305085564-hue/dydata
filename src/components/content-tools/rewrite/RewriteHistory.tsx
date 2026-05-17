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
  getConversationTag: (conversation: Conversation) => string;
}

function timeLabel(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
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

function isYesterday(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  );
}

function groupConversations(conversations: Conversation[]) {
  const today: Conversation[] = [];
  const earlier: Conversation[] = [];

  for (const c of conversations) {
    if (isToday(c.updatedAt)) {
      today.push(c);
    } else {
      earlier.push(c);
    }
  }

  return { today, earlier };
}

function ConversationItem({
  conversation,
  active,
  onSelect,
  getConversationTag,
}: {
  conversation: Conversation;
  active: boolean;
  onSelect: (c: Conversation) => void;
  getConversationTag: (c: Conversation) => string;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(conversation)}
      className={cn(
        'group relative w-full rounded-lg px-3 py-2.5 text-left transition-colors',
        active ? 'bg-white' : 'hover:bg-zinc-100'
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-6 w-[2px] -translate-y-1/2 rounded-full bg-[#D97757]" />
      )}
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'inline-flex h-1.5 w-1.5 shrink-0 rounded-full',
            active
              ? 'bg-[#D97757] ring-1 ring-white'
              : isToday(conversation.updatedAt)
                ? 'bg-[#D99E55] ring-1 ring-white'
                : 'bg-zinc-300 group-hover:bg-zinc-400'
          )}
        />
        <p
          className={cn(
            'truncate text-[13px] font-medium leading-tight',
            active ? 'text-zinc-800' : 'text-zinc-600'
          )}
        >
          {conversation.title || '新文案'}
        </p>
      </div>
      <div className="mt-1.5 flex items-center justify-between pl-3.5">
        <span className="text-[10px] font-mono tabular-nums text-zinc-400">
          {timeLabel(conversation.updatedAt)}
        </span>
        <span className="truncate text-[10px] text-zinc-400">
          {getConversationTag(conversation)}
        </span>
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
  getConversationTag,
}: RewriteHistoryProps) {
  const { today, earlier } = groupConversations(conversations);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 px-3 pt-3 pb-2">
        <div className="flex items-center gap-2 px-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-400">
            历史记录
          </span>
          <div className="h-px flex-1 bg-zinc-200" />
          <span className="text-[10px] text-zinc-400 font-mono tabular-nums">{conversations.length}</span>
        </div>
        <button
          onClick={onNewConversation}
          className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-800"
        >
          <Plus className="h-3 w-3" />
          <span className="tracking-wide">新文案</span>
        </button>
      </div>

      {/* Divider */}
      <div className="mx-3 h-px bg-zinc-200" />

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {conversations.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-3 text-center">
            <span className="mb-2 inline-flex h-6 w-6 items-center justify-center rounded-lg border border-zinc-200">
              <FileText className="h-3 w-3 text-zinc-300" />
            </span>
            <p className="text-[11px] font-medium text-zinc-500">暂无记录</p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-zinc-400">
              改写的文案会保存在这里
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Today */}
            {today.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 px-1 py-1">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-400">
                    今天
                  </span>
                  <div className="h-px flex-1 bg-zinc-200" />
                  <span className="text-[10px] text-zinc-400 font-mono tabular-nums">{today.length}</span>
                </div>
                <div className="space-y-1">
                  {today.map((conversation) => (
                    <ConversationItem
                      key={conversation.id}
                      conversation={conversation}
                      active={currentConversationId === conversation.id}
                      onSelect={onSelectConversation}
                      getConversationTag={getConversationTag}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Earlier */}
            {earlier.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 px-1 py-1">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-400">
                    更早
                  </span>
                  <div className="h-px flex-1 bg-zinc-200" />
                  <span className="text-[10px] text-zinc-400 font-mono tabular-nums">{earlier.length}</span>
                </div>
                <div className="space-y-1">
                  {earlier.map((conversation) => (
                    <ConversationItem
                      key={conversation.id}
                      conversation={conversation}
                      active={currentConversationId === conversation.id}
                      onSelect={onSelectConversation}
                      getConversationTag={getConversationTag}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 px-3 pt-3 pb-2">
        <p className="truncate text-[10px] uppercase tracking-[0.2em] text-zinc-400">
          {featureLabel}
        </p>
      </div>
    </div>
  );
}
