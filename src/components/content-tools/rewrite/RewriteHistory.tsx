import React from 'react';
import { Plus, MessageSquare } from 'lucide-react';
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

export function RewriteHistory({
  conversations,
  currentConversationId,
  featureLabel,
  onNewConversation,
  onSelectConversation,
  getConversationTag,
}: RewriteHistoryProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 px-3 pt-3 pb-2">
        <div className="flex items-center gap-2 px-1">
          <span className="text-[9px] font-semibold uppercase tracking-[0.25em] text-zinc-400">
            History
          </span>
          <div className="h-px flex-1 bg-zinc-200" />
          <span className="text-[10px] text-zinc-400 tabular-nums">{conversations.length}</span>
        </div>
        <button
          onClick={onNewConversation}
          className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-medium text-zinc-600 shadow-sm transition-[background-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-[1px] hover:border-zinc-300 hover:text-zinc-950 active:translate-y-0"
        >
          <Plus className="h-3 w-3" />
          <span className="tracking-wide">新文案</span>
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {conversations.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-3 text-center">
            <MessageSquare className="mb-2 h-4 w-4 text-zinc-300" />
            <p className="text-[11px] font-medium text-zinc-500">暂无记录</p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-zinc-400">
              改写的文案会保存在这里
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {conversations.map((conversation) => {
              const active = currentConversationId === conversation.id;
              return (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => onSelectConversation(conversation)}
                  className={cn(
                    'group relative w-full rounded-lg px-2.5 py-2 text-left transition-[background-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]',
                    active ? 'bg-white shadow-sm' : 'hover:bg-zinc-50'
                  )}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-[#D97757]" />
                  )}
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        'inline-flex h-1 w-1 shrink-0 rounded-full',
                        active ? 'bg-[#D97757]' : 'bg-zinc-300 group-hover:bg-zinc-400'
                      )}
                    />
                    <p
                      className={cn(
                        'truncate text-[12px] font-medium leading-tight',
                        active ? 'text-zinc-950' : 'text-zinc-600'
                      )}
                    >
                      {conversation.title || '新文案'}
                    </p>
                  </div>
                  <div className="mt-1 flex items-center justify-between pl-2.5">
                    <span className="text-[9px] uppercase tracking-[0.15em] text-zinc-400 tabular-nums">
                      {new Date(conversation.updatedAt).toLocaleString('zh-CN', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span className="truncate text-[9px] text-zinc-400">
                      {getConversationTag(conversation)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-zinc-200 px-3 py-2">
        <p className="truncate text-[9px] uppercase tracking-[0.2em] text-zinc-400">
          {featureLabel}
        </p>
      </div>
    </div>
  );
}
