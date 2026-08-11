/**
 * MenuScene — 게임 선택 화면(에디터 저작 SSOT).
 *
 * 배치의 원본은 phaser-ui-editor 가 저장한 `public/ui/layouts/main.json` 이다.
 * 이 씬은 그 문서를 런타임에 그대로 해석해 그린다 — 좌표를 코드에 베끼지 않는다.
 * (에디터에서 버튼을 옮기면 코드 수정 없이 게임에 반영된다)
 *
 * 노드 ↔ 동작 연결만 코드가 정한다:
 *   layer_2       버튼1(AI 튜토리얼)  → AI 스터디 모드로 플레이
 *   layer_2_copy  버튼2(싱글플레이)   → 실전 vs 컴퓨터
 *   layer_2_copy2 버튼3(대전플레이)   → 매칭 화면(현재 상대는 가상 유저 = 봇)
 * ⚠ 에디터에 역할(action:)이 저작되지 않아 하네스 추정(확신 75%)을 근거로 연결했다.
 */
import Phaser from 'phaser';
import { goHub } from '@casual/core/systems/hubButton.js';
import { LAYOUT_DOC_KEY, type LayoutDoc, type LayoutNode } from '../assets.js';
import { BGM, isMuted, playSfx, startBgm, toggleMuted } from '../audio.js';
import { liftAboveBanner } from '../ui/adBanner.js';
import { FIGHTER_SKIN, NeonFighter, fighterAssetsReady, type FighterSkin } from '../ui/fighter.js';
import { hasHubExit } from '../shell.js';
import { savedLevelBadgeText } from './PlayScene.js';

const W = 1080;
const H = 2400;

/** 에디터 노드 id — `.pue-harness/generated/screens.js` 의 NODES.MAIN 과 같다. */
const NODE = {
  BG: 'layer_1',
  BTN_STUDY: 'layer_2',
  BTN_SINGLE: 'layer_2_copy',
  BTN_VERSUS: 'layer_2_copy2',
  /** 버튼 라벨 — 에디터에서 버튼 이미지와 **분리해** 올린 텍스트 노드(2026-08-05). */
  LBL_STUDY: 'layer_8',
  LBL_SINGLE: 'layer_8_copy',
  LBL_VERSUS: 'layer_8_copy2',
  /** 상단 등급 배지 — 문구는 런타임 값으로 갈아끼운다. */
  BADGE: 'layer_7',
  CHR_BLUE: 'layer_3',
  CHR_PINK: 'layer_3_copy',
  LIGHT_BLUE: 'layer_6',
  LIGHT_RED: 'layer_6_copy',
} as const;

/** 조명 연기는 **공격할 때만** 보인다(유저 확정) — 메뉴에서는 그리지 않는다. */
const HIDDEN_NODES: readonly string[] = [NODE.LIGHT_BLUE, NODE.LIGHT_RED];

/** 캐릭터 노드 — 준비 자세로 세우고 숨쉬기·후광을 입힌다(게임 화면과 같은 연출). */
const CHR_NODE: ReadonlyArray<{ id: string; skin: FighterSkin; facing: 1 | -1; delay: number }> = [
  { id: NODE.CHR_BLUE, skin: FIGHTER_SKIN.blue, facing: 1, delay: 0 },
  { id: NODE.CHR_PINK, skin: FIGHTER_SKIN.pink, facing: -1, delay: 380 },
];

/** 버튼 이미지 → 그 위에 얹힌 저작 라벨 노드. 라벨이 있으면 폴백 라벨은 그리지 않는다. */
const BUTTON_LABEL_OF: Record<string, string> = {
  [NODE.BTN_STUDY]: NODE.LBL_STUDY,
  [NODE.BTN_SINGLE]: NODE.LBL_SINGLE,
  [NODE.BTN_VERSUS]: NODE.LBL_VERSUS,
};

/** 텍스처가 없을 때 대신 그릴 버튼 라벨(에셋 키가 바뀌어도 화면이 죽지 않게). */
const FALLBACK_LABEL: Record<string, string> = {
  [NODE.BTN_STUDY]: '🤖 AI 스터디',
  [NODE.BTN_SINGLE]: '⚔ 싱글플레이',
  [NODE.BTN_VERSUS]: '🆚 대전플레이',
};

