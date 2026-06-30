/**
 * rewardEditor.ts — **보상 데이터 편집** DOM 오버레이(설정 → 데이터 편집에서 열림).
 *
 *   슬롯/미션/레이드 보상 값을 상세 편집 → econOverrides(localStorage)에 저장 → 라이브 게임이 즉시 반영(다음 라운드/스테이지).
 *   캔버스 위 고정 div(폼은 DOM 이 적합). Phaser-free. 저장/기본값복원/닫기.
 */
import { ROULETTE_SEGMENTS } from '../logic/roulette.js';
import { missionsNow } from '../logic/econOverrides.js';
import {
  currentValues,
  saveOverrides,
  resetOverrides,
  type EconOverrides,
  type MissionOverride,
} from '../logic/econOverrides.js';

const OVERLAY_ID = 'sc-reward-editor';
const LUCK_LABELS = ['메가(초대박)', '잭팟급', '대박', '큰 한 방', '중간 부스트'];

function num(input: HTMLInputElement, fallback: number): number {
  const v = parseFloat(input.value);
  return Number.isFinite(v) ? v : fallback;
}

/** 라벨 + 숫자 입력 1행 → input 반환. */
function field(parent: HTMLElement, label: string, value: number, step: number, hint?: string): HTMLInputElement {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:10px;margin:6px 0;';
  const lab = document.createElement('label');
  lab.textContent = label;
  lab.style.cssText = 'flex:1;font-size:14px;color:#cfd8e6;';
  const inp = document.createElement('input');
  inp.type = 'number';
  inp.step = String(step);
  inp.value = String(value);
  inp.style.cssText = 'width:130px;padding:6px 8px;border-radius:6px;border:1px solid #3a4a63;background:#0f1726;color:#e8eefc;font-size:14px;text-align:right;';
  row.appendChild(lab);
  row.appendChild(inp);
  if (hint) {
    const h = document.createElement('span');
    h.textContent = hint;
    h.style.cssText = 'font-size:11px;color:#7e8aa0;width:160px;';
    row.appendChild(h);
  }
  parent.appendChild(row);
  return inp;
}

function section(parent: HTMLElement, title: string, desc: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'margin:14px 0;padding:14px;border:1px solid #2a3650;border-radius:10px;background:#162033;';
  const h = document.createElement('div');
  h.textContent = title;
  h.style.cssText = 'font-size:17px;font-weight:700;color:#9fd0ff;margin-bottom:2px;';
  const d = document.createElement('div');
  d.textContent = desc;
  d.style.cssText = 'font-size:12px;color:#7e8aa0;margin-bottom:10px;';
  wrap.appendChild(h);
  wrap.appendChild(d);
  parent.appendChild(wrap);
  return wrap;
}

