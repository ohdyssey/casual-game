/**
 * settingsMenu.ts — **헤더 메뉴(햄버거) → 메뉴 허브 팝업**(요청 2026-06-28: 프로필~설정 7개 메뉴로 재설계).
 *
 * 단일 카드 팝업 안에서 **허브 ↔ 상세** 라우팅(상세는 ← 뒤로로 허브 복귀, 우상단 X로 닫기). 7개 메뉴:
 *   1 프로필 · 2 설정(음악/효과음/알림) · 3 게임 방법 · 4 랭킹 · 5 상점 · 6 데이터 편집 · 7 정보.
 *   푸터: 홈으로(onHome 제공 시) · 닫기. 씬 메서드가 아닌 공용 함수라 로비·게임·호텔 어디서나 동일.
 *
 * 좌표는 디자인 공간(1080×2400) — 중앙 카드. depth 는 상점(9500)·확인(9700) 위(기본 9800).
 */
import Phaser from 'phaser';
import { DESIGN_W, DESIGN_H } from '../scenes/PlayScene.js';
import { isMusicEnabled, isSfxEnabled, setMusicEnabled, setSfxEnabled } from '../audio.js';
import { loadSpins, setSpins } from '../logic/playerState.js';
import { loadCoins, saveCoins } from '../logic/wallet.js';
import { loadGems, saveGems } from '../logic/gems.js';
import { loadProfile, setNickname } from '../logic/profile.js';
import { createHotelState, deserializeHotel, totalLevel, HOTEL_SAVE_KEY } from '../logic/hotelUpgrade.js';
import { openRewardEditor } from './rewardEditor.js';

const TITLE_FONT = '"Russo One", "Jua", sans-serif';
const KR_FONT = '"Do Hyeon", "Jua", sans-serif';

const CARD_W = 920;
const CARD_H = 1560;

// 알림 설정(현재 푸시 미연동 — 영속 플래그만, 추후 연결).
const NOTIF_KEY = 'socialcasino_notif_on_v1';
const getNotif = (): boolean => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(NOTIF_KEY) !== '0' : true;
  } catch {
    return true;
  }
};
const setNotif = (on: boolean): void => {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(NOTIF_KEY, on ? '1' : '0');
  } catch {
    /* 무시 */
  }
};

export interface SettingsMenuOpts {
  /** "홈으로/로비로" 동작(없으면 그 버튼 숨김 — 로비처럼 이미 홈인 화면). */
  onHome?: () => void;
  /** 홈 버튼 라벨(기본 '홈으로'). */
  homeLabel?: string;
  /** 데이터 편집 후 호출 — 호스트 씬이 헤더/HUD 를 영속값으로 재동기화. */
  onDataChanged?: () => void;
  /** ⭐시설(호텔) 업그레이드 리셋 후 호출 — 호텔 화면이면 스테이지1 로 씬 재시작. 없으면 onDataChanged 로 폴백. */
  onHotelReset?: () => void;
  /** ⭐전체 시뮬 리셋(스핀300·보상미션1·시설·텔레메트리) — 호스트가 전체 초기화+새로고침을 수행. 없으면 데이터 패널 버튼 숨김. */
  onSimReset?: () => void;
  /** 상점 열기(로비). 없으면 상세에서 "로비에서 이용" 안내. */
  onShop?: () => void;
  /** 메뉴 레이어 depth(기본 9800). */
  depth?: number;
  /** ⭐호스트가 제공하는 **테스트/디버그 버튼**(요청 2026-07-07: 메뉴 **제일 하단**). getOn 있으면 ON/OFF 토글 표시. */
  devButtons?: ReadonlyArray<{ label: string; color?: number; onTap: () => void; getOn?: () => boolean }>;
}

type SceneWithMenu = Phaser.Scene & { __settingsMenu?: Phaser.GameObjects.Container };

