// 兼容入口：管理端鉴权实现已收口到 src/lib/admin-auth.ts（核心逻辑）、
// src/lib/admin-auth-contract.ts（跨层类型），本文件只做 re-export，保持既有调用方不变。
export { parseDate, requireAdminActor, toBoolean, toObject, toTrimmedString } from "@/lib/admin-auth";

export type {
  AdminActor,
  RequireAdminActorError,
  RequireAdminActorResult,
  RequireAdminActorSuccess,
} from "@/lib/admin-auth-contract";
