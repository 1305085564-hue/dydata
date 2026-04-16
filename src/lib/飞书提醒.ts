type 提醒负责人 = {
  name: string;
  phone: string;
  openId: string;
};

type 未提交成员 = {
  user_id: string;
  name: string;
};

const 飞书提醒负责人名单: Record<string, 提醒负责人> = {
  "15174419058": {
    name: "阿禅",
    phone: "15174419058",
    openId: "ou_7d97150bcc5bb8e32170ef2390a1e36b",
  },
  "18867289333": {
    name: "十八老师",
    phone: "18867289333",
    openId: "ou_fe159ab421cebed7b311c3a15cb339c2",
  },
};

const 连续未交升级负责人手机号 = "18867289333";

export function getEscalationManager() {
  return 飞书提醒负责人名单[连续未交升级负责人手机号] ?? null;
}

export function buildReminderContent(input: {
  unsubmitted: 未提交成员[];
  streakMap: Map<string, number>;
  submittedCount: number;
  totalCount: number;
}) {
  const escalationManager = getEscalationManager();
  const escalatedMembers = input.unsubmitted.filter((member) => (input.streakMap.get(member.user_id) ?? 0) >= 3);

  const nameList = input.unsubmitted
    .map((member) => {
      const streak = input.streakMap.get(member.user_id);
      return streak ? `- ${member.name}（⚠️ 连续 ${streak} 天未交）` : `- ${member.name}`;
    })
    .join("\n");

  const lines = [
    "以下同事今日尚未提交数据：",
    "",
    "**未提交：**",
    nameList,
    "",
    `**已提交：** ${input.submittedCount}/${input.totalCount} 人`,
  ];

  if (escalatedMembers.length > 0 && escalationManager) {
    lines.push(
      "",
      `**升级提醒：** <at id=${escalationManager.openId}></at> 请跟进以下成员`,
      escalatedMembers.map((member) => `- ${member.name}`).join("\n"),
    );
  }

  lines.push("", "请尽快提交 👉 https://dydata.cc");

  return {
    content: lines.join("\n"),
    escalatedMembers,
    escalationManager,
  };
}
