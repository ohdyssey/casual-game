/**
 * liveRankPanel — 플레이 중 화면 왼쪽에 실시간 글로벌 랭킹(1~10위)을 띄우는 DOM 패널.
 *
 * 화살을 맞혀 점수가 오르면 update(board) 로 다시 그려, 내 행이 NPC 사다리를 타고 등수를
 * 올라간다(추월 시 잠깐 펄스). 행 = [순위·메달][국기][아이디][점수] — 국가명이 아니라 아이디.
 *
 * 정렬: 게임 디자인(720×designH)으로 authoring 한 stage 를 캔버스 박스에 transform:scale →
 * FIT 레터박스와 픽셀 정렬. 오버레이는 pointer-events:none 이라 조준(드래그) 입력을 가리지 않는다.
 *
 * (ZombieArrow liveRankPanel 과 설계 공유 — 표시 등수 1~10위, 양궁 네이비/골드 테마.)
 */
import type { RankRow } from '../logic/leaderboard.js';

const STYLE_ID = 'arklrp-style';

export interface LiveRankPanelOpts {
  canvas: HTMLCanvasElement;
  designW: number;
  designH: number;
}

export interface LiveRankPanel {
  update(board: RankRow[]): void;
  /** 캔버스 크기/위치 변화에 맞춰 오버레이를 재배치(반응형). 씬이 캔버스를 리사이즈한 직후 호출. */
  reposition(): void;
  destroy(): void;
}

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const MEDAL: Record<number, string> = { 1: 'gold', 2: 'silver', 3: 'bronze' };

/** 패널에 표시할 최대 등수(1~N위). 양궁은 1~10위 전체 노출. */
const MAX_ROWS = 10;

/** 스코프 CSS 1회 주입(디자인 px 기준 — stage 가 scale 로 맞춤). */
function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const css = `
  .arklrp-overlay{position:fixed;z-index:46;pointer-events:none;overflow:hidden;}
  .arklrp-stage{position:absolute;top:0;left:0;transform-origin:top left;
    font-family:"Do Hyeon","Jua",system-ui,sans-serif;color:#eaf4ff;}
  /* HD 1080 디자인 기준 — 라운드 배지(하단 y≈167) 아래로 패딩을 두고(top:210) 적절히 크게. */
  .arklrp-panel{position:absolute;left:16px;top:210px;width:300px;
    padding:11px;border-radius:16px;
    background:linear-gradient(180deg, rgba(8,22,44,.62), rgba(6,16,34,.5));
    border:1px solid rgba(120,180,255,.2);box-shadow:0 8px 22px rgba(0,0,0,.42);}
  .arklrp-title{font-family:"Do Hyeon",sans-serif;font-size:19px;letter-spacing:.5px;
    color:#bfe0ff;text-align:center;margin:1px 0 9px;text-shadow:0 1px 3px rgba(0,0,0,.6);}
  .arklrp-row{position:relative;height:46px;display:flex;align-items:center;gap:9px;
    padding:0 11px 0 5px;margin-bottom:6px;border-radius:11px;
    background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.06);}
  .arklrp-row:last-child{margin-bottom:0;}
  .arklrp-rank{width:28px;flex:none;text-align:center;font-size:19px;color:#dbe9fb;
    text-shadow:0 1px 3px rgba(0,0,0,.7);}
  .arklrp-rank.gold{color:#ffd23f;} .arklrp-rank.silver{color:#dfe7ee;} .arklrp-rank.bronze{color:#e6a065;}
  .arklrp-flag{width:34px;height:24px;flex:none;border-radius:4px;overflow:hidden;background:#0b1a28;
    border:1px solid rgba(255,255,255,.25);}
  .arklrp-flag img{width:100%;height:100%;object-fit:cover;display:block;}
  .arklrp-id{flex:1;min-width:0;font-size:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
    text-shadow:0 1px 3px rgba(0,0,0,.6);}
  .arklrp-score{flex:none;font-size:18px;color:#f3f8ff;text-shadow:0 1px 3px rgba(0,0,0,.7);}
  .arklrp-row.first .arklrp-score{color:#ffd23f;}
  .arklrp-row.me{background:rgba(53,167,255,.18);border-color:#35a7ff;
    box-shadow:0 0 14px rgba(53,167,255,.4);}
  .arklrp-row.me .arklrp-id{color:#e4f1ff;}
  .arklrp-row.me .arklrp-id small{font-size:13px;color:#06203b;background:#35a7ff;padding:2px 8px;
    border-radius:999px;margin-left:6px;vertical-align:middle;font-family:"Jua",sans-serif;}
  .arklrp-row.pinned{margin-top:12px;}
  .arklrp-row.pinned::before{content:'⋯';position:absolute;top:-16px;left:0;right:0;text-align:center;
    font-size:17px;line-height:1;color:rgba(200,222,245,.5);}
  .arklrp-row.up{animation:arklrp-pulse .5s ease;}
  @keyframes arklrp-pulse{0%{transform:scale(1);box-shadow:0 0 0 rgba(53,167,255,0)}
    40%{transform:scale(1.05);box-shadow:0 0 18px rgba(53,167,255,.75)}
    100%{transform:scale(1);box-shadow:0 0 12px rgba(53,167,255,.4)}}
  `;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = css;
  document.head.appendChild(el);
}

