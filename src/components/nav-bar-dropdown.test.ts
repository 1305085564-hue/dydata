import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(resolve(process.cwd(), "src/components/nav-bar-client.tsx"), "utf8");

// 背景：悬停展开 + 点击反向收起会让「滑入即展开」紧接着被一次单击关掉；
// 浮层自己绑 mouseleave 则会在「浮层 → 回到触发器」这类不离开容器内部的移动后，
// 于 150ms 后自毁（这类移动不会重发容器的 mouseenter，没人取消计时器）。

test("浮层不自行判定移出，离开本组的判定只在容器层", () => {
  const count = (needle: string) => source.split(needle).length - 1;
  assert.equal(count("onMouseLeave"), 1, "只允许容器绑一处 onMouseLeave");
  assert.equal(
    count("onMouseEnter={() => handleDropdownHoverOpen(group.key)}"),
    1,
    "悬停展开只允许容器绑定一次",
  );
  assert.equal(count("handleDropdownHoverLeave"), 2, "仅定义 + 容器使用各一次");
});

test("容器判定移出时排除仍停留在本组内部的指针", () => {
  assert.match(source, /const nextTarget = event\.relatedTarget;/);
  assert.match(source, /event\.currentTarget\.contains\(nextTarget\)/);
});

test("点击触发器不再反向收起悬停已展开的菜单", () => {
  assert.doesNotMatch(source, /curr === group\.key \? null : group\.key/);
  assert.match(source, /handleDropdownTriggerClick/);
  assert.match(source, /current\?\.key === key && current\.pinned \? null : \{ key, pinned: true \}/);
});

test("指针移开后延迟收起时，点击锁定的菜单不被收起", () => {
  assert.match(source, /current\?\.key === key && !current\.pinned \? null : current/);
  assert.match(source, /HOVER_MENU_CLOSE_DELAY_MS/);
  assert.match(source, /from "@\/lib\/hover-pointer"/);
});

test("无真实悬停能力的设备上关闭悬停展开", () => {
  assert.match(source, /import \{ hasHoverPointer, HOVER_MENU_CLOSE_DELAY_MS \} from "@\/lib\/hover-pointer"/);
  assert.match(source, /if \(!hasHoverPointer\(\)\) return;/);
});

test("点击组外收起展开的菜单", () => {
  assert.match(source, /document\.addEventListener\("mousedown", handlePointerDown\)/);
  assert.match(source, /dropdownContainersRef/);
});
