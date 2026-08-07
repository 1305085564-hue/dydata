import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdminModuleMemberSummaries,
  hydrateAdminModuleMemberEmails,
} from "@/lib/admin-modules-contract";

test("成员模块首屏摘要只依赖 profiles 与 teams，邮箱允许先为空且保留原始权限", () => {
  const members = buildAdminModuleMemberSummaries(
    [
      {
        id: "owner-1",
        name: "阿禅",
        role: "owner",
        status: "active",
        permissions: null,
        team_id: null,
      },
      {
        id: "admin-1",
        name: "负责人甲",
        role: "admin",
        status: "active",
        permissions: { manage_members: true },
        team_id: "team-1",
      },
      {
        id: "member-1",
        name: "成员乙",
        role: "member",
        status: "active",
        permissions: null,
        team_id: "team-2",
      },
    ],
    [
      { id: "team-1", name: "上海一部" },
      { id: "team-2", name: "深圳二部" },
    ],
  );

  assert.deepEqual(
    members.map((member) => ({
      id: member.id,
      email: member.email,
      team_name: member.team_name,
      permissions: member.permissions,
    })),
    [
      {
        id: "owner-1",
        email: null,
        team_name: null,
        permissions: {},
      },
      {
        id: "admin-1",
        email: null,
        team_name: "上海一部",
        permissions: { manage_members: true },
      },
      {
        id: "member-1",
        email: null,
        team_name: "深圳二部",
        permissions: {},
      },
    ],
  );
});

test("邮箱补全只覆盖命中的成员，不改动其他首屏摘要字段", () => {
  const hydrated = hydrateAdminModuleMemberEmails(
    [
      {
        id: "member-1",
        name: "成员乙",
        role: "member",
        status: "active",
        permissions: { export_data: false },
        email: null,
        team_id: "team-1",
        team_name: "上海一部",
      },
      {
        id: "member-2",
        name: "成员丙",
        role: "member",
        status: "active",
        permissions: { export_data: false },
        email: null,
        team_id: null,
        team_name: null,
      },
    ],
    {
      "member-1": "member-1@dydata.cc",
    },
  );

  assert.deepEqual(hydrated, [
    {
      id: "member-1",
      name: "成员乙",
      role: "member",
      status: "active",
      permissions: { export_data: false },
      email: "member-1@dydata.cc",
      team_id: "team-1",
      team_name: "上海一部",
    },
    {
      id: "member-2",
      name: "成员丙",
      role: "member",
      status: "active",
      permissions: { export_data: false },
      email: null,
      team_id: null,
      team_name: null,
    },
  ]);
});

test("邮箱补全不会用 auth metadata 把已移出成员重新归回团队", () => {
  const hydrated = hydrateAdminModuleMemberEmails(
    [
      {
        id: "member-1",
        name: "成员乙",
        role: "member",
        status: "active",
        permissions: { export_data: false },
        email: null,
        team_id: null,
        team_name: null,
      },
    ],
    {
      "member-1": {
        email: "member-1@dydata.cc",
        team_id: "team-2",
        team_name: "深圳二部",
      },
    },
  );

  assert.deepEqual(hydrated, [
    {
      id: "member-1",
      name: "成员乙",
      role: "member",
      status: "active",
      permissions: { export_data: false },
      email: "member-1@dydata.cc",
      team_id: null,
      team_name: null,
    },
  ]);
});
