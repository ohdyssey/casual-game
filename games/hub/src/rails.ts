/**
 * rails — 폰 프레임 좌우 캔디 아이콘 레일.
 *
 * 디렉션(2번 이미지): 좌우 아이콘은 하부 마케팅/리워드앱의 특정 기능을 플랫폼 '상부 카테고리'로
 *   끌어올린 UX 확장 아이콘이다.
 *     · 좌측 = 쇼핑·리워드   → 상점 / 이벤트 / 선물 / 리워드(광고보고 현금성 보상 앱테크)
 *     · 우측 = 랭크 & 리그   → 일일 랭킹 / 미션 랭킹 / 리그(주간) / 스핀
 * 아이콘 = public/rail/<name>.png (라운드 캔디 타일 배경 포함) — 버튼은 이미지+호버만 담당.
 * 클릭 → account 컨트롤러로 포털 모달을 연다(지갑/경제 단일 소스는 코어 liveops).
 */
import type { AccountController } from './account.js';
import { openShop, openSpin, openDaily, openEvent, openReward, openLeaderboard } from './modals.js';

interface RailItem {
  /** public/rail/<icon>.png */
  icon: string;
  /** 접근성 라벨 / 툴팁 */
  label: string;
  /** 클릭 시 열 포털 모달 */
  open: (ctrl: AccountController) => void;
}

/** 좌측 레일 — 쇼핑·리워드 카테고리. */
const LEFT: readonly RailItem[] = [
  { icon: 'shop', label: '상점', open: openShop },
  { icon: 'event', label: '이벤트', open: openEvent },
  { icon: 'gift', label: '선물', open: openDaily },
  { icon: 'reward', label: '리워드', open: openReward },
];

/** 우측 레일 — 랭크 & 리그 카테고리. */
const RIGHT: readonly RailItem[] = [
  { icon: 'rank', label: '일일 랭킹', open: (c) => openLeaderboard(c, 'daily') },
  { icon: 'mission', label: '미션 랭킹', open: (c) => openLeaderboard(c, 'mission') },
  { icon: 'league', label: '리그(주간)', open: (c) => openLeaderboard(c, 'weekly') },
  { icon: 'spin', label: '스핀', open: openSpin },
];

function railButton(item: RailItem, ctrl: AccountController): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'rail-btn';
  btn.type = 'button';
  btn.title = item.label;
  btn.setAttribute('aria-label', item.label);
  btn.innerHTML = `<img src="rail/${item.icon}.png" alt="${item.label}" />`;
  btn.addEventListener('click', () => item.open(ctrl));
  return btn;
}

/** 좌우 레일 마운트. ctrl = 계정 컨트롤러(모달이 지갑/경제를 읽고 갱신). */
export function mountRails(leftEl: HTMLElement, rightEl: HTMLElement, ctrl: AccountController): void {
  leftEl.innerHTML = '';
  rightEl.innerHTML = '';
  for (const it of LEFT) leftEl.appendChild(railButton(it, ctrl));
  for (const it of RIGHT) rightEl.appendChild(railButton(it, ctrl));
}
