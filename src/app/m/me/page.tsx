import { MobilePlaceholder } from "@/components/mobile/mobile-placeholder";

export const metadata = {
  title: "我的 - DYData",
};

export default function MobileMePage() {
  return (
    <MobilePlaceholder
      title="我的"
      description="个人资料与设置，将从 profiles 与权限体系读取真实数据，包含作品统计、通知设置与低调退出。"
    />
  );
}
