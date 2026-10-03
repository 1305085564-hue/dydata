// Compatibility出口：导航规则已归档到 navigation/domain；数据管理仍指向 /admin/collaboration。
export {
  getNavGroups,
  getNavItems,
  isNavGroupActive,
} from "@/lib/navigation/domain/navigation";
export type {
  GetNavItemsInput,
  NavGroup,
  NavItem,
  NavSubItem,
} from "@/lib/navigation/domain/navigation";
