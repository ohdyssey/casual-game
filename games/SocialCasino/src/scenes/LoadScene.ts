/**
 * LoadScene — 게임 로딩 화면("게임로딩").
 *
 * 디자이너가 에디터(phaser-ui-editor)에서 저작한 ui/layouts/splash.json 을 SSOT 로 렌더한다.
 * 배경/캐릭터/로고/로딩바 홈은 에디터대로 그리고, role:"progress" 사각형과 binding:"loadStatus"
 * 텍스트는 실제 에셋 로더 진행률에 맞춰 LoadScene 이 직접 구동한다(0→100%).
 *
 * 흐름: load(이 씬) → 무거운 본편 에셋을 일괄 적재(진행바가 추종) → 완료 시 페이드 → lobby.
 *   lobby/play 가 쓰는 텍스처를 여기서 미리 다 받아두므로 이후 화면 전환이 즉각적이다.
 *
 * 진행바·상태문구는 좌표/색/깊이를 하드코딩하지 않고 에디터 노드 메타(role/binding)로 식별해
 * splash.json 에서 그대로 가져온다 — 디자이너가 위치를 옮겨도 코드 수정이 필요 없다.
 */
import Phaser from 'phaser';
import { loadGameAssets, uploadPath, preloadKoreanFonts } from '../assets.js';
import { buildLayout, type LayoutDoc, type LayoutNode } from '../ui/layoutLoader.js';
import { LOBBY_LAYOUT_KEY, LOBBY_LAYOUT_PATH } from './LobbyScene.js';

/** 에디터 메타 필드(role:"progress" / binding:"loadStatus")를 읽기 위한 확장 타입. */
type MetaNode = LayoutNode & { readonly role?: string; readonly binding?: string };

const SPLASH_LAYOUT_KEY = 'splash_layout';
const SPLASH_LAYOUT_PATH = 'ui/layouts/splash.json';

/**
 * ⭐레이드/공격 스테이지(blank_3) + 룰렛(blank_3_copy) 레이아웃 — Stage1Scene 의 STAGE/ROULETTE_LAYOUT_KEY·PATH 와 **동일해야 함**.
 *   본편 에셋과 같은 (검증된) 시작 로더 경로로 미리 받아 캐시에 확보 → 레이드 시 Stage1 이 즉시 렌더(스테일/레이스로 인한
 *   "STAGE 1 / TAP TO CONTINUE" 폴백 방지). 키/경로가 Stage1Scene 과 어긋나면 안 됨(직접 import 하면 순환 import TDZ 위험이라 인라인).
 */
const STAGE1_LAYOUT_KEY = 'stage1_layout';
const STAGE1_LAYOUT_PATH = 'ui/layouts/blank_3.json';
const ROULETTE1_LAYOUT_KEY = 'roulette1_layout';
const ROULETTE1_LAYOUT_PATH = 'ui/layouts/blank_3_copy.json';

/** 진행바 0→100% 최소 표시 시간(ms) — 즉시 로드(캐시)돼도 이 속도로 차오르게 한다. */
const BAR_MIN_MS = 700;
/** 로딩 완료 후 다음 화면(lobby)으로 넘어갈 때 페이드 시간(ms). */
const FADE_MS = 300;
/** 배경 채움색(#1A1030) — FIT 레터박스 영역 + 페이드 색. */
const BG_RGB = [0x1a, 0x10, 0x30] as const;

export class LoadScene extends Phaser.Scene {
  constructor() {
    super('load');
  }

  preload(): void {
    this.cameras.main.setBackgroundColor('#1A1030');
    // 1단계: 로딩 화면 레이아웃(JSON)만 먼저 받아 어떤 이미지를 띄울지 알아낸다.
    this.load.json(SPLASH_LAYOUT_KEY, SPLASH_LAYOUT_PATH);
  }

  create(): void {
    const doc = this.cache.json.get(SPLASH_LAYOUT_KEY) as LayoutDoc | undefined;
    if (!doc || !Array.isArray(doc.nodes) || doc.nodes.length === 0) {
      // 레이아웃을 못 읽으면 로딩 화면 없이 곧장 본편 적재로 진행(게임은 막지 않는다).
      this.beginHeavyLoad(null, null, null);
      return;
    }
    // 2단계: 로딩 화면이 쓰는 이미지(배경/캐릭터/로고/로딩바 홈)를 받는다.
    let queued = 0;
    for (const n of doc.nodes) {
      if (n.type === 'image' && n.key && !this.textures.exists(n.key)) {
        this.load.image(n.key, uploadPath(n.key));
        queued++;
      }
    }
    const onReady = (): void => void this.showSplash(doc);
    if (queued > 0) {
      this.load.once(Phaser.Loader.Events.COMPLETE, onReady);
      this.load.start();
    } else {
      onReady();
    }
  }

