"use client";

import { AlertCircle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface RouteErrorStateProps {
  title: string;
  description: string;
  reset: () => void;
}

export function RouteErrorState({ title, description, reset }: RouteErrorStateProps) {
  return (
    <main className="flex min-h-[50dvh] items-center justify-center px-4 py-12">
      <Card className="flex max-w-md flex-col items-center gap-4  px-8 py-10 text-center">
        <AlertCircle className="size-5 text-status-danger" aria-hidden="true" />
        <h1 className="text-[28px] leading-[1.20] font-medium tracking-tight text-[#141413]">{title}</h1>
        <p className="text-[13px] leading-6 text-[#78716C]">{description}</p>
        <Button type="button" variant="secondary" size="m" onClick={reset} className="mt-2">
          <RefreshCw className="size-3.5" aria-hidden="true" />
          重试
        </Button>
      </Card>
    </main>
  );
}
