import assert from "node:assert/strict";
import test from "node:test";

import {
  loadWriterCandidates,
  loadWriterCertifications,
  saveWriterCertification,
  canCertifyWriter,
} from "./writer-certifications";

test("组长认证候选只含其他组员，老板可管理范围内所有在职成员", () => {
  assert.equal(canCertifyWriter({ userId: "admin", companyRole: "admin" }, { id: "admin", companyRole: "admin" }), false);
  assert.equal(canCertifyWriter({ userId: "admin", companyRole: "admin" }, { id: "boss", companyRole: "company_owner" }), false);
  assert.equal(canCertifyWriter({ userId: "admin", companyRole: "admin" }, { id: "member", companyRole: "member" }), true);
  assert.equal(canCertifyWriter({ userId: "boss", companyRole: "company_owner" }, { id: "boss", companyRole: "company_owner" }), true);
  assert.equal(canCertifyWriter({ userId: "member", companyRole: "member" }, { id: "other", companyRole: "member" }), false);
});

test("读取文案认证时只请求当前人员，并保留认证人的姓名快照", async () => {
  let table = "";
  let selected = "";
  let requestedUserIds: string[] = [];
  const query = {
    select(columns: string) {
      selected = columns;
      return this;
    },
    async in(_column: string, userIds: string[]) {
      requestedUserIds = userIds;
      return {
        data: [{
          user_id: "writer-1",
          certified: true,
          certified_by: "admin-1",
          certified_by_name: "阿禅",
          updated_at: "2026-09-07T08:00:00.000Z",
        }],
        error: null,
      };
    },
  };

  const rows = await loadWriterCertifications({
    from(name: string) {
      table = name;
      return query;
    },
  } as never, ["writer-1", "writer-2"]);

  assert.equal(table, "writer_certifications");
  assert.match(selected, /certified_by_name/);
  assert.deepEqual(requestedUserIds, ["writer-1", "writer-2"]);
  assert.deepEqual(rows, [{
    userId: "writer-1",
    certified: true,
    certifiedBy: "admin-1",
    certifiedByName: "阿禅",
    updatedAt: "2026-09-07T08:00:00.000Z",
  }]);
});

test("认证查询失败时明确失败，不能伪装成无人认证", async () => {
  await assert.rejects(
    () => loadWriterCertifications({
      from() {
        return {
          select() {
            return {
              async in() {
                return { data: null, error: { message: "connection failed" } };
              },
            };
          },
        };
      },
    } as never, ["writer-1"]),
    /加载文案认证状态失败/,
  );
});

test("文案认证候选只返回当前范围内的在职成员，零作品成员也保留", async () => {
  const profileQuery = {
    select() { return this; },
    async in() {
      return {
        data: [
          { id: "writer-1", name: "零作品文案", membership_status: "active" },
          { id: "archived-1", name: "归档成员", membership_status: "archived" },
        ],
        error: null,
      };
    },
  };
  const certificationQuery = {
    select() { return this; },
    async in() {
      return {
        data: [{
          user_id: "writer-1",
          certified: true,
          certified_by: "admin-1",
          certified_by_name: "阿禅",
          updated_at: "2026-09-07T08:00:00.000Z",
        }],
        error: null,
      };
    },
  };

  const rows = await loadWriterCandidates({
    supabase: {
      from(table: string) {
        return table === "profiles" ? profileQuery : certificationQuery;
      },
    } as never,
    activeVisibleUserIds: ["writer-1", "archived-1"],
  });

  assert.deepEqual(rows, [{
    userId: "writer-1",
    name: "零作品文案",
    certified: true,
    certifiedByName: "阿禅",
  }]);
});

test("认证写入以 user_id 冲突更新，认证人姓名快照和状态同次保存", async () => {
  let upsertRow: Record<string, unknown> | null = null;
  let onConflict: string | null = null;
  const query = {
    upsert(row: Record<string, unknown>, options: { onConflict?: string }) {
      upsertRow = row;
      onConflict = options.onConflict ?? null;
      return this;
    },
    select() { return this; },
    async single() {
      return {
        data: {
          user_id: "writer-1",
          certified: false,
          certified_by: "admin-2",
          certified_by_name: "新管理员",
          updated_at: "2026-09-07T09:00:00.000Z",
        },
        error: null,
      };
    },
  };

  const result = await saveWriterCertification({
    supabase: { from: () => query } as never,
    userId: "writer-1",
    certified: false,
    certifiedBy: "admin-2",
    certifiedByName: "新管理员",
  });

  assert.equal(onConflict, "user_id");
  assert.deepEqual(upsertRow, {
    user_id: "writer-1",
    certified: false,
    certified_by: "admin-2",
    certified_by_name: "新管理员",
  });
  assert.deepEqual(result, {
    userId: "writer-1",
    certified: false,
    certifiedBy: "admin-2",
    certifiedByName: "新管理员",
    updatedAt: "2026-09-07T09:00:00.000Z",
  });
});
