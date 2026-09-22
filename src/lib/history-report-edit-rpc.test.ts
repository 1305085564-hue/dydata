import assert from "node:assert/strict";
import test from "node:test";

import {
  isHistoryEditRpcMissing,
  resolveHistoryEditRpcErrorMessage,
} from "./history-report-edit-rpc";

test("只有「函数不存在」才降级到旧的两次写入", () => {
  assert.equal(isHistoryEditRpcMissing(null), false);
  assert.equal(isHistoryEditRpcMissing({ code: "42883", message: "function public.x(uuid) does not exist" }), true);
  assert.equal(
    isHistoryEditRpcMissing({ code: "PGRST202", message: "Could not find the function public.x in the schema cache" }),
    true,
  );
  assert.equal(isHistoryEditRpcMissing({ code: "42501", message: "permission denied for function" }), false);
});

test("RPC 内部 raise 的业务错误原样回显，其余错误不泄露数据库细节", () => {
  assert.equal(
    resolveHistoryEditRpcErrorMessage({ code: "P0001", message: "视频与日报绑定已变化，请重新打开编辑窗口" }),
    "视频与日报绑定已变化，请重新打开编辑窗口",
  );
  assert.equal(
    resolveHistoryEditRpcErrorMessage({ code: "P0002", message: "日报不存在" }),
    "日报不存在",
  );
  assert.equal(
    resolveHistoryEditRpcErrorMessage({
      code: "57014",
      message: 'canceling statement due to statement timeout at "select * from public.daily_reports"',
    }),
    "保存失败，请重试",
  );
  assert.equal(resolveHistoryEditRpcErrorMessage(null), "保存失败，请重试");
});
