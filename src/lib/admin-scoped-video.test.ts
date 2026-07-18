import test from "node:test";
import assert from "node:assert/strict";

import { requireScopedAdminVideo } from "./admin-scoped-video";

test("请求上下文外无法绕过管理员视频鉴权", async () => {
  await assert.rejects(() => requireScopedAdminVideo({ videoId: "v1", pathname: "/admin/videos" }), /outside a request scope|request scope|cookies/i);
  await assert.rejects(() => requireScopedAdminVideo({ videoId: "", pathname: "/admin/content" }), /outside a request scope|request scope|cookies/i);
});
