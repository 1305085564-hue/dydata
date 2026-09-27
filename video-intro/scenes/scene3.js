// Scene 3 · 选题 + 协作 32-42s（10s）
// 左：选题卡滑入，「已认领」盖章落下；右：月度贡献柱状图长高
window.SCENES = window.SCENES || [];
window.SCENES[3] = {
  durationMs: 10000,
  draw: function (ctx, W, H, t) {
    var D = window.DY, C = D.C, DUR = 10;
    D.bg(ctx, W, H);

    D.sectionTitle(ctx, 120, '选题库', '本周 12 条 · 认领即归属 · 示意数据', t, 0.0);
    D.sectionTitle(ctx, 960, '协作月度统计', '9月 · 已发布视频条数', t, 0.12);

    // ============ 左：选题卡 ============
    var topics = [
      { s: '降息落地，哪些板块先受益', heat: 92, who: '小李' },
      { s: '年报季怎么看现金流', heat: 85, who: '小王' },
      { s: '新能源车价格战下半场', heat: 78, who: '小陈' }
    ];
    var cx0 = 120, cwid = 760, chgt = 152;
    for (var i = 0; i < 3; i++) {
      var cy = 290 + i * 172;
      var s0 = 0.3 + i * 1.9;
      var p = D.outCubic(D.prog(t, s0, 0.75));
      if (p <= 0) continue;
      var x = cx0 - (1 - p) * 420;

      ctx.save();
      ctx.globalAlpha = p;
      D.card(ctx, x, cy, cwid, chgt, { r: 18 });

      // 热度徽标
      D.chip(ctx, x + 32, cy + 28, 116, 40, { fill: C.orangeFaint });
      D.text(ctx, '热度 ' + topics[i].heat, x + 90, cy + 55, {
        s: 24, w: 600, c: C.orange, al: 'center'
      });
      D.text(ctx, '财经', x + 164, cy + 55, { s: 24, w: 400, c: C.muteSoft });

      D.text(ctx, topics[i].s, x + 32, cy + 112, { s: 37, w: 500, c: C.ink, tr: -0.4 });
      ctx.restore();

      // 盖章：带回弹的缩放 + 轻微旋转
      var sp = D.prog(t, s0 + 0.85, 0.4);
      if (sp > 0) {
        var eb = D.outBack(sp), sc = 1.55 - 0.55 * eb;
        ctx.save();
        ctx.globalAlpha = Math.min(sp * 2.2, 1);
        ctx.translate(x + cwid - 148, cy + 62);
        ctx.rotate(-0.19 + (1 - eb) * 0.14);
        ctx.scale(sc, sc);
        ctx.strokeStyle = C.orange; ctx.lineWidth = 3 / sc;
        D.rr(ctx, -80, -34, 160, 68, 10); ctx.stroke();
        D.text(ctx, '已认领', 0, 12, { s: 33, w: 700, c: C.orange, al: 'center', tr: 1 });
        ctx.restore();
        // 认领人
        D.text(ctx, topics[i].who, x + cwid - 148, cy + 124, {
          s: 25, w: 500, c: C.mute, al: 'center', a: D.prog(t, s0 + 1.1, 0.4)
        });
      }
    }

    // ============ 右：柱状图 ============
    var px0 = 1000, base = 800, top = 318, maxV = 30;
    var names = ['小王', '小李', '小陈', '小周', '小赵'];
    var vals = [18, 26, 14, 22, 11];
    var pitch = 148, barW = 92, inner = 1040;
    var pAxis = D.prog(t, 0.25, 0.6);

    // 网格线 + 刻度
    ctx.save(); ctx.globalAlpha = pAxis;
    for (var g = 0; g <= 3; g++) {
      var gv = g * 10, gyy = base - (gv / maxV) * (base - top);
      D.hline(ctx, px0, gyy, 790, g === 0 ? C.line : C.lineSoft);
      D.text(ctx, String(gv), px0 - 16, gyy + 9, { s: 24, w: 400, c: C.muteSoft, al: 'right' });
    }
    ctx.restore();

    for (var k = 0; k < 5; k++) {
      var bp = D.outCubic(D.prog(t, 0.6 + k * 0.5, 1.6));
      var hgt = (vals[k] / maxV) * (base - top) * bp;
      var bx = inner + k * pitch + (pitch - barW) / 2;
      var isTop = (k === 1);
      ctx.save();
      ctx.fillStyle = isTop ? C.orange : C.orangeSoft;
      D.rr(ctx, bx, base - hgt, barW, Math.max(hgt, 1), 8); ctx.fill();
      ctx.restore();
      D.text(ctx, String(Math.round(vals[k] * bp)), bx + barW / 2, base - hgt - 20, {
        s: 30, w: 600, c: isTop ? C.orange : C.ink2, al: 'center', a: bp
      });
      D.text(ctx, names[k], bx + barW / 2, base + 46, {
        s: 29, w: isTop ? 600 : 400, c: isTop ? C.ink : C.mute, al: 'center', a: pAxis
      });
    }

    // 榜首注脚
    var pn = D.prog(t, 6.3, 0.6);
    ctx.save(); ctx.globalAlpha = pn;
    D.chip(ctx, px0 + 4, base + 76, 268, 52, { fill: C.orangeFaint });
    ctx.restore();
    D.text(ctx, '本月榜首 · 小李 26 条', px0 + 30, base + 110, {
      s: 28, w: 600, c: C.orange, a: pn
    });

    D.vignette(ctx, W, H);
    D.caption(ctx, W, H, '好选题先认领，谁的贡献都算得清', t, DUR);
    D.fade(ctx, W, H, t, DUR);
  }
};
