"use client";

import { useState } from "react";
import { VideoSubmitFormV2 } from "../video-submit-form-v2";

/**
 * 测试页面 - 验证 VideoSubmitFormV2 的 Claude 设计改造
 */
export default function TestV2Page() {
  const [submittedData, setSubmittedData] = useState<any>(null);

  const mockAccount = {
    id: "test-account-id",
    name: "测试账号",
    display_name: "测试账号",
    content_direction: "财经",
  };

  const mockUserId = "test-user-id";
  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="min-h-screen bg-[#FBF9F5] p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="rounded-xl border border-[#E5E0D6] bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-[#1C1917] mb-2">
            VideoSubmitForm V2 测试
          </h1>
          <p className="text-sm text-[#78716C]">
            验证 Claude 设计系统改造后的表单 - 保留所有 Antigravity 业务逻辑
          </p>
        </div>

        <VideoSubmitFormV2
          account={mockAccount}
          userId={mockUserId}
          today={today}
          mode="create"
          initialSummary={null}
          onSubmitted={(video, aiTags, summary) => {
            console.log("提交成功", { video, aiTags, summary });
            setSubmittedData({ video, aiTags, summary });
          }}
          onCancel={() => {
            console.log("取消提交");
          }}
        />

        {submittedData && (
          <div className="rounded-xl border border-[#6FAA7D]/20 bg-[#6FAA7D]/10 p-4">
            <h2 className="text-sm font-semibold text-[#6FAA7D] mb-2">
              提交成功 ✓
            </h2>
            <pre className="text-xs text-[#292524] overflow-auto">
              {JSON.stringify(submittedData, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
