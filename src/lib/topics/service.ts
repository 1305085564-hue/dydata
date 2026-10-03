/**
 * Compatibility出口：B02 将纯规则与 Supabase 数据访问分别迁入 domain/data。
 * 新页面与 API 直接依赖两层目录；历史调用方可在过渡期继续从这里读取同名符号。
 */
export { matchTopicGroup } from "./group-matching";
export * from "./domain";
export * from "./data";
