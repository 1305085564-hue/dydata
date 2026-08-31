"use client";

import { AlertCircle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

interface RouteErrorStateProps {
  title: string;
  description: string;
  reset: () => void;
}

export function RouteErrorState({ title, description, reset }: RouteErrorStateProps) {
  return (
    <main className="flex min-h-[50vh] items-center justify-center px-4 py-12">
      <div className="flex max-w-md flex-col items-center gap-4 rounded-2xl shadow-card-ring bg-white px-8 py-10 text-center">
        <AlertCircle className="size-5 text-[#C0685C]" aria-hidden="true" />
        <h1 className="text-lg font-[580] tracking-tight text-[#1C1917]">{title}</h1>
        <p className="text-sm leading-6 text-[#78716C]">{description}</p>
        <Button type="button" variant="secondary" size="m" onClick={reset} className="mt-2">
          <RefreshCw className="size-3.5" aria-hidden="true" />
          重试
        </Button>
      </div>
    </main>
  );
}
