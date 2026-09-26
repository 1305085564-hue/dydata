// 占位场景0：Claude 一句话运行时会被覆盖为正式版
window.SCENES = window.SCENES || [];
window.SCENES[0] = {
  durationMs: 5000,
  draw: function(ctx, W, H, t) {
    ctx.fillStyle = '#FCFCFB';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#141413';
    ctx.font = '120px serif';
    ctx.textAlign = 'center';
    ctx.fillText('DYData', W / 2, H / 2);
    // 橙色细线生长动画
    var p = Math.min(t / 2, 1);
    ctx.fillStyle = '#D97757';
    ctx.fillRect(W / 2 - 300 * p, H / 2 + 60, 600 * p, 6);
    ctx.fillStyle = '#78716C';
    ctx.font = '42px sans-serif';
    ctx.fillText('smoke test ' + t.toFixed(2) + 's', W / 2, H / 2 + 160);
  }
};
