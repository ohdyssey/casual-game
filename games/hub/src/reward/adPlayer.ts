/**
 * reward/adPlayer — 모의 리워드 광고 플레이어(Phase A).
 *
 * '광고를 실제로 끝까지 봐야 보상이 나온다'는 시청 게이트를 재현한다:
 *   전면 오버레이 + 카운트다운 + 진행바 → 완료 후에만 [보상 받기] 활성화 → onComplete.
 * 스킵 버튼은 없다(리워드 광고 관례). 실서비스에선 이 파일 전체가 광고 SDK
 * (AdMob/Unity 등 전면 보상형 광고) 호출로 교체되는 자리다.
 */
import { AD_DURATION_S } from './data.js';

/** 가짜 크리에이티브 — 데모 광고 소재 순환. */
const CREATIVES = [
  { emoji: '🧃', bg: 'linear-gradient(135deg,#FF8A5C,#FF5A7E)', copy: '상큼하게 터지는 하루 — 데모 주스' },
  { emoji: '🚗', bg: 'linear-gradient(135deg,#4A6CFF,#7C5CFF)', copy: '질주 본능을 깨워라 — 데모 레이싱' },
  { emoji: '🍔', bg: 'linear-gradient(135deg,#FFB13D,#FF7A3D)', copy: '한 입에 행복 — 데모 버거' },
  { emoji: '🧴', bg: 'linear-gradient(135deg,#38C6A0,#2E9BFF)', copy: '피부가 마시는 수분 — 데모 코스메틱' },
] as const;

function injectAdStyles(): void {
  if (document.getElementById('rw-ad-styles')) return;
  const s = document.createElement('style');
  s.id = 'rw-ad-styles';
  s.textContent = `
    .rw-ad-layer{position:fixed;inset:0;z-index:1600;background:#0E1428;display:flex;flex-direction:column;
      color:#fff;font-family:'Do Hyeon',system-ui,sans-serif;animation:rw-ad-in .18s ease}
    @keyframes rw-ad-in{from{opacity:0}to{opacity:1}}
    .rw-ad-layer .ad-tag{position:absolute;top:calc(env(safe-area-inset-top,0px) + 14px);left:16px;
      background:rgba(255,255,255,.16);border-radius:999px;padding:6px 12px;font-size:12.5px;letter-spacing:.5px}
    .rw-ad-layer .ad-cre{flex:1;margin:64px 18px 16px;border-radius:24px;display:flex;flex-direction:column;
      align-items:center;justify-content:center;gap:10px;text-align:center;padding:20px}
    .rw-ad-layer .ad-cre .em{font-size:84px;animation:rw-ad-bob 1.6s ease-in-out infinite}
    @keyframes rw-ad-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
    .rw-ad-layer .ad-cre b{font-size:23px}
    .rw-ad-layer .ad-cre .sub{font-size:12.5px;opacity:.75}
    .rw-ad-layer .ad-foot{padding:0 18px calc(env(safe-area-inset-bottom,0px) + 18px)}
    .rw-ad-layer .ad-bar{height:6px;border-radius:999px;background:rgba(255,255,255,.15);overflow:hidden;margin-bottom:12px}
    .rw-ad-layer .ad-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#FFD24A,#FF8A5C)}
    .rw-ad-layer .ad-btn{width:100%;font-family:inherit;border:0;border-radius:16px;padding:16px;font-size:16px;
      background:#39415C;color:#9AA3B8;cursor:default}
    .rw-ad-layer .ad-btn.on{background:linear-gradient(135deg,#3B82F6,#2563EB);color:#fff;cursor:pointer}
  `;
  document.head.appendChild(s);
}

/**
 * 모의 광고 재생 — 카운트다운 종료 후 [보상 받기]를 눌러야 onComplete 호출.
 * 시청 도중엔 닫을 수 없다(보상형 광고 게이트).
 */
export function playAd(onComplete: () => void): void {
  injectAdStyles();
  document.querySelectorAll('.rw-ad-layer').forEach((el) => el.remove());
  const c = CREATIVES[Math.floor(Math.random() * CREATIVES.length)];

  const layer = document.createElement('div');
  layer.className = 'rw-ad-layer';
  layer.innerHTML =
    `<div class="ad-tag">AD · 데모 광고 ${AD_DURATION_S}초</div>` +
    `<div class="ad-cre" style="background:${c.bg}">` +
    `<span class="em">${c.emoji}</span><b>${c.copy}</b>` +
    `<span class="sub">실서비스에서는 광고 SDK 영상이 재생됩니다</span>` +
    `</div>` +
    `<div class="ad-foot"><div class="ad-bar"><i></i></div>` +
    `<button class="ad-btn" disabled>보상까지 ${AD_DURATION_S}초</button></div>`;
  document.body.appendChild(layer);

  const btn = layer.querySelector<HTMLButtonElement>('.ad-btn')!;
  const bar = layer.querySelector<HTMLElement>('.ad-bar i')!;
  requestAnimationFrame(() => {
    bar.style.transition = `width ${AD_DURATION_S}s linear`;
    bar.style.width = '100%';
  });

  let left = AD_DURATION_S;
  const iv = window.setInterval(() => {
    left -= 1;
    if (left > 0) {
      btn.textContent = `보상까지 ${left}초`;
      return;
    }
    window.clearInterval(iv);
    btn.disabled = false;
    btn.classList.add('on');
    btn.textContent = '✓ 시청 완료 — 보상 받기';
  }, 1000);

  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    layer.remove();
    onComplete();
  });
}