function rowHtml(r: RankRow, pulse: boolean, pinned: boolean): string {
  const cls =
    `arklrp-row${r.rank === 1 ? ' first' : ''}${r.you ? ' me' : ''}${pulse ? ' up' : ''}${pinned ? ' pinned' : ''}`;
  const rankCls = MEDAL[r.rank] ? ` ${MEDAL[r.rank]}` : '';
  return (
    `<div class="${cls}">` +
    `<span class="arklrp-rank${rankCls}">${r.rank}</span>` +
    `<span class="arklrp-flag"><img src="flags/flag_${esc(r.iso3)}.svg" alt="${esc(r.iso3)}"></span>` +
    `<span class="arklrp-id">${esc(r.id)}${r.you ? ' <small>YOU</small>' : ''}</span>` +
    `<span class="arklrp-score">${r.score.toLocaleString('en-US')}</span>` +
    `</div>`
  );
}

/** 왼쪽 실시간 랭킹 패널을 마운트. update(board) 로 갱신, destroy() 로 정리. */
export function mountLiveRankPanel(opts: LiveRankPanelOpts): LiveRankPanel {
  ensureStyle();
  const { canvas, designW, designH } = opts;

  const overlay = document.createElement('div');
  overlay.className = 'arklrp-overlay';
  overlay.innerHTML =
    `<div class="arklrp-stage" style="width:${designW}px;height:${designH}px">` +
    `<div class="arklrp-panel"><div class="arklrp-title">글로벌 랭킹</div><div class="arklrp-list"></div></div>` +
    `</div>`;
  document.body.appendChild(overlay);

  const stage = overlay.querySelector<HTMLElement>('.arklrp-stage')!;
  const list = overlay.querySelector<HTMLElement>('.arklrp-list')!;

  // 캔버스 박스에 오버레이를 정확히 겹치고, 폭 기준으로 stage 를 scale.
  // stage 높이는 현재 캔버스 비율로 매번 재계산 → 화면이 길어/짧아져도(플립폰·주소창) 그대로 추종.
  const place = (): void => {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return; // 레이아웃 미확정 프레임 방어
    overlay.style.left = `${r.left}px`;
    overlay.style.top = `${r.top}px`;
    overlay.style.width = `${r.width}px`;
    overlay.style.height = `${r.height}px`;
    const scale = r.width / designW;
    stage.style.transform = `scale(${scale})`;
    stage.style.height = `${r.height / scale}px`; // = 현재 캔버스 디자인 높이(720 폭 기준)
  };
  place();
  window.addEventListener('resize', place);

  let prevMeRank = Infinity;

  const update = (board: RankRow[]): void => {
    const me = board.find((r) => r.you);
    const meRank = me?.rank ?? Infinity;
    const pulse = meRank < prevMeRank; // 등수가 올라갔으면(숫자↓) 펄스
    prevMeRank = meRank;

    // 기본은 1~10위. 9 NPC + 나 = 10명이라 나는 항상 보드에 들지만, 혹시 밖이면 맨 아래에 따로 붙인다.
    const rows = board.slice(0, MAX_ROWS).map((r) => rowHtml(r, pulse && r.you, false));
    if (me && meRank > MAX_ROWS) rows.push(rowHtml(me, pulse, true));
    list.innerHTML = rows.join('');
  };

  let done = false;
  const destroy = (): void => {
    if (done) return;
    done = true;
    window.removeEventListener('resize', place);
    overlay.remove();
  };

  return { update, reposition: place, destroy };
}