/** 버튼 이미지 3개 — 배너 위로 얼마나 밀지 계산하는 기준(가장 아래 밑변). */
const BUTTON_NODES: readonly string[] = [NODE.BTN_STUDY, NODE.BTN_SINGLE, NODE.BTN_VERSUS];
/** 배너 위로 함께 밀어올릴 대상 — 버튼 이미지 + 그 위에 얹은 라벨 텍스트(따로 놀면 안 된다). */
const LIFT_NODES: readonly string[] = [
  ...BUTTON_NODES,
  NODE.LBL_STUDY,
  NODE.LBL_SINGLE,
  NODE.LBL_VERSUS,
];
/** 가장 아래 버튼의 밑변과 배너 윗변 사이 간격(게임 px). */
const MENU_AD_GAP = 28;
/** 배너 위치 재확인 주기(ms) — 광고는 부팅 후 비동기로 붙는다. */
const MENU_RECHECK_MS = 500;

/** 배치가 없을 때 쓰는 최소 폴백 — 세로로 쌓은 버튼 3개. */
const FALLBACK_DOC: LayoutDoc = {
  frame: { designW: W, designH: H },
  nodes: [
    { id: NODE.BTN_STUDY, type: 'image', x: 540, y: 1705, w: 677, h: 179 },
    { id: NODE.BTN_SINGLE, type: 'image', x: 540, y: 1891, w: 677, h: 175 },
    { id: NODE.BTN_VERSUS, type: 'image', x: 540, y: 2077, w: 677, h: 175 },
  ],
};

/** 가장 아래 버튼의 저작 밑변(게임 y). 대상이 없으면 0. */
function lowestButtonBottomY(doc: LayoutDoc): number {
  let bottom = 0;
  for (const node of doc.nodes) {
    if (!BUTTON_NODES.includes(node.id)) continue;
    bottom = Math.max(bottom, node.y + (node.h ?? 175) / 2);
  }
  return bottom;
}

export class MenuScene extends Phaser.Scene {
  /** 배너 광고 위로 함께 밀어올릴 오브젝트와 그 저작 위치(기준선). */
  private liftTargets: Array<{ readonly obj: { y: number }; readonly baseY: number }> = [];
  /** 가장 아래 버튼의 저작 밑변(게임 좌표) — 밀어올릴 거리 계산의 기준. */
  private lowestButtonBottom = 0;

  constructor() {
    super('menu');
  }

  create(): void {
    this.liftTargets = [];
    const doc = this.loadDoc();
    this.lowestButtonBottom = lowestButtonBottomY(doc);
    for (const node of doc.nodes) this.buildNode(node);
    this.buildFighters(doc);

    this.buildBackButton();
    this.buildMuteButton();

    // TODO: 추정 — 에디터에 역할(action:)이 저작되면 이 연결을 확정으로 바꿀 것
    this.onTap(NODE.BTN_STUDY, () => this.scene.start('play', { mode: 'study' }));
    this.onTap(NODE.BTN_SINGLE, () => this.scene.start('play', { mode: 'real' }));
    this.onTap(NODE.BTN_VERSUS, () => this.scene.start('match'));

    // 하단 배너 광고가 붙으면 버튼 묶음을 그 위로 밀어올린다(부팅 후 비동기로 붙어 주기 확인).
    this.syncButtonsToBanner();
    this.time.addEvent({ delay: MENU_RECHECK_MS, loop: true, callback: () => this.syncButtonsToBanner() });

    // 홈 BGM — 대국 화면은 다른 곡으로 갈아탄다(매칭 화면까지는 이 곡이 이어진다).
    // (부팅 직후엔 브라우저 자동재생 정책에 막힐 수 있다 — 첫 탭에서 다시 시도된다)
    startBgm(BGM.home);
    playSfx('ui_scene_in');

    this.cameras.main.fadeIn(220);
  }

  /** 버튼 묶음(이미지·라벨·탭영역)을 배너 광고 윗변 위로 함께 올린다. 광고가 없으면 저작 위치 그대로. */
  private syncButtonsToBanner(): void {
    if (this.lowestButtonBottom <= 0) return;
    const shift = liftAboveBanner(this, this.lowestButtonBottom, MENU_AD_GAP);
    for (const t of this.liftTargets) t.obj.y = t.baseY - shift;
  }

  /** 밀어올림 대상으로 등록 — 지금 위치를 기준선으로 기억한다. */
  private registerLift(nodeId: string, obj: { y: number }): void {
    if (!LIFT_NODES.includes(nodeId)) return;
    this.liftTargets.push({ obj, baseY: obj.y });
  }

