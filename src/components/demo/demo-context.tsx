"use client";

import { createContext, useContext, useCallback } from "react";
import { feedbackToast } from "@/components/ui/feedback-toast";

const DemoContext = createContext<boolean>(false);

export function DemoProvider({ children }: { children: React.ReactNode }) {
  return <DemoContext.Provider value={true}>{children}</DemoContext.Provider>;
}

export function useIsDemo() {
  return useContext(DemoContext);
}

export function useDemoGuard() {
  const isDemo = useIsDemo();

  const guard = useCallback(
    (action: () => void, actionName = "此操作") => {
      if (isDemo) {
        feedbackToast.warning(`演示模式不可操作`, {
          description: `${actionName}在演示模式下不可用`,
        });
        return false;
      }
      action();
      return true;
    },
    [isDemo],
  );

  return { isDemo, guard };
}
