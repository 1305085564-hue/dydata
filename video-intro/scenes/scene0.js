// Scene 0 · 片头 0-5s
// 暖白底，中央 Serif 大标题 DYData + 副标题，橙色细线生长，底部 dydata.cc
window.SCENES = window.SCENES || [];
window.SCENES[0] = {
  durationMs: 5000,
  draw: function (ctx, W, H, t) {
    var D = window.DY, C = D.C, DUR = 5;
    D.bg(ctx, W, H);

    var cx = W / 2, baseY = 522;

    // 大标题：从下方遮罩升起 + 字距收紧落定
    var pT = D.outQuint(D.prog(t, 0.25, 1.1));
    if (pT > 0) {
      var size = 172, tr = -10 + 4 * pT;   // tracking-tight，收到 -6
      ctx.save();
      // 遮罩：文字由下往上显影
      var maskTop = baseY - size * 0.82;
      var maskH = size * 1.08;
      ctx.beginPath();
      ctx.rect(cx - 700, maskTop + maskH * (1 - pT), 1400, maskH * pT + 1);
      ctx.clip();
      D.text(ctx, 'DYData', cx, baseY + (1 - pT) * 26, {
        s: size, w: 600, serif: true, al: 'center', tr: tr, c: C.ink
      });
      ctx.restore();
    }

    // 橙色细线：自中心向两侧生长
    var pL = D.outCubic(D.prog(t, 1.15, 0.9));
    if (pL > 0) {
      ctx.save(); ctx.fillStyle = C.orange;
      ctx.fillRect(cx - 300 * pL, baseY + 64, 600 * pL, 3);
      ctx.restore();
    }

    // 副标题
    var pS = D.outCubic(D.prog(t, 1.75, 0.85));
    D.text(ctx, '抖音数据日报平台', cx, baseY + 150 + (1 - pS) * 18, {
      s: 54, w: 400, al: 'center', c: C.ink2, a: pS, tr: 2
    });

    // 底部域名（在字幕安全区内）
    var pD = D.outCubic(D.prog(t, 2.5, 0.8));
    D.text(ctx, 'dydata.cc', cx, H - 86 + (1 - pD) * 10, {
      s: 42, w: 500, al: 'center', c: C.muteSoft, a: pD * 0.95, tr: 4
    });

    D.vignette(ctx, W, H);
    D.fade(ctx, W, H, t, DUR, 0.45, 0.22);
  }
};
