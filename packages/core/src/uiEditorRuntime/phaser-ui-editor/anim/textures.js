/**
 * anim/textures — UI 파티클 fx 텍스처 (절차적 캔버스, 키 캐시).
 *   작은 크기(≤32px)라 iOS 디코드/다운스케일 안전. 흰색 베이스 → 파티클 tint로 색 입힘.
 *   spark(별)·dot/glow(소프트 점)·confetti(작은 사각)·coin(금화).
 */
export function ensureFxTexture(scene, name) {
  const key = '__fx_' + name;
  if (scene.textures.exists(key)) return key;
  const S = 32, c = S / 2;
  const tex = scene.textures.createCanvas(key, S, S);
  if (!tex) return null;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, S, S);

  if (name === 'dot' || name === 'glow') {
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c, c, c, 0, Math.PI * 2); ctx.fill();
  } else if (name === 'confetti') {
    ctx.fillStyle = '#ffffff';
    _roundRect(ctx, c - 6, c - 3.5, 12, 7, 2); ctx.fill();
  } else if (name === 'coin') {
    ctx.fillStyle = '#f6c945'; ctx.beginPath(); ctx.arc(c, c, c - 3, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#c06f06'; ctx.beginPath(); ctx.arc(c, c, c - 4, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fde08a'; ctx.beginPath(); ctx.arc(c - 3, c - 3, 3, 0, Math.PI * 2); ctx.fill();
  } else {                                   // spark — 4점 별 + 중심 글로
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(c, 2); ctx.lineTo(c + 3, c - 3); ctx.lineTo(S - 2, c); ctx.lineTo(c + 3, c + 3);
    ctx.lineTo(c, S - 2); ctx.lineTo(c - 3, c + 3); ctx.lineTo(2, c); ctx.lineTo(c - 3, c - 3);
    ctx.closePath(); ctx.fill();
    const g = ctx.createRadialGradient(c, c, 0, c, c, 8);
    g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c, c, 8, 0, Math.PI * 2); ctx.fill();
  }
  tex.refresh();
  return key;
}

function _roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
