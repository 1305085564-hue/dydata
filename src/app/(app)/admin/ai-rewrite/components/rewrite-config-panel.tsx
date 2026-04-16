"use client";

import { ReactNode } from "react";
import { ChevronDown, Settings2 } from "lucide-react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { cn } from "@/lib/utils";

interface ConfigSectionProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function ConfigSection({ title, description, icon, defaultOpen = false, children }: ConfigSectionProps) {
  return (
    <Collapsible.Root defaultOpen={defaultOpen} className="group rounded-[24px] border border-white/60 bg-white/70 p-1 shadow-[var(--shadow-card)] backdrop-blur-xl transition-all data-[state=open]:bg-white/85">
      <Collapsible.Trigger className="flex w-full items-center justify-between rounded-[20px] p-5 text-left transition-colors hover:bg-slate-50/50">
        <div className="flex items-start gap-4">
          {icon && (
            <div className="mt-1 flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-sm border border-primary/10">
              {icon}
            </div>
          )}
          <div className="space-y-1">
            <h3 className="font-semibold text-base text-[var(--color-text-primary)]">{title}</h3>
            {description && (
              <p className="text-sm text-[var(--color-text-secondary)]">{description}</p>
            )}
          </div>
        </div>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100/80 text-slate-500 transition-transform duration-300 group-data-[state=open]:rotate-180">
          <ChevronDown className="size-4" />
        </div>
      </Collapsible.Trigger>
      
      <Collapsible.Content className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <div className="p-5 pt-0">
          <div className="h-px w-full bg-border/40 mb-5" />
          {children}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

interface RewriteConfigPanelProps {
  children: ReactNode;
}

export function RewriteConfigPanel({ children }: RewriteConfigPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      {children}
    </div>
  );
}
