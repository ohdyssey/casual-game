/**
 * profilePopup.ts — **프로필 설정**(표시 이름 + 아바타). 상단 헤더의 LV 뱃지를 누르면 열린다.
 *
 * 투데이 리그·랭킹이 "나"를 이름과 얼굴로 보여 주므로, 그 값을 사용자가 직접 정하는 화면이다
 * (PO 2026-08-23). 규칙(길이·기본 이름·아바타 범위)은 전부 `logic/profile.ts` 에 있고 여기서는
 * 화면만 그린다 — 저장은 됐는데 순위표에는 다른 이름, 같은 어긋남을 막는다.
 *
 * ## 이름 입력은 **DOM `<input>`** 이다
 * 캔버스에 직접 글자를 받으면 한글 조합(IME)·모바일 키보드·복사붙여넣기가 전부 따로 놀아 결국
 * 다시 만들게 된다. 캔버스 위에 진짜 입력칸을 얹고, 값만 받아 온다. 팝업이 닫힐 때 반드시 걷어낸다.
 */
import Phaser from 'phaser';
import { sfx } from '../audio.js';
import { loadSave, writeSave } from '../save.js';
import { avatarKey, normalizeName, normalizeProfile, PROFILE_COUNT, NAME_MAX } from '../logic/profile.js';
import { SAFE_W as W } from '../logic/responsiveFrame.js';
import { overlayLayer, overlayScrim } from '../ui/overlay.js';
import { uiButton } from '../ui/uiButton.js';
import { mountGoogleSignIn } from '../ui/googleSignIn.js';

const FONT = '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif';

export interface ProfilePopupOpts {
  readonly depth?: number;
  /** UI 전용 카메라(홈 화면). 넘기지 않으면 메인 카메라 기준 — 딤이 어긋날 수 있다. */
  readonly uiCam?: Phaser.Cameras.Scene2D.Camera;
  /** 오버레이를 UI 카메라 전용으로 묶는 훅(홈 화면의 pinToUi). */
  readonly pinToUi?: (o: Phaser.GameObjects.GameObject) => void;
  readonly toast?: (msg: string) => void;
  /** 저장 후 호출 — 헤더 등 화면에 반영할 때 쓴다. */
  readonly onSaved?: (name: string, avatar: number) => void;
}

/**
 * 캔버스 위에 겹치는 이름 입력칸을 만든다. 캔버스의 화면상 사각형을 재서 **게임 좌표 → CSS 좌표**로
 * 옮기므로, 화면비가 어떻든 팝업 안에 정확히 앉는다.
 */
function makeNameInput(scene: Phaser.Scene, gameX: number, gameY: number, gameW: number, initial: string): HTMLInputElement | null {
  if (typeof document === 'undefined') return null;
  const canvas = scene.game.canvas;
  const rect = canvas?.getBoundingClientRect();
  if (!rect || !(rect.width > 0)) return null;
  const k = rect.width / scene.scale.width; // CSS px per 게임 px
  const cam = scene.cameras.main;
  const el = document.createElement('input');
  el.type = 'text';
  el.value = initial;
  el.maxLength = NAME_MAX;
  el.setAttribute('aria-label', '플레이어 이름');
  const cssW = gameW * k;
  const cssH = 92 * k;
  // 카메라 스크롤(세이프존 중앙정렬)을 빼야 저작 좌표가 화면 좌표와 맞는다.
  const left = rect.left + (gameX - cam.scrollX - gameW / 2) * k;
  const top = rect.top + (gameY - cam.scrollY - 46) * k;
  el.style.cssText =
    `position:fixed;left:${left}px;top:${top}px;width:${cssW}px;height:${cssH}px;` +
    `z-index:2147482000;border-radius:${18 * k}px;border:${3 * k}px solid #b98a3e;` +
    `background:#fff7e6;color:#4a2f14;text-align:center;font-size:${44 * k}px;` +
    `font-family:${FONT};outline:none;padding:0 ${12 * k}px;box-sizing:border-box`;
  document.body.appendChild(el);
  return el;
}

