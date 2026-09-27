// DYData 介绍片 · 共享设计系统
// 约束：纯函数、无随机、无外部资源。品牌色锁死（见 site-info.md）。
window.DY = (function () {
  // ---- 调色板（锁死）----
  var C = {
    canvas: '#FCFCFB',      // 底
    surface: '#F1F1F0',     // 面
    surfaceSoft: '#F7F7F6',
    white: '#FFFFFF',
    orange: '#D97757',      // 主 CTA
    orangeSoft: '#EBB69F',
    orangeFaint: '#F6E3DA',
    ink: '#141413',
    ink2: '#1F1E1D',
    mute: '#6B6862',
    muteSoft: '#9B978F',
    line: '#E2E2DF',        // 发丝线
    lineSoft: '#EDEDEA',
    up: '#C8493A',          // 涨 = 红
    down: '#3A8F63'         // 跌 = 绿
  };

  var SANS = '"PingFang SC","Hiragino Sans GB","Helvetica Neue",sans-serif';
  var SERIF = '"New York","Songti SC",Georgia,serif';

  // ---- 数学 / 缓动 ----
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function prog(t, start, dur) { return clamp((t - start) / dur, 0, 1); }
  function outCubic(p) { return 1 - Math.pow(1 - p, 3); }
  function outQuint(p) { return 1 - Math.pow(1 - p, 5); }
  function inOut(p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }
  function outBack(p) { var s = 1.70158; var q = p - 1; return 1 + (s + 1) * q * q * q + s * q * q; }
  // 进出淡入淡出包络
  function env(t, start, inDur, hold, outDur) {
    return Math.min(prog(t, start, inDur), 1 - prog(t, start + inDur + hold, outDur));
  }

  // ---- 文本（measure 与 draw 共用同一套 font，避免量错宽度）----
  function fontOf(o) {
    return (o.w || 400) + ' ' + (o.s || 40) + 'px ' + (o.serif ? SERIF : SANS);
  }
  function applyFont(ctx, o) {
    ctx.font = fontOf(o);
    if ('letterSpacing' in ctx) ctx.letterSpacing = (o.tr || 0) + 'px';
  }
  function text(ctx, str, x, y, o) {
    o = o || {};
    if (o.a != null && o.a <= 0) return;
    ctx.save();
    if (o.a != null) ctx.globalAlpha *= o.a;
    applyFont(ctx, o);
    ctx.fillStyle = o.c || C.ink;
    ctx.textAlign = o.al || 'left';
    ctx.textBaseline = o.bl || 'alphabetic';
    ctx.fillText(str, x, y);
    ctx.restore();
  }
  function measure(ctx, str, o) {
    o = o || {};
    ctx.save(); applyFont(ctx, o);
    var w = ctx.measureText(str).width;
    ctx.restore();
    return w;
  }

  // ---- 形状 ----
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function bg(ctx, W, H) { ctx.fillStyle = C.canvas; ctx.fillRect(0, 0, W, H); }
  // 极轻暗角，给纸面一点纵深
  function vignette(ctx, W, H) {
    var g = ctx.createRadialGradient(W / 2, H * 0.44, H * 0.36, W / 2, H * 0.5, H * 1.05);
    g.addColorStop(0, 'rgba(20,20,19,0)');
    g.addColorStop(1, 'rgba(20,20,19,0.045)');
    ctx.save(); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
  }
  // 卡片：柔和投影 + 发丝描边
  function card(ctx, x, y, w, h, o) {
    o = o || {};
    var r = o.r == null ? 18 : o.r, e = o.elev == null ? 26 : o.elev;
    ctx.save();
    ctx.shadowColor = 'rgba(20,20,19,0.075)';
    ctx.shadowBlur = e; ctx.shadowOffsetY = e * 0.34;
    ctx.fillStyle = o.fill || C.white;
    rr(ctx, x, y, w, h, r); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = o.stroke || C.line; ctx.lineWidth = 1.5;
    rr(ctx, x, y, w, h, r); ctx.stroke();
    ctx.restore();
  }
  function hline(ctx, x, y, w, c) {
    ctx.save(); ctx.fillStyle = c || C.line; ctx.fillRect(x, y, w, 1); ctx.restore();
  }
  // 胶囊标签
  function chip(ctx, x, y, w, h, o) {
    o = o || {};
    ctx.save();
    ctx.fillStyle = o.fill || C.surface;
    rr(ctx, x, y, w, h, h / 2); ctx.fill();
    if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw || 1.5; ctx.stroke(); }
    ctx.restore();
  }
  // 勾：p=0..1 逐段画出
  function check(ctx, cx, cy, s, p, color, lw) {
    if (p <= 0) return;
    var pts = [[-0.42, 0.04], [-0.12, 0.34], [0.44, -0.3]];
    var l1 = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
    var l2 = Math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1]);
    var tot = l1 + l2, d = tot * p;
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(s, s);
    ctx.strokeStyle = color || C.down;
    ctx.lineWidth = (lw || 3) / s; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    if (d <= l1) {
      var k = d / l1;
      ctx.lineTo(pts[0][0] + (pts[1][0] - pts[0][0]) * k, pts[0][1] + (pts[1][1] - pts[0][1]) * k);
    } else {
      ctx.lineTo(pts[1][0], pts[1][1]);
      var k2 = (d - l1) / l2;
      ctx.lineTo(pts[1][0] + (pts[2][0] - pts[1][0]) * k2, pts[1][1] + (pts[2][1] - pts[1][1]) * k2);
    }
    ctx.stroke(); ctx.restore();
  }

  // ---- 数字 ----
  function fmt(n) { return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function countUp(to, p) { return fmt(to * outQuint(p)); }

  // ---- 场景通用件 ----
  // 字幕：底部 120px 安全区内，48px ≥ 42px 下限
  function caption(ctx, W, H, str, t, dur) {
    var pIn = prog(t, 0.45, 0.55);
    var a = Math.min(pIn, 1 - prog(t, dur - 0.55, 0.45));
    if (a <= 0) return;
    var rise = (1 - outCubic(pIn)) * 16;
    text(ctx, str, W / 2, H - 86 + rise, { s: 48, w: 500, al: 'center', c: C.ink2, a: a, tr: 0.5 });
  }
  // 场景首尾各 0.4s 淡入淡出，保证切场不硬
  function fade(ctx, W, H, t, dur, inD, outD) {
    inD = inD == null ? 0.22 : inD;
    outD = outD == null ? 0.22 : outD;
    var a = Math.max(1 - prog(t, 0, inD), prog(t, dur - outD, outD));
    if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = C.canvas; ctx.fillRect(0, 0, W, H); ctx.restore();
  }
  // 区块标题：Serif 宣告 + Sans 注脚
  function sectionTitle(ctx, x, str, sub, t, start) {
    var p = outCubic(prog(t, start, 0.7));
    text(ctx, str, x, 188 + (1 - p) * 14, { s: 52, w: 600, serif: true, a: p, tr: -1 });
    if (sub) {
      var p2 = outCubic(prog(t, start + 0.18, 0.7));
      text(ctx, sub, x, 232 + (1 - p2) * 12, { s: 30, w: 400, c: C.mute, a: p2 });
    }
  }

  return {
    C: C, SANS: SANS, SERIF: SERIF,
    clamp: clamp, prog: prog, outCubic: outCubic, outQuint: outQuint, inOut: inOut, outBack: outBack, env: env,
    text: text, measure: measure, rr: rr, bg: bg, vignette: vignette, card: card, hline: hline, chip: chip, check: check,
    fmt: fmt, countUp: countUp, caption: caption, fade: fade, sectionTitle: sectionTitle
  };
})();
