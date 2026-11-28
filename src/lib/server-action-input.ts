import { z } from "zod";

export const actionId = z.uuid();
export const actionNote = z.string().trim().max(200).nullable();
export const actionName = z.string().trim().min(1).max(30);
export const actionRemark = z.string().trim().max(30);

export function validActionIds(...values: unknown[]) {
  return values.every((value) => actionId.safeParse(value).success);
}