  /** 에디터 문서 — 로드에 실패했으면 폴백 배치로 화면을 유지한다. */
  private loadDoc(): LayoutDoc {
    const raw = this.cache.json.get(LAYOUT_DOC_KEY) as LayoutDoc | undefined;
    return raw && Array.isArray(raw.nodes) && raw.nodes.length > 0 ? raw : FALLBACK_DOC;
  }

  /**
   * 캐릭터 노드를 살아 있는 캐릭터로 바꿔 세운다 — 발밑 축 숨쉬기 + 색상 후광.
   * (에디터가 올린 정적 이미지 대신 게임 화면과 같은 연출 모듈을 쓴다)
   */
  private buildFighters(doc: LayoutDoc): void {
    for (const { id, skin, facing, delay } of CHR_NODE) {
      const node = doc.nodes.find((n) => n.id === id);
      if (!node || !fighterAssetsReady(this, skin)) continue;
      const h = node.h ?? 258;
      const fighter = new NeonFighter(this, skin, {
        x: node.x,
        bottomY: node.y + h / 2,
        height: h,
        facing,
        depth: node.depth ?? 5,
      });
      fighter.startBreathing(delay); // 좌우 호흡 위상을 어긋나게
    }
  }

  /**
   * 저작 텍스트 노드를 그대로 그린다 — 글꼴·크기·색·외곽선·그림자를 문서에서 읽는다.
   * 버튼 라벨(`layer_8*`)은 에디터에서 버튼 이미지와 분리해 올린 것이라 좌표가 버튼 중앙이
   * 아닐 수 있다(아이콘이 붙은 버튼은 글자가 오른쪽으로 밀린다) — 보정하지 말고 그대로 둔다.
   *
   * 상단 배지(`layer_7`)의 문구는 **런타임 값**으로 갈아끼운다. 문서에 적힌 "Lv2 연습생…"은
   * 디자인용 예시값이라 그대로 두면 홈 화면이 남의 등급을 보여 주게 된다.
   */
  private buildTextNode(node: LayoutNode): void {
    const text = node.id === NODE.BADGE ? savedLevelBadgeText() : (node.text ?? '');
    if (!text) return;
    const size = node.fontSize ?? 40;
    const label = this.add
      .text(node.x, node.y, text, {
        fontFamily: `${node.fontFamily ?? 'Jua'}, sans-serif`,
        fontSize: `${size}px`,
        color: node.color ?? '#ffffff',
        align: node.align ?? 'center',
      })
      .setOrigin(0.5)
      .setDepth(node.depth ?? 0);
    if (node.alpha !== undefined) label.setAlpha(node.alpha);
    // 저작 외곽선이 없어도 네온 배경 위 가독성을 위해 최소 두께는 준다.
    label.setStroke(node.stroke ?? '#0A0714', Math.max(4, Math.round(size * 0.14)));
    label.setShadow(2, 2, 'rgba(0,0,0,0.45)', 3, false, true);
    this.registerLift(node.id, label);
  }

