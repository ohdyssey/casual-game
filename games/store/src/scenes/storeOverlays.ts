/**
 * storeOverlays — 팝업/메시지를 **에디터 레이아웃(SSOT)** 으로 렌더.
 *   · 승리   = "팝업 성공"(blank_3)      — RETRY/HOME/NEXT
 *   · 실패   = "팝업 실패"(blank_3_copy) — RETRY/HOME
 *   · 메시지 = "빈 화면"(blank_4)        — 패널 + Msg 텍스트(토스트)
 *
 * 팝업 레이아웃 프레임(720×1600)을 게임 캔버스(1080×2400)에 비율 맞춰 스케일·중앙 배치하고,
 * 점수/코인/메시지 텍스트를 노드 id 로 동적 바인딩, 버튼 노드 위에 탭 존을 얹어 콜백을 배선한다.
 */

import Phaser from 'phaser';
import { sfx } from '../audio.js';
import { buildLayout, type LayoutDoc, type LayoutIndex } from '../ui/layoutLoader.js';
import { DEFAULT_AVATAR_KEY } from '../meta/index.js';

export interface ResultPopupOpts {
  /** 배경 딤 알파(승리=리플레이 노출 위해 옅게, 실패=표준). */
  readonly backdropAlpha: number;
  /** 노드 id → 덮어쓸 텍스트(점수·코인·제목). */
  readonly binds: Record<string, string>;
  /** 노드 id → 클릭 콜백(RETRY/HOME/NEXT 등 버튼). */
  readonly buttons: Record<string, () => void>;
}

/**
 * 통합 프로필 적용 — 에디터가 저작한 프로필 디자인(배경 + 아바타 + 프레임)을 SSOT 로 사용.
 *  · 레이아웃에 'Profile_img' 노드가 있으면(에디터 저작): 그 텍스처만 사용자 아바타로 교체(위치·배경 유지).
 *  · 없으면(플레이 레이아웃 미갱신): 에디터(blank.json) 디자인을 코드로 보강 — 민트 배경 rect + 아바타.
 *    추후 에디터에 Profile_img 가 추가되면 자동으로 교체 경로로 전환된다.
 */
export function applyProfile(scene: Phaser.Scene, index: LayoutIndex, doc: LayoutDoc, frameId: string, avatarKey: string): void {
  const key = avatarKey && scene.textures.exists(avatarKey) ? avatarKey : DEFAULT_AVATAR_KEY;
  const imgNode = doc.nodes.find((n) => n.name === 'Profile_img');
  if (imgNode) {
    const img = index.tryById<Phaser.GameObjects.Image>(imgNode.id);
    if (img && scene.textures.exists(key)) img.setTexture(key);
    return;
  }
  // 코드 보강 — 에디터 blank.json 스펙(프레임 111,121 기준): 배경 rect(#66ffe6, 132×123, y=112) + 아바타(129×129, y=115).
  const frame = index.nodeById(frameId);
  if (!frame) return;
  const d = frame.depth ?? 11;
  const bg = scene.add.graphics().setDepth(d - 2);
  bg.fillStyle(0x66ffe6, 1);
  bg.fillRect(frame.x - 66, frame.y - 70.5, 132, 123);
  if (scene.textures.exists(key)) {
    scene.add.image(frame.x, frame.y - 6, key).setDisplaySize(129, 129).setDepth(d - 1);
  }
}

/** 캔버스에 fit·중앙 배치된 레이아웃 렌더 결과 — 노드 월드 좌표 조회 지원(탭존 배치용). */
export interface RenderedLayout {
  readonly index: LayoutIndex;
  readonly container: Phaser.GameObjects.Container;
  readonly scale: number;
  /** 노드 id 의 월드 중심 좌표·표시 크기(없으면 null). */
  worldRect(id: string): { x: number; y: number; w: number; h: number } | null;
}

/**
 * 에디터 레이아웃 doc 을 캔버스에 fit(min 스케일)해 프레임 중심=캔버스 중심으로 배치한다(공용).
 * 버튼/텍스트 후처리는 호출자가 index·worldRect 로 수행.
 */
