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
      <div className="flex max-w-md flex-col items-center gap-4 rounded-2xl border border-[#E5E0D6] bg-white px-8 py-10 text-center">
        <AlertCircle className="size-5 text-[#DC2626]" aria-hidden="true" />
        <h1 className="text-lg font-semibold text-[#1C1917]">{title}</h1>
        <p className="text-sm leading-6 text-[#78716C]">{description}</p>
        <Button type="button" variant="outline" onClick={reset} className="mt-2 active:scale-[0.985] active:duration-75">
          <RefreshCw className="size-4" aria-hidden="true" />
          重试
        </Button>
      </div>
    </main>
  );
}
