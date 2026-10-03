"use client";

import { FormV2LeftColumn, type FormV2LeftColumnProps } from "./left-column";
import { FormV2RightColumn, type FormV2RightColumnProps } from "./right-column";

export type FormV2WorkspaceProps = FormV2LeftColumnProps & FormV2RightColumnProps;

export function FormV2Workspace(props: FormV2WorkspaceProps) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[290px_minmax(0,1fr)] lg:grid-rows-[auto_auto_auto] lg:gap-x-5 lg:gap-y-0 items-start">
      {/* 主工作区 - Claude 设计系统 */}
      {/* 两栏布局：左侧截图 + 右侧数据；lg 起两栏各拆上下两半，中间留一行通栏发丝线 */}
      {/* 左栏：截图上传 */}
      <FormV2LeftColumn {...props} />

      {/* 右栏：核心数据 + 标题文案 */}
      <FormV2RightColumn {...props} />

      {/* 通栏发丝线：lg 起切分「上传 + 数据指标」与「设置 + 标题文案」两个语义组 */}
      <div
        aria-hidden="true"
        className="hidden lg:block lg:col-span-2 lg:row-start-2 lg:mt-5 h-px bg-[#E2E2DF]/60"
      />
    </div>
  );
}
