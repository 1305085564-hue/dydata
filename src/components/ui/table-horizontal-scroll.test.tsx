import assert from "node:assert/strict";
import { act } from "react";
import test from "node:test";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FakeElement,
  FakeEvent,
  FakeMouseEvent,
  setupDomTestEnv,
  type FakeEventInit,
} from "@/lib/testing/dom-harness";

class FakeWheelEvent extends FakeEvent {
  deltaX: number;
  deltaY: number;

  constructor(init: FakeEventInit & { deltaX?: number; deltaY?: number } = {}) {
    super("wheel", { bubbles: true, cancelable: true, ...init });
    this.deltaX = init.deltaX ?? 0;
    this.deltaY = init.deltaY ?? 0;
  }
}

class FakePointerMouseEvent extends FakeMouseEvent {
  clientX: number;
  clientY: number;

  constructor(type: string, init: FakeEventInit & { clientX?: number; clientY?: number } = {}) {
    super(type, init);
    this.clientX = init.clientX ?? 0;
    this.clientY = init.clientY ?? 0;
  }
}

function makeRect(rect: { top: number; left: number; width: number; height: number }) {
  return {
    top: rect.top,
    left: rect.left,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    width: rect.width,
    height: rect.height,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  };
}

function setRect(el: FakeElement, rect: { top: number; left: number; width: number; height: number }) {
  el.getBoundingClientRect = () => makeRect(rect);
}