  /** 로딩 화면 렌더 + 본편 에셋 적재 시작. */
  private async showSplash(doc: LayoutDoc): Promise<void> {
    // 한글 폰트 선로딩(상태문구/저작권이 또렷하게) — 실패해도 진행.
    await preloadKoreanFonts();
    if (!this.scene.isActive()) return; // 폰트 대기 중 씬이 떠났으면 중단

    const progressNode = doc.nodes.find((n) => (n as MetaNode).role === 'progress') as MetaNode | undefined;
    const statusNode = doc.nodes.find((n) => (n as MetaNode).binding === 'loadStatus');

    // 진행바 사각형은 폭을 매 프레임 직접 구동하므로 정적 생성에서 제외하고, 나머지는 에디터대로 렌더.
    const index = buildLayout(this, doc, { skip: (n) => !!progressNode && n.id === progressNode.id });

    const statusText = statusNode ? index.tryById<Phaser.GameObjects.Text>(statusNode.id) ?? null : null;
    const fill = progressNode ? this.add.graphics().setDepth(progressNode.depth ?? 6) : null;

    this.beginHeavyLoad(progressNode ?? null, fill, statusText);
  }

  /** 무거운 본편 에셋 + 로비 이미지를 적재하고, 진행바/상태문구를 로더 진행률에 묶는다. */
  private beginHeavyLoad(
    progressNode: MetaNode | null,
    fill: Phaser.GameObjects.Graphics | null,
    statusText: Phaser.GameObjects.Text | null,
  ): void {
    loadGameAssets(this);
    // 로비 레이아웃 JSON 도 미리 받아두면 lobby 전환이 끊김 없이 즉시 렌더된다(로비 이미지는 매니페스트로 적재됨).
    if (!this.cache.json.exists(LOBBY_LAYOUT_KEY)) this.load.json(LOBBY_LAYOUT_KEY, LOBBY_LAYOUT_PATH);
    // ⭐레이드/공격 스테이지 + 룰렛 레이아웃도 시작 시 선로딩 — 레이드 때 Stage1 이 즉시 렌더(폴백 방지). 이미지는 Stage1 진입 시 적재.
    if (!this.cache.json.exists(STAGE1_LAYOUT_KEY)) this.load.json(STAGE1_LAYOUT_KEY, STAGE1_LAYOUT_PATH);
    if (!this.cache.json.exists(ROULETTE1_LAYOUT_KEY)) this.load.json(ROULETTE1_LAYOUT_KEY, ROULETTE1_LAYOUT_PATH);

    let target = 0; // 실제 로더 진행률(단조 증가)
    let displayed = 0; // 화면 표시 진행률(최소 BAR_MIN_MS 속도로 추종)
    let loaded = false;
    let done = false;

    const onProgress = (v: number): void => {
      target = Math.max(target, v); // 도중 파일이 추가(매니페스트)돼 분모가 늘어도 뒤로 가지 않게
    };
    this.load.on(Phaser.Loader.Events.PROGRESS, onProgress);
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      target = 1;
      loaded = true;
    });

    const fillColor =
      progressNode ? Phaser.Display.Color.HexStringToColor(progressNode.fill ?? '#ffc800').color : 0xffc800;
    const drawFill = (p: number): void => {
      if (!fill || !progressNode) return;
      fill.clear();
      const w = progressNode.w ?? 0;
      const h = progressNode.h ?? 0;
      const fw = w * p;
      if (fw <= 0) return;
      const left = progressNode.x - w / 2;
      const top = progressNode.y - h / 2;
      const rad = Math.min(progressNode.radius ?? 0, fw / 2, h / 2);
      fill.fillStyle(fillColor, 1);
      fill.fillRoundedRect(left, top, fw, h, rad);
    };

    const onUpdate = (_t: number, dt: number): void => {
      if (done) return;
      displayed = Math.min(target, displayed + dt / BAR_MIN_MS);
      drawFill(displayed);
      statusText?.setText(`리소스를 불러오는 중… ${Math.round(displayed * 100)}%`);
      if (loaded && displayed >= 1) {
        done = true;
        this.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
        this.load.off(Phaser.Loader.Events.PROGRESS, onProgress);
        this.finish();
      }
    };
    this.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);

    this.load.start();
  }

  private finish(): void {
    this.cameras.main.fadeOut(FADE_MS, BG_RGB[0], BG_RGB[1], BG_RGB[2]);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('lobby');
    });
  }
}
