import test from "node:test";
import assert from "node:assert/strict";

import {
  ANIMATION_TIMINGS,
  barVariants,
  cardVariants,
  containerVariants,
  formatCountUpValue,
  itemVariants,
  modalVariants,
  shakeVariants,
  toastVariants,
  typewriterCursorClassName,
} from "./animations";

test("containerVariants 使用统一 stagger 节奏", () => {
  assert.equal(containerVariants.hidden && typeof containerVariants.hidden, "object");
  assert.equal(containerVariants.visible && typeof containerVariants.visible, "object");
  assert.equal(
    (containerVariants.visible as { transition?: { staggerChildren?: number } }).transition?.staggerChildren,
    0.05,
  );
});

test("itemVariants 使用 16px 上移动画进入", () => {
  assert.deepEqual(itemVariants.hidden, { opacity: 0, y: 16 });
  assert.equal((itemVariants.visible as { opacity?: number }).opacity, 1);
  assert.equal((itemVariants.visible as { y?: number }).y, 0);
});

test("cardVariants 包含 hover 抬升和阴影变化", () => {
  assert.deepEqual(cardVariants.hidden, { opacity: 0, y: 16 });
  assert.equal((cardVariants.hover as { y?: number }).y, -2);
  assert.match(String((cardVariants.hover as { boxShadow?: string }).boxShadow), /var\(--shadow-card-hover\)/);
});

test("toast、modal、bar、shake variants 使用约定状态", () => {
  assert.equal((toastVariants.initial as { opacity?: number }).opacity, 0);
  assert.equal((toastVariants.animate as { opacity?: number }).opacity, 1);
  assert.equal((modalVariants.exit as { opacity?: number }).opacity, 0);
  assert.equal((barVariants.hidden as { scaleX?: number }).scaleX, 0);
  assert.equal((barVariants.visible as { scaleX?: number }).scaleX, 1);
  assert.deepEqual((shakeVariants.animate as { x?: number[] }).x, [0, -4, 4, -4, 4, -4, 4, 0]);
});

test("formatCountUpValue 支持整数、小数与万单位格式化", () => {
  assert.equal(formatCountUpValue(12890), "12,890");
  assert.equal(formatCountUpValue(12.345, { maximumFractionDigits: 1 }), "12.3");
  assert.equal(
    formatCountUpValue(12500, {
      compactThreshold: 10000,
      compactSuffix: "万",
      compactDivisor: 10000,
      maximumFractionDigits: 2,
    }),
    "1.25万",
  );
});

test("动画时长常量和打字机光标类名可直接复用", () => {
  assert.equal(ANIMATION_TIMINGS.micro, 150);
  assert.equal(ANIMATION_TIMINGS.fast, 250);
  assert.equal(ANIMATION_TIMINGS.normal, 350);
  assert.equal(ANIMATION_TIMINGS.slow, 500);
  assert.equal(ANIMATION_TIMINGS.number, 600);
  assert.equal(typewriterCursorClassName, "typewriter-cursor");
});