/** 프로필 설정 팝업을 연다. */
export function openProfilePopup(scene: Phaser.Scene, opts: ProfilePopupOpts = {}): void {
  const depth = opts.depth ?? 4200;
  const save = loadSave();
  const current = normalizeProfile(save.profile, save.level * 7919 + save.coins);
  let avatar = current.avatar;

  const layer = overlayLayer(scene, depth);
  opts.pinToUi?.(layer);
  layer.add(overlayScrim(scene, 0x140a1e, 0.9, opts.uiCam));

  const cx = W / 2;
  const top = 620;
  layer.add(
    scene.add
      .text(cx, top, '프로필 설정', { fontFamily: FONT, fontSize: '76px', color: '#ffe066', stroke: '#7a2d9a', strokeThickness: 9 })
      .setOrigin(0.5),
  );
  layer.add(
    scene.add
      .text(cx, top + 90, '리그·랭킹에 표시될 이름과 얼굴이에요', { fontFamily: FONT, fontSize: '32px', color: '#d8c8f0' })
      .setOrigin(0.5),
  );

  // ── 아바타 고르기 — 한 줄에 5개. 고른 것만 테두리로 표시한다. ──
  const AV = 150;
  const GAP = 24;
  const rowW = PROFILE_COUNT * AV + (PROFILE_COUNT - 1) * GAP;
  const avY = top + 260;
  const rings: Phaser.GameObjects.Rectangle[] = [];
  for (let i = 1; i <= PROFILE_COUNT; i++) {
    const x = cx - rowW / 2 + AV / 2 + (i - 1) * (AV + GAP);
    const ring = scene.add.rectangle(x, avY, AV + 16, AV + 16, 0xffe066, 0).setStrokeStyle(6, 0xffe066, 1);
    ring.setVisible(i === avatar);
    layer.add(ring);
    rings.push(ring);
    const key = avatarKey(i);
    const face = scene.textures.exists(key)
      ? scene.add.image(x, avY, key).setDisplaySize(AV, AV)
      : scene.add.rectangle(x, avY, AV, AV, 0x3a2a52, 1);
    face.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      sfx('button');
      avatar = i;
      rings.forEach((r, idx) => r.setVisible(idx + 1 === avatar));
    });
    layer.add(face);
  }

  // ── 이름 입력 ──
  const nameY = avY + 220;
  layer.add(scene.add.text(cx, nameY - 115, '이름', { fontFamily: FONT, fontSize: '34px', color: '#ffffff' }).setOrigin(0.5));
  const input = makeNameInput(scene, cx, nameY, 620, current.name);
  // 입력칸을 못 만들면(비-DOM 환경) 현재 이름만 보여 준다 — 아바타 변경은 계속 가능해야 한다.
  if (!input) {
    layer.add(scene.add.text(cx, nameY, current.name, { fontFamily: FONT, fontSize: '46px', color: '#ffe066' }).setOrigin(0.5));
  }

  // ── 구글 계정 연동(선택) — 진행도는 그대로 두고 신원만 덧붙인다. ──
  const googleY = nameY + 480;
  layer.add(scene.add.text(cx, googleY - 50, '계정 연동(선택)', { fontFamily: FONT, fontSize: '30px', color: '#d8c8f0' }).setOrigin(0.5));
  const google = mountGoogleSignIn(scene, cx, googleY, {
    onLinked: (email) => opts.toast?.(email ? `${email} 로 연동됐어요` : '연동됐어요'),
    onError: () => opts.toast?.('구글 로그인에 실패했어요'),
  });

  const close = (): void => {
    input?.remove();
    google.remove();
    layer.destroy();
  };

  layer.add(
    uiButton(scene, cx, nameY + 190, '저장', 'green', () => {
      const raw = input?.value ?? current.name;
      const name = normalizeName(raw);
      if (!name) {
        opts.toast?.('이름을 입력해 주세요');
        return;
      }
      const next = loadSave();
      next.profile = { name, avatar };
      writeSave(next);
      close();
      opts.onSaved?.(name, avatar);
      opts.toast?.('프로필을 저장했어요');
    }, { width: 420, fontSize: 46 }),
  );
  layer.add(uiButton(scene, cx, nameY + 380, '✕ 닫기', 'red', () => close(), { width: 420, fontSize: 46, sound: 'level_close' }));

  // 씬이 바뀌면 DOM 요소(이름 입력칸·구글 버튼)가 화면에 남는다 — 반드시 같이 걷어낸다.
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    input?.remove();
    google.remove();
  });
}