interface MenuItem {
  readonly key: string;
  readonly label: string;
  readonly color: number;
}
const ITEMS: readonly MenuItem[] = [
  { key: 'profile', label: '프로필', color: 0x4a7fb5 },
  { key: 'settings', label: '설정', color: 0x4f9a57 },
  { key: 'howto', label: '게임 방법', color: 0xb5894a },
  { key: 'ranking', label: '랭킹', color: 0xc08a3a },
  { key: 'shop', label: '상점', color: 0xb55a8f },
  { key: 'data', label: '데이터 편집', color: 0x4a6b8f },
  { key: 'about', label: '정보', color: 0x7a6b9a },
  // ⭐경제 콘솔 — 확률/데이터 로직 추적·조정·점검·기록 대시보드(팝업). 개발/디자인 전용(플레이어에 노출 안 함).
  ...(import.meta.env?.DEV ? [{ key: 'econ', label: '경제 콘솔 (DEV)', color: 0x2e7d6b } as MenuItem] : []),
];

/** 경제 콘솔(econ.html)을 별도 팝업창으로 — base './' 라 dev=/econ.html · 배포=/<game>/econ.html 로 해석. */
function openEconConsole(): void {
  try {
    window.open('econ.html', 'sc_econ_console', 'width=1340,height=920,resizable=yes,scrollbars=yes');
  } catch {
    /* 팝업 차단 등 무시 */
  }
}

// ── 공용 프리미티브 ─────────────────────────────────────────────────────────
function press(scene: Phaser.Scene, targets: Phaser.GameObjects.GameObject[]): void {
  scene.tweens.add({ targets, scaleX: 0.93, scaleY: 0.93, duration: 70, yoyo: true, ease: 'Quad.easeOut' });
}

function button(
  scene: Phaser.Scene,
  layer: Phaser.GameObjects.Container,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
  label: string,
  fontPx: number,
  onTap: () => void,
): void {
  const bg = scene.add.rectangle(x, y, w, h, color, 1).setStrokeStyle(4, 0xffffff, 0.85).setInteractive({ useHandCursor: true });
  const txt = scene.add
    .text(x, y, label, { fontFamily: TITLE_FONT, fontSize: `${fontPx}px`, color: '#ffffff', stroke: '#2a1640', strokeThickness: 3 })
    .setOrigin(0.5);
  bg.on('pointerdown', () => {
    press(scene, [bg, txt]);
    onTap();
  });
  layer.add(bg);
  layer.add(txt);
}

function label(scene: Phaser.Scene, layer: Phaser.GameObjects.Container, x: number, y: number, text: string, px: number, color: string, originX = 0): Phaser.GameObjects.Text {
  const t = scene.add.text(x, y, text, { fontFamily: KR_FONT, fontSize: `${px}px`, color }).setOrigin(originX, 0.5);
  layer.add(t);
  return t;
}

/** ON/OFF 토글 행. */
function toggleRow(scene: Phaser.Scene, layer: Phaser.GameObjects.Container, cx: number, y: number, name: string, getOn: () => boolean, setOn: (on: boolean) => void): void {
  label(scene, layer, cx - 310, y, name, 46, '#3a2456', 0);
  const px = cx + 230;
  const bg = scene.add.rectangle(px, y, 200, 88, 0x6b6b6b, 1).setStrokeStyle(4, 0xffffff, 0.8).setInteractive({ useHandCursor: true });
  const txt = scene.add.text(px, y, '', { fontFamily: TITLE_FONT, fontSize: '40px', color: '#ffffff' }).setOrigin(0.5);
  const render = (): void => {
    const on = getOn();
    bg.setFillStyle(on ? 0x49b148 : 0x6b6b6b, 1);
    txt.setText(on ? 'ON' : 'OFF');
  };
  bg.on('pointerdown', () => {
    press(scene, [bg, txt]);
    setOn(!getOn());
    render();
  });
  render();
  layer.add(bg);
  layer.add(txt);
}

function fmtStep(n: number): string {
  if (n >= 1_000_000) return `${n / 1_000_000}M`;
  if (n >= 1_000) return `${n / 1_000}K`;
  return String(n);
}

