import { MobilePlaceholder } from "@/components/mobile/mobile-placeholder";

export const metadata = {
  title: "选题 - DYData",
};

export default function MobileTopicsPage() {
  return (
    <MobilePlaceholder
      title="选题"
      description="移动端选题库正在打磨，将接入真实 /api/topics/* 接口，支持母题/子题认领、横向对比与 AI 推荐。"
    />
  );
}
