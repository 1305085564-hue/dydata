export function getContentReviewOnboardingStepThree(canReviewContent: boolean): string {
  if (canReviewContent) {
    return "结合流量曲线定位问题、复制文案；符合条件的作品可从详情抽屉移出或恢复到选题库。";
  }

  return "结合流量曲线定位问题，查看截图和原视频，核对作品的复盘证据。";
}
