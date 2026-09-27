// Scene 2 · 复盘 18-32s（14s）
// 8 列示意大表 + 播放量柱条生长；扫描光带走到异常行停住并描橙边；12 项指标 chip 淡入
window.SCENES = window.SCENES || [];
window.SCENES[2] = {
  durationMs: 14000,
  draw: function (ctx, W, H, t) {
    var D = window.DY, C = D.C, DUR = 14;
    D.bg(ctx, W, H);

    D.sectionTitle(ctx, 120, '视频复盘', '9月20日 - 9月24日 · 3 个账号 · 示意数据', t, 0.0);

    // ---- 几何：列宽合计必须等于表宽 ----
    var TX = 120, TW = 1680;
    var cols = ['账号', '发布日期', '播放量', '完播率', '点赞', '评论', '涨粉', '状态'];
    var cw = [160, 170, 480, 150, 170, 140, 160, 250];   // = 1680
    var RIGHT = [0, 0, 1, 1, 1, 1, 1, 0];                 // 数字列右对齐
    var rows = [
      ['账号A', '09-20', 86200, '38%', '3,120', '214', '+612', '正常'],
      ['账号B', '09-21', 312400, '52%', '14,880', '1,032', '+2,905', '爆款'],
      ['账号C', '09-21', 41800, '21%', '980', '66', '+108', '正常'],
      ['账号A', '09-22', 9600, '9%', '212', '18', '+12', '下滑'],
      ['账号B', '09-23', 127500, '41%', '5,430', '388', '+1,014', '正常'],
      ['账号C', '09-24', 73300, '33%', '2,410', '175', '+430', '正常']
    ];
    var MAXV = 312400, BAD = 3, BARMAX = 310;
    var TY = 258, HH = 58, RH = 70;
    var colX = [], acc = TX;
    for (var c = 0; c < 8; c++) { colX.push(acc); acc += cw[c]; }
    function cellX(c) { return RIGHT[c] ? colX[c] + cw[c] - 22 : colX[c] + 22; }

    var pT = D.outCubic(D.prog(t, 0.1, 0.7));
    ctx.save();
    ctx.globalAlpha = pT;
    ctx.translate(0, (1 - pT) * 18);

    // 表头
    ctx.save(); ctx.fillStyle = C.surface;
    D.rr(ctx, TX, TY, TW, HH, 10); ctx.fill(); ctx.restore();
    for (c = 0; c < 8; c++) {
      D.text(ctx, cols[c], cellX(c), TY + HH / 2 + 10, {
        s: 27, w: 600, c: C.mute, tr: 0.6, al: RIGHT[c] ? 'right' : 'left'
      });
    }

    // 扫描光带：3.0→5.2s 从第 1 行滑到异常行后停住（画在行文字之前）
    var scanA = Math.min(D.prog(t, 3.2, 0.4), 1 - D.prog(t, 5.7, 0.5));
    if (scanA > 0) {
      var scanRow = D.inOut(D.prog(t, 3.2, 2.4)) * BAD;
      ctx.save(); ctx.globalAlpha = pT * scanA * 0.9;
      ctx.fillStyle = C.orangeFaint;
      D.rr(ctx, TX, TY + HH + scanRow * RH, TW, RH, 8); ctx.fill();
      ctx.restore();
    }

    // 异常行底色：必须在行文字之前画，否则会把整行盖没
    var hlA = D.prog(t, 5.7, 0.4);
    var hlY = TY + HH + BAD * RH;
    if (hlA > 0) {
      ctx.save(); ctx.globalAlpha = pT * hlA;
      ctx.fillStyle = C.orangeFaint;
      D.rr(ctx, TX, hlY, TW, RH, 8); ctx.fill();
      ctx.restore();
    }

    // 数据行
    for (var r = 0; r < rows.length; r++) {
      var y = TY + HH + r * RH;
      var ra = D.prog(t, 0.85 + r * 0.13, 0.45);
      ctx.save(); ctx.globalAlpha = pT * ra;

      D.hline(ctx, TX, y + RH - 1, TW, C.lineSoft);

      for (c = 0; c < 8; c++) {
        var v = rows[r][c];
        if (c === 2) {
          var bp = D.outCubic(D.prog(t, 1.5 + r * 0.16, 1.5));
          var bw = (v / MAXV) * BARMAX * bp;
          ctx.save();
          ctx.fillStyle = (r === 1) ? C.orange : C.orangeSoft;
          D.rr(ctx, colX[c] + 22, y + RH / 2 - 13, Math.max(bw, 2), 26, 6); ctx.fill();
          ctx.restore();
          D.text(ctx, D.countUp(v, bp), cellX(c), y + RH / 2 + 11, {
            s: 29, w: 500, c: C.ink2, al: 'right'
          });
        } else if (c === 7) {
          var sc = v === '爆款' ? C.up : (v === '下滑' ? C.down : C.muteSoft);
          D.text(ctx, v, cellX(c), y + RH / 2 + 11, { s: 29, w: 600, c: sc });
        } else {
          D.text(ctx, v, cellX(c), y + RH / 2 + 11, {
            s: 29, w: c === 0 ? 500 : 400,
            c: c === 6 ? C.up : C.ink2, al: RIGHT[c] ? 'right' : 'left'
          });
        }
      }
      ctx.restore();
    }
    ctx.restore();

    // ---- 异常行描边 + 左缘标记 + 徽标（画在文字之上，只描边不填色）----
    if (hlA > 0) {
      ctx.save(); ctx.globalAlpha = hlA;
      ctx.strokeStyle = C.orange; ctx.lineWidth = 2.5;
      D.rr(ctx, TX, hlY, TW, RH, 8); ctx.stroke();
      ctx.fillStyle = C.orange;
      D.rr(ctx, TX - 7, hlY + 10, 5, RH - 20, 2.5); ctx.fill();
      ctx.restore();

      var hp = D.outBack(D.prog(t, 5.7, 0.55));
      var bw2 = 116, bh2 = 42;
      ctx.save();
      ctx.globalAlpha = hlA;
      ctx.translate(colX[7] + 112 + bw2 / 2, hlY + RH / 2);
      ctx.scale(hp, hp);
      ctx.fillStyle = C.orange;
      D.rr(ctx, -bw2 / 2, -bh2 / 2, bw2, bh2, bh2 / 2); ctx.fill();
      D.text(ctx, '异常', 0, 10, { s: 26, w: 600, c: C.white, al: 'center' });
      ctx.restore();
    }

    // ---- 12 项指标：整幅面板承托，白色 chip 落在灰面上 ----
    var PX = 120, PY = 760, PW = 1680, PH = 172;
    var pPanel = D.prog(t, 7.2, 0.5);
    if (pPanel > 0) {
      ctx.save(); ctx.globalAlpha = pPanel;
      ctx.fillStyle = C.surface;
      D.rr(ctx, PX, PY, PW, PH, 16); ctx.fill();
      ctx.restore();
      D.text(ctx, '12 项指标逐条对齐', PX + 32, PY + 42, {
        s: 27, w: 600, c: C.ink2, a: pPanel, tr: 0.6
      });
      D.text(ctx, '同一套口径，账号之间可横向对比', PX + PW - 32, PY + 42, {
        s: 26, w: 400, c: C.mute, al: 'right', a: pPanel
      });
    }

    var chips = ['播放量', '完播率', '5秒完播率', '点赞率', '评论率', '分享率',
      '收藏率', '涨粉数', '主页访问', '平均时长', '互动率', '粉丝转化'];
    var copt = { s: 30, w: 500 };
    var laid = [], cursor = [PX + 32, PX + 32];
    for (var i = 0; i < 12; i++) {
      var rw = i < 6 ? 0 : 1;
      var w2 = D.measure(ctx, chips[i], copt) + 60;
      laid.push({ x: cursor[rw], w: w2, row: rw });
      cursor[rw] += w2 + 20;
    }
    var chipY = [PY + 58, PY + 114], chipH = 50;
    for (i = 0; i < 12; i++) {
      var ca = D.prog(t, 7.8 + i * 0.22, 0.45);
      if (ca <= 0) continue;
      var cp = 0.9 + 0.1 * D.outBack(ca), L = laid[i], cy = chipY[L.row];
      ctx.save();
      ctx.globalAlpha = ca;
      ctx.translate(L.x + L.w / 2, cy + chipH / 2);
      ctx.scale(cp, cp);
      D.chip(ctx, -L.w / 2, -chipH / 2, L.w, chipH, { fill: C.white, stroke: C.line });
      D.text(ctx, chips[i], 0, 11, { s: copt.s, w: copt.w, c: C.ink2, al: 'center' });
      ctx.restore();
    }

    D.vignette(ctx, W, H);
    D.caption(ctx, W, H, '哪条爆了，哪条掉了，一眼看清', t, DUR);
    D.fade(ctx, W, H, t, DUR);
  }
};
