import assert from "node:assert/strict";
import test from "node:test";

import {
  buildContentApiUrl,
  shouldReloadContentPageList,
  type ContentPageQueryState,
} from "./content-page-query";

const companyState: ContentPageQueryState = {
  view: "all",
  perspective: "company",
  teamId: null,
};

test("列表查询 URL 保留范围并只在 fresh 时绕过服务端缓存", () => {
  assert.equal(
    buildContentApiUrl("trash", "team", "team-1"),
    "/api/admin/content/list?view=trash&scope=team&teamId=team-1",
  );
  assert.equal(
    buildContentApiUrl("all", "company", null, { fresh: true }),
    "/api/admin/content/list?view=all&scope=company&fresh=1",
  );
});

test("浏览器后退只在列表范围改变时重新取数", () => {
  assert.equal(
    shouldReloadContentPageList(
      { ...companyState, teamId: "team-1", perspective: "team" },
      companyState,
    ),
    true,
  );
  assert.equal(
    shouldReloadContentPageList(companyState, companyState),
    false,
  );
});