/** 보상 데이터 편집 오버레이를 연다. onSaved: 저장/복원 후(호스트가 HUD·미션 재동기화). */
export function openRewardEditor(onSaved?: () => void): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(OVERLAY_ID)) return; // 중복 방지

  const cur = currentValues();
  const missionKinds = missionsNow().map((m) => m.reward.kind);

  const root = document.createElement('div');
  root.id = OVERLAY_ID;
  root.style.cssText =
    'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.72);display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;';

  const panel = document.createElement('div');
  panel.style.cssText =
    'width:min(560px,94vw);max-height:90vh;overflow:auto;background:#0c1320;border:1px solid #2a3650;border-radius:14px;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,0.6);';
  root.appendChild(panel);

  const title = document.createElement('div');
  title.textContent = '⚙ 보상 데이터 편집';
  title.style.cssText = 'font-size:22px;font-weight:800;color:#ffd34d;margin-bottom:4px;';
  panel.appendChild(title);
  const sub = document.createElement('div');
  sub.textContent = '값을 바꾸고 저장하면 라이브 게임에 즉시 반영됩니다(비율·구조 외 표시 라벨은 디자이너 SSOT).';
  sub.style.cssText = 'font-size:12px;color:#7e8aa0;margin-bottom:8px;';
  panel.appendChild(sub);

  // ── 슬롯 보상 ──
  const slotSec = section(panel, '🎰 슬롯 보상', '배당 스케일이 클수록 슬롯 코인↑. 럭 배수 = 고변동 대박 크기.');
  const slotScaleInp = field(slotSec, '슬롯 배당 스케일', cur.slotRtpScale, 0.01, '기본 0.18');
  const luckInps = cur.luckMults.map((m, i) => field(slotSec, `럭 배수 — ${LUCK_LABELS[i] ?? `#${i}`}`, m, 0.5));

  // ── 미션 보상 ──
  const missionSec = section(panel, '🎯 미션 보상', '목표(수집 젬×베팅)와 완료 보상. 종류(스핀/코인)는 교대 고정.');
  const missionInps = cur.missions.map((m: MissionOverride, i) => {
    const kind = missionKinds[i] === 'coins' ? '코인' : '스핀';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'border-top:1px dashed #2a3650;padding-top:6px;margin-top:6px;';
    const head = document.createElement('div');
    head.textContent = `미션 ${i + 1} · 보상=${kind}`;
    head.style.cssText = 'font-size:13px;color:#cfd8e6;font-weight:600;';
    wrap.appendChild(head);
    missionSec.appendChild(wrap);
    const t = field(wrap, '목표(난이도)', m.target, 10);
    const a = field(wrap, `보상 ${kind} 양`, m.rewardAmount, kind === '코인' ? 10_000 : 10);
    return { t, a };
  });

  // ── 레이드/어텍 보상 ──
  const raidSec = section(panel, '⚔ 레이드/어텍 보상', '스테이크 배수 × 룰렛 조각 배수 = 당첨금(stake = 코인베팅 × 레벨배수 × 스테이크배수).');
  const raidScaleInp = field(raidSec, '레이드 스테이크 배수', cur.raidStakeScale, 0.1, '기본 1.3');
  const segInps = cur.segmentMults.map((m, i) =>
    field(raidSec, `룰렛 — ${ROULETTE_SEGMENTS[i]?.label ?? `#${i}`}`, m, 1),
  );

  // ── 버튼 ──
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:10px;margin-top:16px;position:sticky;bottom:0;background:#0c1320;padding-top:8px;';
  panel.appendChild(btnRow);
  const mkBtn = (text: string, bg: string, fn: () => void): void => {
    const b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = `flex:1;padding:12px;border:none;border-radius:8px;background:${bg};color:#fff;font-size:15px;font-weight:700;cursor:pointer;`;
    b.onclick = fn;
    btnRow.appendChild(b);
  };

  const close = (): void => root.remove();

  mkBtn('💾 저장 (적용)', '#2e7d6b', () => {
    const overrides: EconOverrides = {
      slotRtpScale: num(slotScaleInp, cur.slotRtpScale),
      luckMults: luckInps.map((inp, i) => num(inp, cur.luckMults[i])),
      raidStakeScale: num(raidScaleInp, cur.raidStakeScale),
      segmentMults: segInps.map((inp, i) => num(inp, cur.segmentMults[i])),
      missions: missionInps.map((mi, i) => ({
        target: Math.round(num(mi.t, cur.missions[i].target)),
        rewardAmount: Math.round(num(mi.a, cur.missions[i].rewardAmount)),
      })),
    };
    saveOverrides(overrides);
    onSaved?.();
    close();
  });
  mkBtn('↩ 기본값 복원', '#8a5a2e', () => {
    resetOverrides();
    onSaved?.();
    close();
  });
  mkBtn('닫기', '#3a4a63', close);

  // 배경 클릭으로 닫기(패널 클릭은 무시).
  root.addEventListener('pointerdown', (e) => {
    if (e.target === root) close();
  });

  document.body.appendChild(root);
}

// DEV: 헤드리스/콘솔에서 직접 열기(Phaser 캔버스는 합성 포인터 무반응이라 메뉴 클릭 불가).
if (import.meta.env?.DEV) (globalThis as Record<string, unknown>).__openRewardEditor = openRewardEditor;
