import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveHistoryEditRpcErrorMessage,
} from "./history-report-edit-rpc";

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
