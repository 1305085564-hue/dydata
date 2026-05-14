"use client";

import AIChannelsClient from "./ai-channels-client";

export type AIConfigTabKey = "channels" | "rewrite";

export function AIConfigShell(props: { initialTab: AIConfigTabKey }) {
  void props;
  return <AIChannelsClient />;
}