export function renderLayoutFit(scene: Phaser.Scene, doc: LayoutDoc, depth: number): RenderedLayout {
  const cw = scene.scale.width;
  const ch = scene.scale.height;
  const fw = doc.frame?.designW || cw;
  const fh = doc.frame?.designH || ch;
  const s = Math.min(cw / fw, ch / fh); // 프레임을 캔버스에 fit
  const ox = cw / 2 - (fw / 2) * s; // 프레임 중심 → 캔버스 중심
  const oy = ch / 2 - (fh / 2) * s;

  const index = buildLayout(scene, doc);
  const container = scene.add.container(ox, oy).setScale(s).setDepth(depth);
  for (const e of index.entries()) container.add(e.obj);

  return {
    index,
    container,
    scale: s,
    worldRect(id: string) {
      const n = index.nodeById(id);
      if (!n) return null;
      return { x: ox + n.x * s, y: oy + n.y * s, w: (n.w ?? 120) * s, h: (n.h ?? 60) * s };
    },
  };
}

/**
 * 에디터 팝업 레이아웃을 렌더한다. layoutKey = 캐시에 로드된 팝업 doc 키(UI_WIN/LOSE_LAYOUT_KEY).
 * 프레임을 캔버스에 fit 후 프레임 중심 = 캔버스 중심으로 배치 → 버튼 존은 월드 좌표로 얹는다.
 */
