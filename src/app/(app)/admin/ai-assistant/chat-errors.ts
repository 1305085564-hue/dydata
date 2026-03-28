export function getAiAssistantErrorMessage(errorMessage: string) {
  if (errorMessage.includes("public.admin_actions") && errorMessage.includes("schema cache")) {
    return "AI 助手暂不可用，后台审计表还没初始化";
  }

  if (errorMessage.includes("permission denied") && errorMessage.includes("admin_actions")) {
    return "AI 助手暂不可用，后台审计表权限还没开放";
  }

  return errorMessage;
}
