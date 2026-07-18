"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { GlobalTopicCreateRequest } from "@/components/topics/global-topic-create";

const GlobalTopicCreate = dynamic(
  () =>
    import("@/components/topics/global-topic-create").then(
      (module) => module.GlobalTopicCreate,
    ),
  { ssr: false },
);

export function DeferredGlobalTopicCreate() {
  const [initialRequest, setInitialRequest] = useState<GlobalTopicCreateRequest | null>(null);

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ title?: string }>).detail;
      setInitialRequest({ id: Date.now(), title: detail?.title });
    };

    window.addEventListener("open-global-topic-create", handleOpen);
    return () => window.removeEventListener("open-global-topic-create", handleOpen);
  }, []);

  return initialRequest ? <GlobalTopicCreate initialRequest={initialRequest} /> : null;
}

