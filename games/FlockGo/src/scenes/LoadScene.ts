/**
 * LoadScene — 게임 로딩 화면("로딩", 에디터 blank.json).
 *
 * 디자이너가 에디터에 저작한 ui/layouts/blank.json(배경+로고)을 SSOT 로 렌더한다.
 * 본편(PlayScene) 에셋을 이 화면에서 미리 다 받아두고, **스타트 버튼 없이** 잠깐 보여준 뒤
 * 바로 play 씬으로 넘어간다(PO 지시 2026-07-08).
 */
import Phaser from 'phaser';
import { loadGameAssets, preloadKoreanFonts } from '../assets.js';
import { buildLayout, type LayoutDoc, type LayoutNode } from '../ui/layoutLoader.js';

/** 게임 실제 디자인 해상도(game.ts designWidth/designHeight 와 동일해야 함). */
const GAME_W = 1080;
const GAME_H = 2400;

/**
 * blank.json 은 에디터 '빈 화면' 기본 템플릿 크기(720×1600)로 저장돼, 실제 게임 캔버스
 * (1080×2400)보다 작다 — buildLayout 은 노드 좌표를 그대로(스케일 없이) 쓰므로 문서 크기가
 * 다르면 화면 왼쪽 위에 작게 몰려 렌더된다. 두 비율이 동일(0.45)하므로 균일 배율로 늘려
 * 채운다(디자인이 게임 해상도로 재저장되면 배율은 자연히 1이 된다).
 */
function fitToGameSize(doc: LayoutDoc): LayoutDoc {
  const sx = GAME_W / doc.frame.designW;
  const sy = GAME_H / doc.frame.designH;
  if (Math.abs(sx - 1) < 0.001 && Math.abs(sy - 1) < 0.001) return doc;
  const scaleNode = (n: LayoutNode): LayoutNode => ({
    ...n,
    x: n.x * sx,
    y: n.y * sy,
    w: n.w !== undefined ? n.w * sx : n.w,
    h: n.h !== undefined ? n.h * sy : n.h,
  });
  return { frame: { designW: GAME_W, designH: GAME_H }, nodes: doc.nodes.map(scaleNode) };
}

export const LOADING_LAYOUT_KEY = 'loading_layout';
export const LOADING_LAYOUT_PATH = 'ui/layouts/blank.json';

/** 로딩 화면 최소 노출 시간(ms) — 에셋이 캐시로 즉시 끝나도 깜빡임 없이 이만큼은 보여준다. */
const MIN_SHOW_MS = 700;
/** 다음 화면(play)으로 넘어갈 때 페이드 시간(ms). */
const FADE_MS = 250;

export class LoadScene extends Phaser.Scene {
  constructor() {
    super('load');
  }

  preload(): void {
    this.cameras.main.setBackgroundColor('#7CC24A');
    this.load.json(LOADING_LAYOUT_KEY, LOADING_LAYOUT_PATH);
    // 본편(PlayScene) 에셋을 여기서 미리 다 받아둔다 — play 진입이 끊김 없이 즉시 이뤄진다.
    loadGameAssets(this);
  }

  create(): void {
    void this.showLoading();
  }

  private async showLoading(): Promise<void> {
    await preloadKoreanFonts();
    if (!this.scene.isActive()) return; // 폰트 대기 중 씬이 떠났으면 중단

    const doc = this.cache.json.get(LOADING_LAYOUT_KEY) as LayoutDoc | undefined;
    if (doc && Array.isArray(doc.nodes) && doc.nodes.length > 0) {
      buildLayout(this, fitToGameSize(doc));
    }
    this.time.delayedCall(MIN_SHOW_MS, () => this.finish());
  }

  private finish(): void {
    this.cameras.main.fadeOut(FADE_MS, 0x7c, 0xc2, 0x4a);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('play');
    });
  }
}