  /** 노드 1개를 그린다. 좌표·크기는 전부 중심 기준(center-anchored). */
  private buildNode(node: LayoutNode): void {
    if (node.visible === false) return;
    // 캐릭터는 NeonFighter 가 따로 세운다(에디터 이미지 노드는 건너뛴다).
    if (CHR_NODE.some((c) => c.id === node.id)) return;
    if (HIDDEN_NODES.includes(node.id)) return; // 조명 연기는 공격 연출 전용

    const key = node.key ?? '';
    if (node.type === 'image' && key && this.textures.exists(key)) {
      const img = this.add.image(node.x, node.y, key).setDepth(node.depth ?? 0);
      if (node.w && node.h) img.setDisplaySize(node.w, node.h);
      if (node.angle) img.setAngle(node.angle); // 저작 회전 반영
      if (node.alpha !== undefined) img.setAlpha(node.alpha);
      img.setData('nodeId', node.id);
      this.registerLift(node.id, img);
      return;
    }
    // 저작 텍스트(버튼 라벨·상단 배지) — 에디터에서 이미지와 분리해 따로 올린 노드들이다.
    if (node.type === 'text') {
      this.buildTextNode(node);
      return;
    }
    // 텍스처가 없는 버튼은 라벨 박스로 대체(배경 노드는 그냥 건너뛴다).
    // ⚠️ 라벨 텍스트는 저작 문서에 따로 있으면 그쪽이 그린다 — 여기서 또 그리면 두 겹이 된다.
    const label = FALLBACK_LABEL[node.id];
    if (!label) return;
    const authoredLabel = this.loadDoc().nodes.some((n) => n.id === BUTTON_LABEL_OF[node.id]);
    const w = node.w ?? 677;
    const h = node.h ?? 175;
    const g = this.add.graphics().setDepth(node.depth ?? 0);
    g.fillStyle(0x1b1636, 0.95);
    g.fillRoundedRect(node.x - w / 2, node.y - h / 2, w, h, 36);
    g.lineStyle(5, 0x27c4ff, 0.9);
    g.strokeRoundedRect(node.x - w / 2, node.y - h / 2, w, h, 36);
    // 도형은 절대좌표로 그려졌으므로 g.y(기준 0)를 옮기면 상자 전체가 같이 따라온다.
    this.registerLift(node.id, g);
    if (authoredLabel) return; // 라벨은 저작 텍스트 노드가 그린다
    const text = this.add
      .text(node.x, node.y, label, {
        fontFamily: 'Jua, sans-serif',
        fontSize: '64px',
        color: '#E6E9FF',
      })
      .setOrigin(0.5)
      .setDepth((node.depth ?? 0) + 1);
    this.registerLift(node.id, text);
  }

  /** 노드 자리에 탭 영역을 얹는다(에디터 배치를 그대로 히트영역으로 쓴다). */
  private onTap(nodeId: string, handler: () => void): void {
    const node = this.loadDoc().nodes.find((n) => n.id === nodeId) ?? FALLBACK_DOC.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const w = node.w ?? 677;
    const h = node.h ?? 175;
    const zone = this.add
      .zone(node.x, node.y, w, h)
      .setOrigin(0.5)
      .setDepth(1000)
      .setInteractive({ useHandCursor: true });
    this.registerLift(nodeId, zone); // 히트영역도 그림과 같이 움직여야 한다.

    const target = this.children.list.find(
      (o) => (o as Phaser.GameObjects.Image).getData?.('nodeId') === nodeId,
    ) as Phaser.GameObjects.Image | undefined;

    zone.on('pointerdown', () => {
      playSfx('ui_btn_main'); // 모드를 고르는 큰 결정 — 공통 탭음보다 묵직하게

      if (target) {
        this.tweens.add({ targets: target, scale: target.scale * 0.94, duration: 90, yoyo: true });
        this.time.delayedCall(120, handler);
      } else {
        handler();
      }
    });
  }

  /**
   * 우상단 사운드 끄기/켜기 — 게임 화면과 같은 자리·같은 모양.
   * 음소거 상태는 `audio.ts` 한 곳에 있어 여기서 끄면 게임 화면도 꺼진 채로 시작한다
   * (새로고침하면 다시 켜진다 — 저장까지는 하지 않는다).
   */
  private buildMuteButton(): void {
    const mute = this.add
      .text(W - 90, 150, isMuted() ? '🔇' : '🔊', { fontSize: '64px' })
      .setOrigin(0.5)
      .setDepth(1000)
      .setInteractive({ useHandCursor: true });
    mute.on('pointerdown', () => {
      // 끄는 순간에도 토글음이 들린다(audio.toggleMuted 가 소리를 먼저 울리고 늦게 죽인다).
      mute.setText(toggleMuted() ? '🔇' : '🔊');
    });
  }

  /**
   * 좌상단 뒤로가기 — 허브로 복귀(에디터 배치에는 없는 기능 버튼).
   * ⚠️ 토스 미니앱에는 허브가 없다 — 그 환경에선 아예 만들지 않는다(죽은 링크 방지).
   */
  private buildBackButton(): void {
    if (!hasHubExit()) return;
    const back = this.add
      .text(90, 150, '◀', { fontFamily: 'Jua, sans-serif', fontSize: '58px', color: '#E6E9FF' })
      .setOrigin(0.5)
      .setDepth(1000)
      .setStroke('#0A0714', 8)
      .setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => {
      playSfx('ui_tap'); // 좌상단 ◀ 는 가벼운 이동 — 결정적 후퇴(ui_btn_cancel)와 구분한다
      goHub();
    });
  }

}