function SampleTable({
  freezeFirst = false,
  stickyHeader = false,
  firstHeadClassName,
}: {
  freezeFirst?: boolean;
  stickyHeader?: boolean;
  firstHeadClassName?: string;
}) {
  return (
    <Table freezeFirst={freezeFirst} stickyHeader={stickyHeader}>
      <TableHeader>
        <TableRow>
          <TableHead className={firstHeadClassName}>姓名</TableHead>
          <TableHead>播放量</TableHead>
          <TableHead>互动率</TableHead>
          <TableHead>完播率</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>张三</TableCell>
          <TableCell>12,345</TableCell>
          <TableCell>4.2%</TableCell>
          <TableCell>38.1%</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

test("无横向溢出时不渲染任何横滚辅助控件，stickyHeader 路径保持原样", async () => {
  const env = setupDomTestEnv();
  const { container, unmount } = await env.mount(<SampleTable />);

  try {
    const shell = container.querySelector('[data-slot="table-scroll-shell"]');
    const scrollEl = container.querySelector('[data-slot="table-container"]');
    assert.ok(shell && scrollEl, "默认模式应渲染 table-scroll-shell 与 table-container");

    scrollEl.clientWidth = 1000;
    scrollEl.scrollWidth = 1000;
    setRect(shell, { top: 100, left: 40, width: 1000, height: 600 });

    await act(async () => {
      env.triggerResizeObserver(scrollEl);
      env.flushAnimationFrames();
    });

    assert.equal(container.querySelector('[data-slot="table-hscroll-fade-right"]'), null);
    assert.equal(container.querySelector('[data-slot="table-hscroll-btn-left"]'), null);
    assert.equal(container.querySelector('[data-slot="table-hscroll-btn-right"]'), null);
    assert.equal(env.document.body.querySelector('[data-slot="table-floating-hscroll"]'), null);
  } finally {
    await unmount();
  }

  const stickyMount = await env.mount(<SampleTable stickyHeader />);
  try {
    assert.equal(stickyMount.container.querySelector('[data-slot="table-scroll-shell"]'), null);
    const stickyContainer = stickyMount.container.querySelector('[data-slot="table-container"]');
    assert.ok(stickyContainer);
    assert.equal(stickyContainer.getAttribute("data-sticky-header"), "true");
    assert.doesNotMatch(stickyContainer.className, /\boverflow-x-auto\b/);
  } finally {
    await stickyMount.unmount();
    env.cleanup();
  }
});

test("横向溢出时显隐右侧渐变与左右箭钮，点击平滑翻移并在滚到底后隐藏右侧提示", async () => {
  const env = setupDomTestEnv();
  const { container, unmount } = await env.mount(<SampleTable />);

  try {
    const shell = container.querySelector('[data-slot="table-scroll-shell"]');
    const scrollEl = container.querySelector('[data-slot="table-container"]');
    assert.ok(shell && scrollEl);

    scrollEl.clientWidth = 1000;
    scrollEl.scrollWidth = 1800;
    scrollEl.scrollLeft = 0;
    setRect(shell, { top: 100, left: 24, width: 1000, height: 400 });

    await act(async () => {
      env.triggerResizeObserver(scrollEl);
      env.flushAnimationFrames();
    });

    const fadeRight = container.querySelector('[data-slot="table-hscroll-fade-right"]');
    assert.ok(fadeRight, "溢出且未滚到底时应渲染右侧渐变");
    assert.match(fadeRight.className, /\bopacity-100\b/);
    assert.equal(container.querySelector('[data-slot="table-hscroll-btn-left"]'), null);

    const rightBtn = container.querySelector('[data-slot="table-hscroll-btn-right"]');
    assert.ok(rightBtn, "初始最左端应显示向右箭钮");
    assert.equal(rightBtn.getAttribute("aria-label"), "向右查看更多列");

    // 点击向右箭钮：step = Math.max(240, Math.round((1000 - 0) * 0.7)) = 700
    await act(async () => {
      rightBtn.dispatchEvent(new FakePointerMouseEvent("click"));
    });
    assert.equal(scrollEl.scrollLeft, 700);

    // 滚动后左侧箭钮应出现，右侧仍剩余 100px 因此向右箭钮仍在
    const leftBtn = container.querySelector('[data-slot="table-hscroll-btn-left"]');
    assert.ok(leftBtn, "向右滚动后应出现向左箭钮");
    assert.equal(leftBtn.getAttribute("aria-label"), "向左查看更多列");
    assert.equal(leftBtn.style.left, "8px", "无冻结首列时左侧箭钮距左缘 8px");

    // 再次点击向右箭钮，到达最右端 800
    const rightBtn2 = container.querySelector('[data-slot="table-hscroll-btn-right"]');
    assert.ok(rightBtn2);
    await act(async () => {
      rightBtn2.dispatchEvent(new FakePointerMouseEvent("click"));
    });
    assert.equal(scrollEl.scrollLeft, 800);
    assert.equal(container.querySelector('[data-slot="table-hscroll-btn-right"]'), null, "滚到底后向右箭钮消失");
    const fadeAtEnd = container.querySelector('[data-slot="table-hscroll-fade-right"]');
    assert.ok(fadeAtEnd);
    assert.match(fadeAtEnd.className, /\bopacity-0\b/, "滚到底后右侧渐变自动淡出");

    // 点击向左箭钮回滚 700 -> 100
    const leftBtnAfterEnd = container.querySelector('[data-slot="table-hscroll-btn-left"]');
    assert.ok(leftBtnAfterEnd);
    await act(async () => {
      leftBtnAfterEnd.dispatchEvent(new FakePointerMouseEvent("click"));
    });
    assert.equal(scrollEl.scrollLeft, 100);
  } finally {
    await unmount();
    env.cleanup();
  }
});

test("首列冻结避让左侧箭钮位置（兼容 sticky class 与 freezeFirst），且长表箭钮垂直居中跟随", async () => {
  const env = setupDomTestEnv();
  const { container, unmount } = await env.mount(
    <SampleTable firstHeadClassName="sticky left-0 z-20 bg-[#FCFCFB]" />,
  );

  try {
    const shell = container.querySelector('[data-slot="table-scroll-shell"]');
    const scrollEl = container.querySelector('[data-slot="table-container"]');
    const firstTh = container.querySelector("th");
    const thead = container.querySelector("thead");
    assert.ok(shell && scrollEl && firstTh && thead);

    scrollEl.clientWidth = 1000;
    scrollEl.scrollWidth = 1800;
    scrollEl.scrollLeft = 200;
    setRect(firstTh, { top: -400, left: 24, width: 212, height: 36 });
    setRect(thead, { top: -400, left: 24, width: 1800, height: 36 });
    // 长表高度 1200px，用户滚到中间（rect.top = -400, rect.bottom = 800, vh = 800）
    setRect(shell, { top: -400, left: 24, width: 1000, height: 1200 });

    await act(async () => {
      env.triggerResizeObserver(scrollEl);
      env.flushAnimationFrames();
    });

    const leftBtn = container.querySelector('[data-slot="table-hscroll-btn-left"]');
    const rightBtn = container.querySelector('[data-slot="table-hscroll-btn-right"]');
    assert.ok(leftBtn && rightBtn);
    assert.equal(leftBtn.style.left, "220px", "冻结首列 212px 时左侧箭钮应定位在 212 + 8 = 220px");

    // 视口可见区间 [64, 768] 中心 416，换算容器内坐标 416 - (-400) = 816px
    assert.equal(leftBtn.style.top, "816px");
    assert.equal(rightBtn.style.top, "816px");

    // 点击向右翻移时应按扣除首列宽度的可视区 70% 计算：Math.round((1000 - 212) * 0.7) = 552 -> 752
    await act(async () => {
      rightBtn.dispatchEvent(new FakePointerMouseEvent("click"));
    });
    assert.equal(scrollEl.scrollLeft, 752);

    // 当表格刚露头在屏幕底部时，top 不得小于表头下沿（36 + 16 = 52px）
    setRect(shell, { top: 700, left: 24, width: 1000, height: 1200 });
    await act(async () => {
      env.dispatchWindowEvent(new FakeEvent("scroll"));
      env.flushAnimationFrames();
    });
    const clampedTop = Number.parseInt(leftBtn.style.top, 10);
    assert.ok(clampedTop >= 52, `箭钮 top(${clampedTop}) 应避开表头`);
  } finally {
    await unmount();
    env.cleanup();
  }
});

test("Shift + 滚轮横滚生效、触边放行，且不拦截普通上下滚轮与触控板 deltaX", async () => {
  const env = setupDomTestEnv();
  const { container, unmount } = await env.mount(<SampleTable />);

  try {
    const shell = container.querySelector('[data-slot="table-scroll-shell"]');
    const scrollEl = container.querySelector('[data-slot="table-container"]');
    assert.ok(shell && scrollEl);

    scrollEl.clientWidth = 1000;
    scrollEl.scrollWidth = 1400;
    scrollEl.scrollLeft = 0;
    setRect(shell, { top: 100, left: 24, width: 1000, height: 400 });

    await act(async () => {
      env.triggerResizeObserver(scrollEl);
      env.flushAnimationFrames();
    });

    // 1. 普通上下滚轮不拦截
    const normalWheel = new FakeWheelEvent({ shiftKey: false, deltaY: 100, deltaX: 0 });
    await act(async () => {
      scrollEl.dispatchEvent(normalWheel);
    });
    assert.equal(normalWheel.defaultPrevented, false);
    assert.equal(scrollEl.scrollLeft, 0);

    // 2. 触控板原生横向 deltaX 不拦截
    const trackpadWheel = new FakeWheelEvent({ shiftKey: true, deltaX: 80, deltaY: 10 });
    await act(async () => {
      scrollEl.dispatchEvent(trackpadWheel);
    });
    assert.equal(trackpadWheel.defaultPrevented, false);
    assert.equal(scrollEl.scrollLeft, 0);

    // 3. 在最左端向左滚（触左边界）：自然放行
    const leftEdgeWheel = new FakeWheelEvent({ shiftKey: true, deltaY: -120, deltaX: 0 });
    await act(async () => {
      scrollEl.dispatchEvent(leftEdgeWheel);
    });
    assert.equal(leftEdgeWheel.defaultPrevented, false);
    assert.equal(scrollEl.scrollLeft, 0);

    // 4. Shift + 向下滚轮 -> 向右横滚 150px 并阻止默认事件
    const shiftRightWheel = new FakeWheelEvent({ shiftKey: true, deltaY: 150, deltaX: 0 });
    await act(async () => {
      scrollEl.dispatchEvent(shiftRightWheel);
    });
    assert.equal(shiftRightWheel.defaultPrevented, true);
    assert.equal(scrollEl.scrollLeft, 150);

    // 5. 滚到最右端 400 后，再向右滚（触右边界）：自然放行
    const toEndWheel = new FakeWheelEvent({ shiftKey: true, deltaY: 300, deltaX: 0 });
    await act(async () => {
      scrollEl.dispatchEvent(toEndWheel);
    });
    assert.equal(toEndWheel.defaultPrevented, true);
    assert.equal(scrollEl.scrollLeft, 400);

    const rightEdgeWheel = new FakeWheelEvent({ shiftKey: true, deltaY: 100, deltaX: 0 });
    await act(async () => {
      scrollEl.dispatchEvent(rightEdgeWheel);
    });
    assert.equal(rightEdgeWheel.defaultPrevented, false);
    assert.equal(scrollEl.scrollLeft, 400);
  } finally {
    await unmount();
    env.cleanup();
  }
});

test("窗口底边悬浮同步滑条按长表视口条件显隐、水平对齐，支持拖拽与点击轨道双向同步且绝不双条", async () => {
  const env = setupDomTestEnv();
  const { container, unmount } = await env.mount(<SampleTable />);

  try {
    const shell = container.querySelector('[data-slot="table-scroll-shell"]');
    const scrollEl = container.querySelector('[data-slot="table-container"]');
    assert.ok(shell && scrollEl);

    scrollEl.clientWidth = 1000;
    scrollEl.scrollWidth = 2000;
    scrollEl.scrollLeft = 0;
    // 视口 800px，表格在 [120, 1200]：在视口内且原生底条在视口下方不可见
    setRect(shell, { top: 120, left: 32, width: 1000, height: 1080 });

    await act(async () => {
      env.triggerResizeObserver(scrollEl);
      env.flushAnimationFrames();
    });

    const floatingBar = env.document.body.querySelector('[data-slot="table-floating-hscroll"]');
    assert.ok(floatingBar, "长表原生底部滚条未进入视口时，应在 document.body 渲染悬浮滑条");
    assert.equal(floatingBar.style.left, "32px");
    assert.equal(floatingBar.style.width, "1000px");

    const track = env.document.body.querySelector('[data-slot="table-floating-hscroll-track"]');
    const thumb = env.document.body.querySelector('[data-slot="table-floating-hscroll-thumb"]');
    assert.ok(track && thumb);
    setRect(track, { top: 768, left: 44, width: 976, height: 20 });

    // 1. 拖动滑块向右 244px：thumbWidth = 50% (488px)，usableTrack = 488px，delta 244 -> scrollLeft = 500
    await act(async () => {
      thumb.dispatchEvent(new FakePointerMouseEvent("mousedown", { clientX: 100, button: 0 }));
    });
    await act(async () => {
      env.dispatchWindowEvent(new FakePointerMouseEvent("mousemove", { clientX: 344 }));
    });
    assert.equal(Math.round(scrollEl.scrollLeft), 500, "拖动悬浮滑块应同步更新 scrollLeft");
    assert.equal(track.getAttribute("aria-valuenow"), "500");

    await act(async () => {
      env.dispatchWindowEvent(new FakePointerMouseEvent("mouseup", { clientX: 344 }));
    });

    // 2. 原生横向滚动也应反向同步到悬浮滑条的 aria-valuenow
    scrollEl.scrollLeft = 250;
    await act(async () => {
      scrollEl.dispatchEvent(new FakeEvent("scroll"));
    });
    assert.equal(track.getAttribute("aria-valuenow"), "250");

    // 3. 点击轨道右端（clickX = 976 - 10 = 966）：滑块跳到最右 -> scrollLeft = 1000
    await act(async () => {
      track.dispatchEvent(new FakePointerMouseEvent("mousedown", { clientX: 44 + 966, button: 0 }));
    });
    assert.equal(Math.round(scrollEl.scrollLeft), 1000);

    // 4. 页面下滚，原生底部滚条进入视口（rect.bottom = 800 <= 804）：悬浮滑条立即隐藏，绝不双条
    setRect(shell, { top: -280, left: 32, width: 1000, height: 1080 });
    await act(async () => {
      env.dispatchWindowEvent(new FakeEvent("scroll"));
      env.flushAnimationFrames();
    });
    assert.equal(
      env.document.body.querySelector('[data-slot="table-floating-hscroll"]'),
      null,
      "看到表格底部原生滚条时必须隐藏悬浮滑条",
    );

    // 5. 表格完全滚出视口下方（rect.top = 750 >= 800 - 80）：同样不显示
    setRect(shell, { top: 750, left: 32, width: 1000, height: 1080 });
    await act(async () => {
      env.dispatchWindowEvent(new FakeEvent("scroll"));
      env.flushAnimationFrames();
    });
    assert.equal(env.document.body.querySelector('[data-slot="table-floating-hscroll"]'), null);
  } finally {
    await unmount();
    env.cleanup();
  }
});
