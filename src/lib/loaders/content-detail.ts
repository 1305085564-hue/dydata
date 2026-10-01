/**
 * 视频复盘详情的共享取数边界。
 *
 * 内容管理页与数据管理的 work-video 只通过这个入口读取详情，
 * 具体查询实现暂时留在 admin-content-page，避免本轮改变返回契约。
 */
export { loadAdminContentVideoDetail } from "./admin-content-page";
export type { AdminContentVideoDetail } from "./admin-content-page";
