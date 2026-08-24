"use client";

import { cn } from "@/lib/utils";

interface AccountTabsProps {
  accounts: Array<{
    id: string;
    display_name: string;
  }>;
  selectedAccountId: string;
  onAccountChange: (accountId: string) => void;
}

/**
 * 账号选择器 - Tab 形态
 * 遵循 Claude 设计：发丝分割线 + 位置色选中态
 */
export function AccountTabs({
  accounts,
  selectedAccountId,
  onAccountChange,
}: AccountTabsProps) {
  return (
    <div className="border-b border-[#ECE7DE]/60">
      <nav className="-mb-px flex gap-1" role="tablist" aria-label="选择账号">
        {accounts.map((account) => (
          <button
            key={account.id}
            type="button"
            role="tab"
            aria-selected={selectedAccountId === account.id}
            onClick={() => onAccountChange(account.id)}
            className={cn(
              "border-b-2 border-transparent px-4 py-3 text-sm font-medium transition-all duration-150",
              selectedAccountId === account.id
                ? "border-[#43718E] bg-[#F5F3EE]/40 text-[#1C1917]"
                : "text-[#78716C] hover:bg-[#F5F3EE]/20 hover:text-[#292524]"
            )}
          >
            {account.display_name}
          </button>
        ))}
      </nav>
    </div>
  );
}