export function showResultPopup(scene: Phaser.Scene, layoutKey: string, opts: ResultPopupOpts): void {
  const doc = scene.cache.json.get(layoutKey) as LayoutDoc | undefined;
  if (!doc?.nodes?.length) return;

  sfx(scene, 'sfx_popup_open');
  const cw = scene.scale.width;
  const ch = scene.scale.height;

  // 배경 딤(전체 캔버스).
  const backdrop = scene.add.rectangle(cw / 2, ch / 2, cw, ch, 0x000000, opts.backdropAlpha).setDepth(100).setInteractive();

  const rl = renderLayoutFit(scene, doc, 101);

  // 동적 텍스트 바인딩.
  for (const [id, text] of Object.entries(opts.binds)) {
    rl.index.tryById<Phaser.GameObjects.Text>(id)?.setText(text);
  }

  const zones: Phaser.GameObjects.Zone[] = [];
  const destroy = (): void => {
    backdrop.destroy();
    rl.container.destroy();
    zones.forEach((z) => z.destroy());
  };

  // 버튼 존(월드 좌표) — 노드 표시 크기 기반 히트 영역 + 눌림 연출.
  for (const [id, onClick] of Object.entries(opts.buttons)) {
    const rect = rl.worldRect(id);
    const obj = rl.index.tryById<Phaser.GameObjects.Image>(id);
    if (!rect || !obj) continue;
    const zone = scene.add
      .zone(rect.x, rect.y, rect.w, rect.h)
      .setInteractive({ useHandCursor: true })
      .setDepth(102)
      .on('pointerdown', () => {
        sfx(scene, 'sfx_button_tap');
        const bx = obj.scaleX;
        const by = obj.scaleY;
        scene.tweens.killTweensOf(obj);
        scene.tweens.add({ targets: obj, scaleX: bx * 0.9, scaleY: by * 0.9, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
        destroy();
        onClick();
      });
    zones.push(zone);
  }
}

/**
 * 메시지 토스트 — 에디터 "빈 화면"(blank_4) 레이아웃(패널 + Msg 텍스트)을 SSOT 로 렌더.
 * 긴 문구는 패널 폭에 맞춰 **최대 2줄**로 줄바꿈, 약 3초 표시 후 **페이드 아웃**.
 * 레이아웃 미로드 시 조용히 무시(방어) — 호출자가 코드 폴백 여부 판단.
 * @returns 렌더 성공 여부(false=레이아웃 없음).
 */
export function showMessagePopup(scene: Phaser.Scene, layoutKey: string, msg: string): boolean {
  const doc = scene.cache.json.get(layoutKey) as LayoutDoc | undefined;
  if (!doc?.nodes?.length) return false;

  const rl = renderLayoutFit(scene, doc, 300);

  // 첫 text 노드(=Msg) 에 메시지 바인딩 + 패널 폭 기준 최대 2줄 줄바꿈.
  const textNode = doc.nodes.find((n) => n.type === 'text');
  const panelNode = doc.nodes.find((n) => n.type === 'image');
  const t = textNode ? rl.index.tryById<Phaser.GameObjects.Text>(textNode.id) : undefined;
  if (t) {
    const wrapW = Math.max(160, (panelNode?.w ?? 480) - 90); // 패널 내부 폭(좌우 여백)
    t.setAlign('center');
    t.setWordWrapWidth(wrapW, true); // advanced=한글 등 공백 없는 긴 문구도 글자 단위 줄바꿈
    t.setMaxLines(2);
    t.setText(msg);
    t.setOrigin(0.5); // 2줄에도 패널 중앙 정렬 유지
  }

  // 약 3초 표시 후 페이드 아웃(600ms).
  scene.tweens.add({ targets: rl.container, alpha: 0, delay: 2400, duration: 600, onComplete: () => rl.container.destroy() });
  return true;
}

/**
 * 확인 팝업 — 메시지 패널(blank_4)을 배경 딤 위에 **고정 표시**(자동 사라짐 없음)하고, 패널 아래
 * OK 버튼(okTextureKey)을 눌러야 onOk 실행. 데드락 셔플처럼 "즉시 실행" 대신 플레이어 확인을 받는 흐름용.
 */
export function showConfirmPopup(
  scene: Phaser.Scene,
  layoutKey: string,
  msg: string,
  okTextureKey: string,
  onOk: () => void,
): void {
  const cw = scene.scale.width;
  const ch = scene.scale.height;
  sfx(scene, 'sfx_popup_open');
  const backdrop = scene.add.rectangle(cw / 2, ch / 2, cw, ch, 0x000000, 0.5).setDepth(310).setInteractive();

  let panel: Phaser.GameObjects.Container | undefined;
  let panelBottomY = ch / 2;
  const doc = scene.cache.json.get(layoutKey) as LayoutDoc | undefined;
  if (doc?.nodes?.length) {
    const rl = renderLayoutFit(scene, doc, 311);
    panel = rl.container;
    const textNode = doc.nodes.find((n) => n.type === 'text');
    const panelNode = doc.nodes.find((n) => n.type === 'image');
    const t = textNode ? rl.index.tryById<Phaser.GameObjects.Text>(textNode.id) : undefined;
    if (t) {
      const wrapW = Math.max(160, (panelNode?.w ?? 480) - 90);
      t.setAlign('center');
      t.setWordWrapWidth(wrapW, true);
      t.setMaxLines(2);
      t.setText(msg);
      t.setOrigin(0.5);
    }
    const pr = panelNode ? rl.worldRect(panelNode.id) : null;
    if (pr) panelBottomY = pr.y + pr.h / 2;
  }

  // OK 버튼(공통 에셋 UI_btn_01). 텍스처 미로드 시 캡슐 대체.
  const okY = panelBottomY + 96;
  const okW = 300;
  const okBtn = scene.add.container(cw / 2, okY).setDepth(312);
  let okH = 110;
  if (scene.textures.exists(okTextureKey)) {
    const img = scene.add.image(0, 0, okTextureKey);
    okH = (okW / img.width) * img.height;
    img.setDisplaySize(okW, okH);
    okBtn.add(img);
  } else {
    const g = scene.add.graphics();
    g.fillStyle(0x009de0, 1);
    g.fillRoundedRect(-okW / 2, -okH / 2, okW, okH, 24);
    okBtn.add(g);
    okBtn.add(scene.add.text(0, 0, 'OK', { fontFamily: '"Jua", sans-serif', fontSize: '42px', color: '#ffffff' }).setOrigin(0.5));
  }

  const destroy = (): void => {
    backdrop.destroy();
    panel?.destroy();
    okBtn.destroy();
    okZone.destroy();
  };
  const okZone = scene.add
    .zone(cw / 2, okY, okW, okH)
    .setInteractive({ useHandCursor: true })
    .setDepth(313)
    .on('pointerdown', () => {
      sfx(scene, 'sfx_button_tap');
      scene.tweens.killTweensOf(okBtn);
      scene.tweens.add({ targets: okBtn, scaleX: 0.9, scaleY: 0.9, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
      scene.time.delayedCall(120, () => {
        destroy();
        onOk();
      });
    });
}
