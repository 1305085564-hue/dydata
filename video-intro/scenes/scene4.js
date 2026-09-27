// Scene 4 · 收尾 CTA 42-45s（3s）
// 回到暖白底：DYData + 口号 + dydata.cc，橙色 CTA 条由左向右扫过
window.SCENES = window.SCENES || [];
window.SCENES[4] = {
  durationMs: 3000,
  draw: function (ctx, W, H, t) {
    var D = window.DY, C = D.C, DUR = 3;
    D.bg(ctx, W, H);

    var cx = W / 2;

    // 标题
    var pT = D.outQuint(D.prog(t, 0.0, 0.7));
    D.text(ctx, 'DYData', cx, 486 + (1 - pT) * 18, {
      s: 138, w: 600, serif: true, al: 'center', tr: -7, a: pT
    });

    // 橙色细线
    var pL = D.outCubic(D.prog(t, 0.35, 0.6));
    if (pL > 0) {
      ctx.save(); ctx.fillStyle = C.orange;
      ctx.fillRect(cx - 240 * pL, 530, 480 * pL, 3);
      ctx.restore();
    }

    // 口号
    var pS = D.outCubic(D.prog(t, 0.5, 0.65));
    D.text(ctx, '每天报数，看清每条视频的去向', cx, 614 + (1 - pS) * 14, {
      s: 50, w: 400, al: 'center', c: C.ink2, a: pS, tr: 1.5
    });

    // CTA 条：橙色由左向右填充；文字画两层（墨色底层 + 白色层裁在已填充区域）
    // 这样颜色是被"扫"过去的，不是硬切
    var bw = 520, bh = 92, bx = cx - bw / 2, by = 682;
    var pB = D.outCubic(D.prog(t, 0.95, 0.95));
    var pShow = D.prog(t, 0.8, 0.35);
    if (pShow > 0) {
      ctx.save();
      ctx.globalAlpha = pShow;

      // 轨底
      D.rr(ctx, bx, by, bw, bh, bh / 2);
      ctx.fillStyle = C.orangeFaint; ctx.fill();
      ctx.strokeStyle = C.orangeSoft; ctx.lineWidth = 1.5; ctx.stroke();

      // 墨色文字（未扫到的部分）
      D.text(ctx, 'dydata.cc', cx, by + bh / 2 + 15, {
        s: 44, w: 600, al: 'center', c: C.orange, tr: 3
      });

      // 橙色填充 + 白色文字，一起裁在已填充矩形内
      if (pB > 0) {
        ctx.save();
        D.rr(ctx, bx, by, bw, bh, bh / 2); ctx.clip();
        ctx.beginPath(); ctx.rect(bx, by, bw * pB, bh); ctx.clip();
        ctx.fillStyle = C.orange; ctx.fillRect(bx, by, bw, bh);
        D.text(ctx, 'dydata.cc', cx, by + bh / 2 + 15, {
          s: 44, w: 600, al: 'center', c: C.white, tr: 3
        });
        ctx.restore();
      }
      ctx.restore();
    }

    D.vignette(ctx, W, H);
    D.fade(ctx, W, H, t, DUR, 0.22, 0.5);
  }
};
