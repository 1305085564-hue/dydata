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
      <div className="flex max-w-md flex-col items-center gap-3 rounded-2xl border border-stone-200 bg-white px-8 py-10 text-center">
        <AlertCircle className="size-5 text-[#C9604D]" aria-hidden="true" />
        <h1 className="text-lg font-medium text-stone-900">{title}</h1>
        <p className="text-sm leading-6 text-stone-500">{description}</p>
        <Button type="button" variant="outline" onClick={reset}>
          <RefreshCw className="size-4" aria-hidden="true" />
          重试
        </Button>
      </div>
    </main>
  );
}