/** 데이터 편집 1행(스핀/골드/젬 ±스텝퍼). */
function editorRow(
  scene: Phaser.Scene,
  layer: Phaser.GameObjects.Container,
  cx: number,
  y: number,
  name: string,
  load: () => number,
  set: (n: number) => void,
  small: number,
  big: number,
  onChange: () => void,
): void {
  label(scene, layer, cx - 380, y - 52, name, 44, '#3a2456', 0);
  const valTxt = scene.add.text(cx + 380, y - 52, load().toLocaleString('en-US'), { fontFamily: TITLE_FONT, fontSize: '46px', color: '#1f7fa8' }).setOrigin(1, 0.5);
  layer.add(valTxt);
  const apply = (d: number): void => {
    set(load() + d);
    valTxt.setText(load().toLocaleString('en-US'));
    onChange();
  };
  const steps = [
    { d: -big, c: 0xc0463a, l: `−${fmtStep(big)}` },
    { d: -small, c: 0xd17a3a, l: `−${fmtStep(small)}` },
    { d: small, c: 0x49934a, l: `+${fmtStep(small)}` },
    { d: big, c: 0x49b148, l: `+${fmtStep(big)}` },
  ];
  const bw = 190;
  const gap = 14;
  let bx = cx - (steps.length * bw + (steps.length - 1) * gap) / 2 + bw / 2;
  for (const s of steps) {
    button(scene, layer, bx, y + 40, bw, 92, s.c, s.l, 34, () => apply(s.d));
    bx += bw + gap;
  }
}

function closeMenu(scene: SceneWithMenu): void {
  const layer = scene.__settingsMenu;
  if (!layer) return;
  scene.__settingsMenu = undefined;
  scene.tweens.add({ targets: layer, alpha: 0, duration: 120, ease: 'Quad.easeIn', onComplete: () => layer.destroy(true) });
}

/** 현재 호텔 총레벨(프로필 표기) — 저장 없으면 기본 상태. */
function hotelLevel(): number {
  try {
    const st = (typeof localStorage !== 'undefined' ? deserializeHotel(localStorage.getItem(HOTEL_SAVE_KEY)) : null) ?? createHotelState();
    return totalLevel(st);
  } catch {
    return 0;
  }
}

