/**
 * LobbyScene — 로비(홈) 화면.
 *
 * 디자이너가 에디터(phaser-ui-editor)에서 재디자인한 로비 레이아웃(ui/layouts/blank_2.json,
 * screen "로비")을 SSOT 로 렌더한다 — 헤더(프로필·레벨·코인·메뉴)·사이드 아이콘(상점·할인·리그·
 * 미션)·하단 4메뉴·중앙 PLAY 버튼이 전부 에디터 디자인 그대로.
 *
 * ⚠️ 현재는 **PLAY 버튼 → play, 이벤트 버튼 → 팝업**만 기능 연결. 나머지 버튼(상점/미션/프로필 등)의
 *    기능 배선은 추후 — 지금은 화면만 렌더하고 그 둘만 살린다.
 */
import Phaser from 'phaser';
import { DESIGN_W, DESIGN_H } from './PlayScene.js';
import { buildLayout, type LayoutDoc } from '../ui/layoutLoader.js';
import { uploadPath } from '../assets.js';

/** 로비 레이아웃(에디터 "로비" 화면) 캐시 키 + 경로 — LoadScene 이 미리 받아두면 전환이 즉각적. */
export const LOBBY_LAYOUT_KEY = 'lobby_layout';
export const LOBBY_LAYOUT_PATH = 'ui/layouts/blank_2.json';

/** 이벤트 팝업(에디터 "팝업화면" — blank_copy.json) 캐시 키 + 경로. */
export const POPUP_LAYOUT_KEY = 'popup_layout';
export const POPUP_LAYOUT_PATH = 'ui/layouts/blank_copy.json';

/** PLAY 버튼 텍스처 키(에디터 노드 "플레이 아이콘"). 기능 연결 대상은 현재 이것 하나. */
const PLAY_KEY = 'up_SC_UI_34';

export class LobbyScene extends Phaser.Scene {
  /** 열려 있는 이벤트 팝업 레이어(딤 배경 + 팝업 오브젝트). 없으면 닫힌 상태. */
  private popupLayer?: Phaser.GameObjects.Container;

  constructor() {
    super('lobby');
  }

  preload(): void {
    // LoadScene 이 미리 받았으면 캐시에 있음 — 없을 때만(직접 부팅·씬 재시작 방어) 적재.
    if (!this.cache.json.exists(LOBBY_LAYOUT_KEY)) this.load.json(LOBBY_LAYOUT_KEY, LOBBY_LAYOUT_PATH);
    if (!this.cache.json.exists(POPUP_LAYOUT_KEY)) this.load.json(POPUP_LAYOUT_KEY, POPUP_LAYOUT_PATH);
  }

  create(): void {
    this.popupLayer = undefined; // 씬 재진입(play→lobby) 시 이전 팝업 참조 초기화
    this.cameras.main.fadeIn(220, 26, 16, 48); // #1A1030 에서 부드럽게 진입

    const doc = this.cache.json.get(LOBBY_LAYOUT_KEY) as LayoutDoc | undefined;
    if (!doc || !Array.isArray(doc.nodes) || doc.nodes.length === 0) {
      this.mountFallback();
      return;
    }

    // 로비 이미지는 보통 LoadScene 의 매니페스트 적재로 캐시됨 — 누락분만 직접 적재(방어적).
    let queued = 0;
    for (const n of doc.nodes) {
      if (n.type === 'image' && n.key && !this.textures.exists(n.key)) {
        this.load.image(n.key, uploadPath(n.key));
        queued++;
      }
    }
    if (queued > 0) {
      this.load.once(Phaser.Loader.Events.COMPLETE, () => this.mountLobby(doc));
      this.load.start();
    } else {
      this.mountLobby(doc);
    }
  }

  /** 레이아웃 렌더 + PLAY 버튼만 기능 연결. */
  private mountLobby(doc: LayoutDoc): void {
    const index = buildLayout(this, doc);

    // PLAY 노드: 키(up_SC_UI_34) 우선, 못 찾으면 이름("플레이 아이콘", '복사' 배너 제외)으로 폴백.
    const entries = index.entries();
    const playObj =
      entries.find((e) => e.node.key === PLAY_KEY)?.obj ??
      entries.find((e) => (e.node.name ?? '').startsWith('플레이') && !(e.node.name ?? '').includes('복사'))?.obj;

    if (playObj) {
      this.wirePlay(playObj as Phaser.GameObjects.Image);
    } else if (import.meta.env?.DEV) {
      console.warn(`[lobby] PLAY 노드(${PLAY_KEY})를 찾지 못함 — 레이아웃 키 확인 필요`);
    }

    // 이벤트 버튼 = 좌측 하단 사이드 아이콘(화면상 Shop 아래 선물상자). 아이콘 art/키가 버전업돼도
    //   견고하도록 **위치**로 식별(좌측 열 x<270 · 하단 행 480<y<800).
    const eventObj = entries.find(
      (e) => e.node.type === 'image' && e.node.x < 270 && e.node.y > 480 && e.node.y < 800,
    )?.obj as Phaser.GameObjects.Image | undefined;
    if (eventObj) {
      this.wireEventButton(eventObj);
    } else if (import.meta.env?.DEV) {
      console.warn('[lobby] 이벤트 버튼(좌측 하단 아이콘)을 찾지 못함 — 레이아웃 좌표 확인 필요');
    }
  }

