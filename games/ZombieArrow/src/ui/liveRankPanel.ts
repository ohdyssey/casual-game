/**
 * liveRankPanel — 플레이 중 화면 왼쪽에 실시간 글로벌 랭킹(1~10위)을 띄우는 DOM 패널.
 *
 * 좀비를 잡아 점수가 오르면 update(board) 로 다시 그려, 내 행이 NPC 사다리를 타고
 * 등수를 올라간다(추월 시 잠깐 펄스). 행 = [순위·메달][국기][아이디][점수] — 국가명이 아니라 아이디.
 *
 * 정렬: 게임 디자인(720×designH)으로 authoring 한 stage 를 캔버스 박스에 transform:scale →
 * FIT 레터박스와 픽셀 정렬. 오버레이는 pointer-events:none 이라 조준 입력을 가리지 않는다.
 */
import type { RankRow } from '../logic/leaderboard.js';

const STYLE_ID = 'zalrp-style';

export interface LiveRankPanelOpts {
  canvas: HTMLCanvasElement;
  designW: number;
  designH: number;
}

export interface LiveRankPanel {
  update(board: RankRow[]): void;
  destroy(): void;
}

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const MEDAL: Record<number, string> = { 1: 'gold', 2: 'silver', 3: 'bronze' };

/** 패널에 표시할 최대 등수(1~N위). */
const MAX_ROWS = 5;

/** 스코프 CSS 1회 주입(디자인 px 기준 — stage 가 scale 로 맞춤). */
function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const css = `
  .zalrp-overlay{position:fixed;z-index:46;pointer-events:none;overflow:hidden;}
  .zalrp-stage{position:absolute;top:0;left:0;transform-origin:top left;
    font-family:"Do Hyeon","Jua",system-ui,sans-serif;color:#eef6ee;}
  .zalrp-panel{position:absolute;left:10px;top:158px;width:196px;
    padding:8px;border-radius:12px;
    background:linear-gradient(180deg, rgba(8,20,13,.6), rgba(6,14,9,.48));
    border:1px solid rgba(150,220,160,.18);box-shadow:0 6px 18px rgba(0,0,0,.4);}
  .zalrp-row{position:relative;height:37px;display:flex;align-items:center;gap:6px;
    padding:0 7px 0 3px;margin-bottom:5px;border-radius:8px;
    background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.06);}
  .zalrp-row:last-child{margin-bottom:0;}
  .zalrp-rank{width:21px;flex:none;text-align:center;font-size:15px;color:#e7f3e7;
    text-shadow:0 1px 3px rgba(0,0,0,.7);}
  .zalrp-rank.gold{color:#ffd23f;} .zalrp-rank.silver{color:#dfe7ee;} .zalrp-rank.bronze{color:#e6a065;}
  .zalrp-flag{width:25px;height:18px;flex:none;border-radius:3px;overflow:hidden;background:#0b1a28;
    border:1px solid rgba(255,255,255,.25);}
  .zalrp-flag img{width:100%;height:100%;object-fit:cover;display:block;}
  .zalrp-id{flex:1;min-width:0;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
    text-shadow:0 1px 3px rgba(0,0,0,.6);}
  .zalrp-score{flex:none;font-size:14px;color:#f4f9f4;text-shadow:0 1px 3px rgba(0,0,0,.7);}
  .zalrp-row.first .zalrp-score{color:#ffd23f;}
  .zalrp-row.me{background:rgba(116,224,138,.16);border-color:#74e08a;
    box-shadow:0 0 12px rgba(116,224,138,.35);}
  .zalrp-row.me .zalrp-id{color:#dffce6;}
  .zalrp-row.me .zalrp-id small{font-size:11px;color:#08140b;background:#74e08a;padding:1px 6px;
    border-radius:999px;margin-left:5px;vertical-align:middle;font-family:"Jua",sans-serif;}
  .zalrp-row.pinned{margin-top:9px;}
  .zalrp-row.pinned::before{content:'⋯';position:absolute;top:-13px;left:0;right:0;text-align:center;
    font-size:13px;line-height:1;color:rgba(220,240,225,.5);}
  .zalrp-row.up{animation:zalrp-pulse .5s ease;}
  @keyframes zalrp-pulse{0%{transform:scale(1);box-shadow:0 0 0 rgba(116,224,138,0)}
    40%{transform:scale(1.05);box-shadow:0 0 18px rgba(116,224,138,.7)}
    100%{transform:scale(1);box-shadow:0 0 12px rgba(116,224,138,.35)}}
  `;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = css;
  document.head.appendChild(el);
}

function rowHtml(r: RankRow, pulse: boolean, pinned: boolean): string {
  const cls =
    `zalrp-row${r.rank === 1 ? ' first' : ''}${r.you ? ' me' : ''}${pulse ? ' up' : ''}${pinned ? ' pinned' : ''}`;
  const rankCls = MEDAL[r.rank] ? ` ${MEDAL[r.rank]}` : '';
  return (
    `<div class="${cls}">` +
    `<span class="zalrp-rank${rankCls}">${r.rank}</span>` +
    `<span class="zalrp-flag"><img src="flags/flag_${esc(r.iso3)}.svg" alt="${esc(r.iso3)}"></span>` +
    `<span class="zalrp-id">${esc(r.id)}${r.you ? ' <small>YOU</small>' : ''}</span>` +
    `<span class="zalrp-score">${r.score.toLocaleString('en-US')}</span>` +
    `</div>`
  );
}

/** 왼쪽 실시간 랭킹 패널을 마운트. update(board) 로 갱신, destroy() 로 정리. */
export function mountLiveRankPanel(opts: LiveRankPanelOpts): LiveRankPanel {
  ensureStyle();
  const { canvas, designW, designH } = opts;

  const overlay = document.createElement('div');
  overlay.className = 'zalrp-overlay';
  overlay.innerHTML =
    `<div class="zalrp-stage" style="width:${designW}px;height:${designH}px">` +
    `<div class="zalrp-panel"><div class="zalrp-list"></div></div>` +
    `</div>`;
  document.body.appendChild(overlay);

  const stage = overlay.querySelector<HTMLElement>('.zalrp-stage')!;
  const list = overlay.querySelector<HTMLElement>('.zalrp-list')!;

  const place = (): void => {
    const r = canvas.getBoundingClientRect();
    overlay.style.left = `${r.left}px`;
    overlay.style.top = `${r.top}px`;
    overlay.style.width = `${r.width}px`;
    overlay.style.height = `${r.height}px`;
    stage.style.transform = `scale(${r.width / designW})`;
  };
  place();
  window.addEventListener('resize', place);

  let prevMeRank = Infinity;

  const update = (board: RankRow[]): void => {
    const me = board.find((r) => r.you);
    const meRank = me?.rank ?? Infinity;
    const pulse = meRank < prevMeRank; // 등수가 올라갔으면(숫자↓) 펄스
    prevMeRank = meRank;

    // 기본은 1~5위. 내가 5위 밖이면 맨 아래에 내 행을 따로 붙여 항상 보이게 한다.
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

  return { update, destroy };
}
