import type { EmployeeType } from "@/types";

export function normalizeEmployeeType(value: string | null | undefined): EmployeeType {
  return value === "external" ? "external" : "internal";
}

export function isExternalEmployee(value: string | null | undefined) {
  return normalizeEmployeeType(value) === "external";
}

export function getMaskedDataNotice() {
  return "外部员工模式：可查看页面结构与功能入口，但不会展示真实业务数据。";
}