/** ⭐메뉴 허브 팝업 열기 — 7개 메뉴(허브) + 상세 라우팅. 한 씬에 하나만(중복 방지). */
export function openSettingsMenu(scene: Phaser.Scene, opts: SettingsMenuOpts = {}): void {
  const s = scene as SceneWithMenu;
  if (s.__settingsMenu) return;
  const depth = opts.depth ?? 9800;
  const cx = DESIGN_W / 2;
  const cy = DESIGN_H / 2;
  const top = cy - CARD_H / 2;
  const contentTop = top + 200;

  const layer = scene.add.container(0, 0).setDepth(depth);
  s.__settingsMenu = layer;
  if (import.meta.env?.DEV) (globalThis as Record<string, unknown>).__settingsMenu = layer;

  const dim = scene.add.rectangle(cx, cy, DESIGN_W * 1.4, DESIGN_H * 1.2, 0x000000, 0.6).setInteractive();
  dim.on('pointerdown', () => closeMenu(s));
  layer.add(dim);

  const panel = scene.add.rectangle(cx, cy, CARD_W, CARD_H, 0xfff4e0, 1).setStrokeStyle(8, 0xffd34d);
  layer.add(panel);
  const titleText = scene.add.text(cx, top + 90, '메뉴', { fontFamily: TITLE_FONT, fontSize: '60px', color: '#c98a16', stroke: '#2a1640', strokeThickness: 6 }).setOrigin(0.5);
  layer.add(titleText);

  // 우상단 X(닫기) — 상시.
  button(scene, layer, cx + CARD_W / 2 - 72, top + 72, 92, 92, 0xc0463a, '✕', 40, () => closeMenu(s));

  // 상세 화면 전용 ← 뒤로(허브에선 숨김). 별도 컨테이너로 두고 토글.
  const navLayer = scene.add.container(0, 0);
  layer.add(navLayer);

  // 본문(허브/상세 전환 시 비우고 다시 채움).
  const content = scene.add.container(0, 0);
  layer.add(content);
  const clear = (): void => {
    content.removeAll(true);
    navLayer.removeAll(true);
  };

  const onChange = (): void => opts.onDataChanged?.();

  // ── 상세 패널들 ───────────────────────────────────────────────────────────
  const renderProfile = (): void => {
    const p = loadProfile();
    // 아바타(닉네임 첫 글자 — 색은 이름 해시).
    let h = 0;
    for (const ch of p.nickname) h = (h * 31 + ch.charCodeAt(0)) & 0xffffff;
    const avatar = scene.add.circle(cx, contentTop + 70, 92, (h | 0x404040) & 0xb0b0ff).setStrokeStyle(6, 0xffffff, 0.9);
    const initial = scene.add.text(cx, contentTop + 70, p.nickname.slice(0, 1).toUpperCase(), { fontFamily: TITLE_FONT, fontSize: '90px', color: '#ffffff' }).setOrigin(0.5);
    content.add(avatar);
    content.add(initial);
    const nick = scene.add.text(cx, contentTop + 220, p.nickname, { fontFamily: TITLE_FONT, fontSize: '54px', color: '#3a2456' }).setOrigin(0.5);
    content.add(nick);
    label(scene, content, cx, contentTop + 290, `ID  ${p.id}`, 32, '#8a7050', 0.5);
    button(scene, content, cx, contentTop + 380, 360, 96, 0x4a7fb5, '닉네임 변경', 38, () => {
      const cur = loadProfile().nickname;
      const next = typeof window !== 'undefined' && window.prompt ? window.prompt('새 닉네임(최대 16자)', cur) : null;
      if (next != null) {
        setNickname(next);
        renderDetail('profile'); // 재렌더
      }
    });
    // 통계.
    const rows: [string, string][] = [
      ['보유 스핀', loadSpins().toLocaleString('en-US')],
      ['보유 골드', loadCoins().toLocaleString('en-US')],
      ['보유 젬', loadGems().toLocaleString('en-US')],
      ['호텔 레벨', `Lv ${hotelLevel()}`],
    ];
    rows.forEach(([k, v], i) => {
      const y = contentTop + 500 + i * 96;
      label(scene, content, cx - 360, y, k, 42, '#3a2456', 0);
      const vt = scene.add.text(cx + 360, y, v, { fontFamily: TITLE_FONT, fontSize: '44px', color: '#1f7fa8' }).setOrigin(1, 0.5);
      content.add(vt);
    });
  };

  const renderSettings = (): void => {
    toggleRow(scene, content, cx, contentTop + 80, '음악', isMusicEnabled, setMusicEnabled);
    toggleRow(scene, content, cx, contentTop + 200, '효과음', isSfxEnabled, setSfxEnabled);
    toggleRow(scene, content, cx, contentTop + 320, '알림', getNotif, setNotif);
    label(scene, content, cx, contentTop + 440, '※ 알림은 추후 연동 예정입니다.', 28, '#a07b4a', 0.5);
  };

  const renderHowto = (): void => {
    const body =
      'MATCH = 1 SPIN!\n\n' +
      '· 하단 보드에서 같은 그림 3개 이상을 맞추면 스핀이 쌓입니다.\n' +
      '· 모은 스핀으로 상단 슬롯을 돌려 골드를 얻습니다.\n' +
      '· 콤보(연쇄)가 클수록 베팅 배수가 올라갑니다.\n' +
      '· 특수 젬을 2개 이상 매칭하면 어텍/레이드가 발동합니다.\n' +
      '· 골드로 호텔(시티)을 업그레이드해 스테이지를 올립니다.';
    const t = scene.add
      .text(cx, contentTop + 60, body, { fontFamily: KR_FONT, fontSize: '36px', color: '#3a2456', align: 'left', lineSpacing: 14, wordWrap: { width: CARD_W - 140 } })
      .setOrigin(0.5, 0);
    content.add(t);
  };

  const renderRanking = (): void => {
    label(scene, content, cx, contentTop + 50, 'TOP SPINNERS', 48, '#c08a3a', 0.5).setFontFamily(TITLE_FONT);
    const mock: [string, number][] = [
      ['LuckyKing', 128400],
      ['SpinQueen', 96250],
      ['JackpotJoe', 71800],
      ['ReelMaster', 50320],
      ['ComboNova', 38110],
    ];
    mock.forEach(([n, v], i) => {
      const y = contentTop + 160 + i * 96;
      label(scene, content, cx - 360, y, `${i + 1}.  ${n}`, 40, '#3a2456', 0);
      const vt = scene.add.text(cx + 360, y, v.toLocaleString('en-US'), { fontFamily: TITLE_FONT, fontSize: '40px', color: '#1f7fa8' }).setOrigin(1, 0.5);
      content.add(vt);
    });
    label(scene, content, cx, contentTop + 700, `내 스핀 보유 : ${loadSpins().toLocaleString('en-US')}`, 38, '#3a2456', 0.5);
    label(scene, content, cx, contentTop + 770, '(준비 중 — 예시 순위)', 28, '#a07b4a', 0.5);
  };

  const renderShop = (): void => {
    if (opts.onShop) {
      label(scene, content, cx, contentTop + 120, '프리미엄 상점에서 스핀·골드·젬을 구매하세요.', 34, '#3a2456', 0.5);
      button(scene, content, cx, contentTop + 260, 420, 120, 0xb55a8f, '상점 열기', 46, () => {
        closeMenu(s);
        opts.onShop?.();
      });
    } else {
      label(scene, content, cx, contentTop + 180, '상점은 로비 화면에서 이용할 수 있습니다.', 36, '#3a2456', 0.5);
    }
  };

  const renderData = (): void => {
    label(scene, content, cx, contentTop + 20, '(임시 — 값을 바로 적용/저장)', 30, '#a07b4a', 0.5);
    editorRow(scene, content, cx, contentTop + 150, '스핀', loadSpins, (n) => void setSpins(n), 10, 100, onChange);
    editorRow(scene, content, cx, contentTop + 390, '골드', loadCoins, saveCoins, 100_000, 1_000_000, onChange);
    editorRow(scene, content, cx, contentTop + 630, '젬', loadGems, saveGems, 10, 100, onChange);
    // ⭐시설(호텔) 업그레이드 리셋 — 스테이지/레벨 전부 초기화(스테이지 진행 테스트용). 호텔 화면이면 스테이지1 로 재시작.
    label(scene, content, cx, contentTop + 810, '시설 업그레이드 (스테이지 진행 테스트)', 32, '#3a2456', 0.5);
    button(scene, content, cx, contentTop + 910, 580, 120, 0xc0463a, '시설 업그레이드 리셋', 40, () => {
      try {
        if (typeof localStorage !== 'undefined') localStorage.removeItem(HOTEL_SAVE_KEY); // 다음 로드 시 createHotelState(스테이지1·Lv1)
      } catch {
        /* 무시 */
      }
      closeMenu(s);
      if (opts.onHotelReset) opts.onHotelReset();
      else onChange();
    });
    // ⭐전체 시뮬 리셋(2026-07-07) — 스핀300·**보상미션1**·시설Lv1·코인·텔레메트리까지 한 번에 초기화 + 새로고침.
    //   ('시설 업그레이드 리셋'은 시설만 → 보상미션 시뮬 반복에 부족했음. 테스터가 데이터 패널에서 완전 초기화 가능.)
    label(scene, content, cx, contentTop + 1060, '시뮬레이션 (초기 상태부터 재시작)', 32, '#3a2456', 0.5);
    if (opts.onSimReset) {
      button(scene, content, cx, contentTop + 1160, 580, 120, 0x8a3a3a, '⟲ 전체 시뮬 리셋 (스핀300·미션1)', 34, () => {
        closeMenu(s);
        opts.onSimReset?.();
      });
    }
    // ⭐보상 밸런스 상세 편집(슬롯·미션·레이드) — DOM 오버레이. 저장 시 라이브 게임 즉시 반영 + HUD/미션 재동기화.
    label(scene, content, cx, contentTop + 1320, '보상 밸런스 (슬롯 · 미션 · 레이드)', 32, '#3a2456', 0.5);
    button(scene, content, cx, contentTop + 1420, 580, 120, 0x2e7d6b, '⚙ 보상 상세 설정', 40, () => {
      openRewardEditor(() => onChange());
    });
  };

  const renderAbout = (): void => {
    label(scene, content, cx, contentTop + 80, 'MATCHSLOT CITY', 56, '#c98a16', 0.5).setFontFamily(TITLE_FONT);
    const lines = ['버전  0.1.0', '장르  퍼즐 + 슬롯 하이브리드', '제작  PlayPOP Studio', '© 2026 PlayPOP. All rights reserved.'];
    lines.forEach((ln, i) => label(scene, content, cx, contentTop + 220 + i * 84, ln, 36, '#3a2456', 0.5));
  };

  const RENDER: Record<string, () => void> = {
    profile: renderProfile,
    settings: renderSettings,
    howto: renderHowto,
    ranking: renderRanking,
    shop: renderShop,
    data: renderData,
    about: renderAbout,
  };

  // ── 허브 / 상세 라우팅 ────────────────────────────────────────────────────
  const showHub = (): void => {
    clear();
    titleText.setText('메뉴');
    ITEMS.forEach((it, i) => {
      const y = contentTop + 30 + i * 128;
      const bg = scene.add.rectangle(cx, y, 760, 110, it.color, 1).setStrokeStyle(4, 0xffffff, 0.85).setInteractive({ useHandCursor: true });
      const lt = scene.add.text(cx - 340, y, it.label, { fontFamily: KR_FONT, fontSize: '46px', color: '#ffffff', stroke: '#2a1640', strokeThickness: 3 }).setOrigin(0, 0.5);
      const chev = scene.add.text(cx + 340, y, '›', { fontFamily: TITLE_FONT, fontSize: '54px', color: '#ffffff' }).setOrigin(1, 0.5);
      bg.on('pointerdown', () => {
        press(scene, [bg, lt]);
        if (it.key === 'econ') { openEconConsole(); return; } // 팝업 — 상세 패널 대신 새 창
        renderDetail(it.key);
      });
      content.add(bg);
      content.add(lt);
      content.add(chev);
    });
    // 푸터.
    const footY = contentTop + 30 + ITEMS.length * 128 + 40;
    if (opts.onHome) {
      button(scene, content, cx - 200, footY, 360, 110, 0x49b148, opts.homeLabel ?? '홈으로', 44, () => {
        closeMenu(s);
        opts.onHome?.();
      });
      button(scene, content, cx + 200, footY, 360, 110, 0x6b5a8a, '닫기', 44, () => closeMenu(s));
    } else {
      button(scene, content, cx, footY, 420, 110, 0x6b5a8a, '닫기', 44, () => closeMenu(s));
    }
    // ⭐테스트/디버그 버튼(요청: 메뉴 제일 하단) — 최대 2개 한 줄. getOn 있으면 ON/OFF 토글(탭 시 허브 재렌더).
    const devs = opts.devButtons ?? [];
    if (devs.length) {
      const dy = footY + 128;
      label(scene, content, cx, dy - 66, '— 테스트 —', 30, '#a07b4a', 0.5);
      const dw = devs.length > 1 ? 360 : 480;
      const gap = 40;
      let dx = cx - (devs.length * dw + (devs.length - 1) * gap) / 2 + dw / 2;
      for (const d of devs) {
        const on = d.getOn?.() ?? false;
        const col = d.getOn ? (on ? 0x2e7d32 : 0x5a4a3a) : (d.color ?? 0x8a3a3a);
        const lab = d.getOn ? `${d.label}: ${on ? 'ON' : 'OFF'}` : d.label;
        button(scene, content, dx, dy, dw, 104, col, lab, 34, () => {
          d.onTap();
          if (d.getOn) showHub(); // 토글 상태 갱신 위해 재렌더
        });
        dx += dw + gap;
      }
    }
  };

  const renderDetail = (key: string): void => {
    clear();
    const item = ITEMS.find((i) => i.key === key);
    titleText.setText(item?.label ?? '메뉴');
    // ← 뒤로(좌상단).
    button(scene, navLayer, cx - CARD_W / 2 + 90, top + 72, 150, 84, 0x6b5a8a, '← 뒤로', 32, () => showHub());
    RENDER[key]?.();
  };

  showHub();
  layer.setScale(0.9).setAlpha(0);
  scene.tweens.add({ targets: layer, scaleX: 1, scaleY: 1, alpha: 1, duration: 170, ease: 'Back.easeOut' });
}
