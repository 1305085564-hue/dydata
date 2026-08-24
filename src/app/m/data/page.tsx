import { MobilePlaceholder } from "@/components/mobile/mobile-placeholder";

export const metadata = {
  title: "数据 - DYData",
};

export default function MobileDataPage() {
  return (
    <MobilePlaceholder
      title="数据"
      description="成长分析与数据看板移动版，将复用真实 /api/dashboard/trend 与 /api/growth/* 接口，呈现趋势、榜单与六维能力。"
    />
  );
}
