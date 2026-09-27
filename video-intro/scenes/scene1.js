// Scene 1 · 报数 5-18s（13s）
// 左：示意表单，焦点环逐项走过、假数字滚动、提交盖勾
// 右：9月日历红点逐日点亮（2026-09-01 是周二），提交后第 27 天补上
window.SCENES = window.SCENES || [];
window.SCENES[1] = {
  durationMs: 13000,
  draw: function (ctx, W, H, t) {
    var D = window.DY, C = D.C, DUR = 13;
    D.bg(ctx, W, H);

    D.sectionTitle(ctx, 120, '每天报数', '员工端 · 3 分钟填完', t, 0.0);

    // ============ 左：表单卡 ============
    var fx = 120, fy = 288, fw = 780, fh = 620;
    var pCard = D.outCubic(D.prog(t, 0.1, 0.7));
    ctx.save();
    ctx.globalAlpha = pCard;
    ctx.translate(0, (1 - pCard) * 22);
    D.card(ctx, fx, fy, fw, fh, { r: 20 });

    D.text(ctx, '今日报数', fx + 40, fy + 66, { s: 40, w: 600, serif: true, tr: -0.5 });
    D.text(ctx, '账号A', fx + fw - 40, fy + 64, { s: 28, w: 500, c: C.mute, al: 'right' });
    D.hline(ctx, fx + 40, fy + 96, fw - 80);

    var rows = [
      { k: '日期', v: '2026-09-27', num: null },
      { k: '播放', v: 128460, num: true },
      { k: '涨粉', v: 1832, num: true },
      { k: '点赞', v: 9427, num: true }
    ];
    var rowY = fy + 128, rowH = 96, boxH = 72;
    for (var i = 0; i < 4; i++) {
      var y = rowY + i * rowH;
      var s0 = 1.2 + i * 1.7, s1 = s0 + 1.35;           // 该字段的填写窗口
      var act = D.clamp((t - s0) / (s1 - s0), 0, 1);      // 0..1 填写进度
      var done = t >= s1;
      var focus = D.env(t, s0 - 0.12, 0.18, (s1 - s0), 0.28);

      D.text(ctx, rows[i].k, fx + 40, y + boxH / 2 + 11, { s: 32, w: 400, c: C.mute });

      // 输入框
      ctx.save();
      ctx.fillStyle = focus > 0.05 ? C.white : C.surfaceSoft;
      D.rr(ctx, fx + 200, y, 440, boxH, 12); ctx.fill();
      ctx.strokeStyle = C.line; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.restore();

      // 焦点环
      if (focus > 0.01) {
        ctx.save(); ctx.globalAlpha = focus;
        ctx.strokeStyle = C.orange; ctx.lineWidth = 2.5;
        D.rr(ctx, fx + 199, y - 1, 442, boxH + 2, 13); ctx.stroke();
        ctx.restore();
      }

      // 值
      var shown;
      if (rows[i].num) shown = act > 0 ? D.countUp(rows[i].v, act) : '';
      else shown = act > 0 ? rows[i].v : '';
      if (shown) D.text(ctx, shown, fx + 226, y + boxH / 2 + 13, { s: 38, w: 500, c: C.ink2 });

      // 完成勾
      if (done) D.check(ctx, fx + 676, y + boxH / 2, 26, D.prog(t, s1, 0.32), C.down, 3.4);
    }

    // 提交按钮：橙色由左向右填充，完成后显示勾
    var by = fy + fh - 96, bh = 68, bx = fx + 40, bw = fw - 80;
    var pB = D.outCubic(D.prog(t, 8.25, 0.6)), doneB = t >= 8.85;
    ctx.save();
    D.rr(ctx, bx, by, bw, bh, 12); ctx.fillStyle = C.orangeFaint; ctx.fill();
    ctx.save(); D.rr(ctx, bx, by, bw, bh, 12); ctx.clip();
    ctx.fillStyle = C.orange; ctx.fillRect(bx, by, bw * Math.max(pB, 0.001), bh);
    ctx.restore();
    ctx.restore();
    var lbl = doneB ? '已提交' : '提交日报';
    var lw = D.measure(ctx, lbl, { s: 32, w: 600 });
    var lx = bx + bw / 2 + (doneB ? -14 : 0);
    D.text(ctx, lbl, lx, by + bh / 2 + 12, { s: 32, w: 600, c: pB > 0.55 ? C.white : C.orange, al: 'center' });
    if (doneB) D.check(ctx, lx + lw / 2 + 28, by + bh / 2, 22, D.prog(t, 8.9, 0.3), C.white, 3.4);
    ctx.restore();

    // ============ 右：日历 ============
    var calX = 980, cell = 116, gx = calX + 4;
    var pCal = D.outCubic(D.prog(t, 0.25, 0.7));
    ctx.save(); ctx.globalAlpha = pCal;

    D.text(ctx, '2026年9月', calX, 336, { s: 40, w: 600, serif: true, tr: -0.5 });

    var wk = ['一', '二', '三', '四', '五', '六', '日'];
    for (var k = 0; k < 7; k++) {
      D.text(ctx, wk[k], gx + k * cell + cell / 2, 390, {
        s: 28, w: 500, al: 'center', c: k >= 5 ? C.muteSoft : C.mute
      });
    }

    // 已点亮天数：1..26 在 1.8→6.9 之间逐个亮；第 27 天等提交完成（7.85）
    var litF = D.clamp((t - 2.0) / 6.0, 0, 1) * 26;
    var OFFSET = 1; // 9/1 是周二 → 列索引 1
    var gy = 412, ch = 88;
    for (var d = 1; d <= 30; d++) {
      var idx = (d - 1) + OFFSET, col = idx % 7, row = Math.floor(idx / 7);
      var x = gx + col * cell, y = gy + row * ch;
      var weekend = col >= 5;

      var pop = 0;
      if (d <= 26) pop = D.clamp(litF - (d - 1), 0, 1);
      else if (d === 27) pop = D.prog(t, 8.9, 0.45);

      ctx.save();
      ctx.fillStyle = weekend ? C.surfaceSoft : C.surface;
      D.rr(ctx, x + 5, y + 5, cell - 10, ch - 10, 12); ctx.fill();
      // 已报当天：整格浅红底，让"报齐了"成片读出来，而不是一地红点
      if (pop > 0) {
        ctx.globalAlpha = pop * 0.9;
        ctx.fillStyle = 'rgba(200,73,58,0.10)';
        D.rr(ctx, x + 5, y + 5, cell - 10, ch - 10, 12); ctx.fill();
      }
      ctx.restore();
      D.text(ctx, String(d), x + 20, y + 40, { s: 26, w: 400, c: d > 27 ? C.muteSoft : C.ink2 });

      if (pop > 0) {
        var sc = D.outBack(pop);
        ctx.save(); ctx.globalAlpha = pCal * Math.min(pop * 3, 1);
        ctx.fillStyle = C.up;
        ctx.beginPath(); ctx.arc(x + cell - 30, y + ch - 30, 9 * sc, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      // 今天描边
      if (d === 27) {
        ctx.save(); ctx.strokeStyle = C.orange; ctx.lineWidth = 2;
        ctx.globalAlpha = pCal * (0.35 + 0.65 * D.prog(t, 8.85, 0.4));
        D.rr(ctx, x + 5, y + 5, cell - 10, ch - 10, 12); ctx.stroke(); ctx.restore();
      }
    }

    // 汇总条
    var cnt = Math.floor(litF) + (t >= 8.9 ? 1 : 0);
    var sumY = gy + 5 * ch + 28;
    var pSum = D.prog(t, 2.4, 0.6);
    ctx.save(); ctx.globalAlpha = pCal * pSum;
    D.chip(ctx, calX, sumY, 300, 54, { fill: C.orangeFaint });
    ctx.restore();
    D.text(ctx, '本月已报 ' + cnt + ' 天', calX + 28, sumY + 36, {
      s: 30, w: 600, c: C.orange, a: pCal * pSum
    });
    D.text(ctx, '数据自动汇总，无需再手工统计', calX + 330, sumY + 36, {
      s: 28, w: 400, c: C.mute, a: pCal * D.prog(t, 2.9, 0.6)
    });
    ctx.restore();

    D.vignette(ctx, W, H);
    D.caption(ctx, W, H, '每天3分钟，报数自动汇总', t, DUR);
    D.fade(ctx, W, H, t, DUR);
  }
};