  /** 이벤트 버튼 → 이벤트 팝업 열기(누름 피드백 포함). */
  private wireEventButton(btn: Phaser.GameObjects.Image): void {
    btn.setInteractive({ useHandCursor: true });
    if (import.meta.env?.DEV) (globalThis as Record<string, unknown>).__eventBtn = btn;
    const sx = btn.scaleX;
    const sy = btn.scaleY;
    btn.on('pointerdown', () => {
      if (this.popupLayer) return; // 이미 열려 있으면 무시
      this.tweens.add({ targets: btn, scaleX: sx * 0.9, scaleY: sy * 0.9, duration: 80, yoyo: true, ease: 'Quad.easeOut' });
      this.openEventPopup();
    });
  }

  /**
   * 이벤트 팝업 — 화면을 **검은색 반투명**으로 덮고 그 위에 에디터 "팝업화면"(blank_copy.json)을 렌더.
   * 딤(바깥) 탭 → 닫힘, 팝업 패널 탭 → 무시(클릭 삼킴). 딤+팝업을 한 컨테이너에 담아 함께 페이드/정리.
   */
  private openEventPopup(): void {
    if (this.popupLayer) return;
    const layer = this.add.container(0, 0).setDepth(9000);
    this.popupLayer = layer;
    if (import.meta.env?.DEV) (globalThis as Record<string, unknown>).__popup = layer;

    // 검은색 반투명 딤 — 프레임 전체(+여백) 덮음 + 모달(뒤 로비 입력 차단). 탭하면 팝업이 닫힌다.
    //   팝업 패널이 화면을 거의 꽉 채워(1076px) 바깥 여백이 좁으므로, 딤만 인터랙티브로 두고 팝업
    //   오브젝트는 비인터랙티브로 둔다 → **아무 데나(패널 art 의 X 포함) 탭하면 닫힘**. 팝업 내부에
    //   기능 버튼이 추가되면 그 인터랙티브 자식이 자연히 딤보다 우선해 동작한다(현재는 콘텐츠 없음).
    const dim = this.add
      .rectangle(DESIGN_W / 2, DESIGN_H / 2, DESIGN_W * 1.4, DESIGN_H * 1.2, 0x000000, 0.62)
      .setInteractive({ useHandCursor: false });
    dim.on('pointerdown', () => this.closeEventPopup());
    layer.add(dim);

    // 에디터 팝업 레이아웃 렌더 → 딤 위로 쌓기(컨테이너 삽입 순서 = 렌더 순서).
    const doc = this.cache.json.get(POPUP_LAYOUT_KEY) as LayoutDoc | undefined;
    if (doc && Array.isArray(doc.nodes) && doc.nodes.length > 0) {
      const idx = buildLayout(this, doc);
      for (const e of idx.entries()) layer.add(e.obj);
    } else if (import.meta.env?.DEV) {
      console.warn('[lobby] 팝업 레이아웃(blank_copy.json)을 읽지 못함');
    }

    // 등장: 페이드 인(딤은 0.62, 팝업은 1까지 — 컨테이너 알파가 자식에 곱해짐).
    layer.setAlpha(0);
    this.tweens.add({ targets: layer, alpha: 1, duration: 160, ease: 'Quad.easeOut' });
  }

  /** 이벤트 팝업 닫기 — 페이드 아웃 후 컨테이너(딤+팝업) 파기. */
  private closeEventPopup(): void {
    const layer = this.popupLayer;
    if (!layer) return;
    this.popupLayer = undefined;
    this.tweens.add({
      targets: layer,
      alpha: 0,
      duration: 130,
      ease: 'Quad.easeIn',
      onComplete: () => layer.destroy(true),
    });
  }

  /** PLAY 버튼 → 게임(play) 진입. 누름 피드백 + 페이드 전환. */
  private wirePlay(btn: Phaser.GameObjects.Image): void {
    btn.setInteractive({ useHandCursor: true });
    if (import.meta.env?.DEV) (globalThis as Record<string, unknown>).__lobbyPlay = btn;

    const sx = btn.scaleX;
    const sy = btn.scaleY;
    let started = false;
    btn.on('pointerdown', () => {
      if (started) return; // 중복 진입 방지
      started = true;
      btn.disableInteractive();
      this.tweens.add({
        targets: btn,
        scaleX: sx * 0.92,
        scaleY: sy * 0.92,
        duration: 90,
        yoyo: true,
        ease: 'Quad.easeOut',
        onComplete: () => {
          this.cameras.main.fadeOut(220, 26, 16, 48);
          this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('play'));
        },
      });
    });
  }

  /** 레이아웃을 못 읽을 때(디자인 누락) — 빈 배경 + 중앙 PLAY 히트존만. */
  private mountFallback(): void {
    this.add.rectangle(0, 0, DESIGN_W, DESIGN_H, 0x1a1030).setOrigin(0, 0);
    const zone = this.add.rectangle(540, 1824, 502, 319, 0xff0000, 0).setInteractive({ useHandCursor: true });
    zone.on('pointerdown', () => {
      zone.disableInteractive();
      this.scene.start('play');
    });
  }
}
