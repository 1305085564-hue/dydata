import type { RequestContext } from "./request-context";

/**
 * 用例层统一表达核心写入与后置副作用，避免把“业务已成功但通知失败”压成一个 500。
 * 具体领域可以在 data 中携带自己的结果，但不得删除这些状态字段。
 */
export type OperationResult<T> = {
  data: T | null;
  businessSucceeded: boolean;
  permissionChecked: boolean;
  auditSucceeded: boolean | null;
  notificationSucceeded: boolean | null;
  todoMarked: boolean | null;
  compensationRequired: boolean;
  requestId: string;
};

export function createOperationResult<T>(input: {
  context: RequestContext;
  data?: T | null;
  businessSucceeded: boolean;
  permissionChecked: boolean;
  auditSucceeded?: boolean | null;
  notificationSucceeded?: boolean | null;
  todoMarked?: boolean | null;
  compensationRequired?: boolean;
}): OperationResult<T> {
  return {
    data: input.data ?? null,
    businessSucceeded: input.businessSucceeded,
    permissionChecked: input.permissionChecked,
    auditSucceeded: input.auditSucceeded ?? null,
    notificationSucceeded: input.notificationSucceeded ?? null,
    todoMarked: input.todoMarked ?? null,
    compensationRequired: input.compensationRequired ?? false,
    requestId: input.context.requestId,
  };
}
