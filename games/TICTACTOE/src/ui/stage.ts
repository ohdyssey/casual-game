/**
 * 무대(Stage) — 에디터가 저작한 배경·보드·로고·조명을 게임 화면에 세우고, 공연장 조명을 연출한다.
 *
 * 배치의 원본은 `public/ui/layouts/main.json` 이다(메뉴 화면과 같은 문서).
 * 게임 화면은 그중 **배경·플레이보드·로고·조명** 노드만 가져다 쓴다 — 버튼은 메뉴 전용.
 *
 * ⚠️ 보드가 배경에서 분리되면서(2026-08-05 에디터 개편) 셀 좌표는 **보드 노드의 사각형**에서
 * 나온다. 보드 이미지(548×548 원본)의 격자를 실측해 비율로 굳혀 뒀으므로, 에디터에서 보드를
 * 옮기거나 키워도 셀이 따라간다.
 */
import Phaser from 'phaser';
import type { LayoutDoc, LayoutNode } from '../assets.js';

/** 에디터 노드 id — `.pue-harness/generated/screens.js` 의 NODES.MAIN 과 같다. */
export const STAGE_NODE = {
  BG: 'layer_1',
  BOARD: 'layer_4',
  LOGO: 'layer_5',
  LIGHT_BLUE: 'layer_6',
  LIGHT_RED: 'layer_6_copy',
} as const;

interface StageNode {
  x: number;
  y: number;
  w: number;
  h: number;
  key: string;
  /** 저작 회전(도). 조명 연기는 이 각도로 뻗는다. */
  angle: number;
  alpha: number;
}

/** 저작 문서를 못 읽었을 때 쓰는 기본 배치(에디터 저작값과 동일). */
const FALLBACK: Record<string, StageNode> = {
  [STAGE_NODE.BG]: { x: 540, y: 1200, w: 1080, h: 2400, key: 'up_TTT_BG_01-1', angle: 0, alpha: 1 },
  [STAGE_NODE.BOARD]: { x: 540, y: 973, w: 897, h: 897, key: 'up_TTT_BG_01-3', angle: 0, alpha: 0.9 },
  [STAGE_NODE.LOGO]: { x: 540, y: 425, w: 870, h: 333, key: 'up_TTT_BG_01-2', angle: 0, alpha: 0.9 },
  [STAGE_NODE.LIGHT_BLUE]: { x: 732, y: 572, w: 255, h: 954, key: 'up_Homerun_BG_Loby_01-2', angle: -150, alpha: 1 },
  [STAGE_NODE.LIGHT_RED]: { x: 332, y: 546, w: 255, h: 882, key: 'up_Homerun_BG_Loby_01-1', angle: 150, alpha: 1 },
};

/**
 * 보드 이미지(548×548) 안에서 3×3 셀 중심이 차지하는 비율 — PNG 픽셀 실측값.
 *   네온 테두리 41/498, 안쪽 벽 56/483, 격자선 198/342(가로) · 192/337(세로)
 */
const CELL_FX = [0.2318, 0.4927, 0.7527] as const;
const CELL_FY = [0.2253, 0.4827, 0.7482] as const;
/** 셀 한 변이 보드에서 차지하는 비율(격자 간격 ≈ 142/548). */
const CELL_FSIZE = 0.259;

export interface StageGeometry {
  /** 셀 중심(캔버스 좌표). */
  readonly cellCenter: (cell: number) => { x: number; y: number };
  /** 셀 한 변(px). */
  readonly cellSize: number;
  /** 보드 사각형(캔버스 좌표, 중심 기준). */
  readonly board: { x: number; y: number; w: number; h: number };
}

function nodeOf(doc: LayoutDoc | undefined, id: string): StageNode {
  const fb = FALLBACK[id];
  const n: LayoutNode | undefined = doc?.nodes?.find((v) => v.id === id);
  return {
    x: n?.x ?? fb.x,
    y: n?.y ?? fb.y,
    w: n?.w ?? fb.w,
    h: n?.h ?? fb.h,
    key: n?.key ?? fb.key,
    angle: n?.angle ?? fb.angle,
    alpha: n?.alpha ?? fb.alpha,
  };
}

/** 보드 사각형에서 셀 기하를 만든다(에디터 저작값이든 폴백이든 같은 계산). */
function geometryOf(board: { x: number; y: number; w: number; h: number }): StageGeometry {
  return {
    board: { ...board },
    cellSize: board.w * CELL_FSIZE,
    cellCenter: (cell: number) => ({
      x: board.x - board.w / 2 + CELL_FX[cell % 3] * board.w,
      y: board.y - board.h / 2 + CELL_FY[Math.floor(cell / 3)] * board.h,
    }),
  };
}

/** 무대를 세우기 전에도 셀 좌표가 필요할 때 쓰는 기본 기하(저작 기본값 기준). */
export function fallbackGeometry(): StageGeometry {
  const b = FALLBACK[STAGE_NODE.BOARD];
  return geometryOf({ x: b.x, y: b.y, w: b.w, h: b.h });
}

/** 플레이 화면 HUD 텍스트 노드 id(에디터 "플레이화면" 문서). */
export const HUD_NODE = {
  /** 상단 — 등급/스터디 진행. */
  BADGE: 'layer_7',
  /** 하단 — 통산 전적. */
  RECORD: 'layer_7_copy',
  /** 하단 — 승패 규칙 한 줄. */
  RULE: 'layer_7_copy2',
} as const;

/** 저작 텍스트 노드의 자리·모양 그대로 Text 를 만든다(문구는 런타임에 갈아끼운다). */
export function makeAuthoredText(
  scene: Phaser.Scene,
  doc: LayoutDoc | undefined,
  id: string,
  fallback: { x: number; y: number; fontSize: number; color: string },
): Phaser.GameObjects.Text {
  const n = doc?.nodes?.find((v) => v.id === id);
  const size = n?.fontSize ?? fallback.fontSize;
  const txt = scene.add
    .text(n?.x ?? fallback.x, n?.y ?? fallback.y, '', {
      // 폰트 가족은 게임 공통(Jua)로 통일한다 — 저작 문서의 자리·크기·색만 따른다.
      fontFamily: 'Jua, sans-serif',
      fontSize: `${size}px`,
      color: n?.color ?? fallback.color,
      align: 'center',
    })
    .setOrigin(0.5)
    .setDepth(10);
  txt.setStroke('#0A0714', Math.max(4, Math.round(size * 0.18)));
  txt.setShadow(2, 2, 'rgba(0,0,0,0.45)', 3, false, true);
  return txt;
}

/** 조명 한 쪽(파랑/빨강) — 평소엔 숨어 있다가 공격 때 터져 나온다. */
export class StageLight {
  private readonly scene: Phaser.Scene;
  private readonly img: Phaser.GameObjects.Image;
  /** 원래 표시 크기(터질 때 이 값을 기준으로 늘렸다 줄인다). */
  private readonly baseW: number;
  private readonly baseH: number;
  private burst?: Phaser.Tweens.TweenChain;

  constructor(scene: Phaser.Scene, node: StageNode, depth: number) {
    this.scene = scene;
    this.baseW = node.w;
    this.baseH = node.h;
    // 저작 각도 그대로 세운다. 연기는 원본에서 **아래→위**로 뻗으므로 아래변(노즐)을 축으로
    // 잡아야 "조명 위치에서 터져 나오는" 연출이 된다. 노즐 좌표 = 저작 중심에서 각도만큼
    // 회전한 아래변 중점 — 이렇게 하면 다 자란 순간 저작 사각형과 정확히 겹친다.
    const rad = Phaser.Math.DegToRad(node.angle);
    const nozzleX = node.x - (node.h / 2) * Math.sin(rad);
    const nozzleY = node.y + (node.h / 2) * Math.cos(rad);
    this.img = scene.add
      .image(nozzleX, nozzleY, node.key)
      .setOrigin(0.5, 1)
      .setDisplaySize(node.w, node.h)
      .setAngle(node.angle)
      .setDepth(depth)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0)
      .setVisible(false);
  }

  /** 조명이 터져 연기가 뻗어 올라갔다가 흩어진다. */
  flash(): void {
    if (!this.img.active) return;
    this.burst?.stop();
    this.img.setVisible(true).setAlpha(0).setDisplaySize(this.baseW * 0.55, this.baseH * 0.1);

    // ① 터짐 — 아래에서 위로 확 뻗는다  ② 퍼짐 — 옆으로 번지며 흐려진다  ③ 소멸
    this.burst = this.scene.tweens.chain({
      targets: this.img,
      tweens: [
        {
          displayWidth: this.baseW * 1.15,
          displayHeight: this.baseH * 1.02,
          alpha: 0.95,
          duration: 190,
          ease: 'Quart.Out',
        },
        {
          displayWidth: this.baseW * 1.45,
          displayHeight: this.baseH * 1.12,
          alpha: 0.45,
          duration: 320,
          ease: 'Sine.Out',
        },
        {
          displayWidth: this.baseW * 1.7,
          alpha: 0,
          duration: 420,
          ease: 'Cubic.In',
          onComplete: () => this.img.active && this.img.setVisible(false),
        },
      ],
    });
  }

  /** 판 정리 — 연출을 끊고 다시 숨긴다. */
  reset(): void {
    this.burst?.stop();
    this.burst = undefined;
    if (!this.img.active) return;
    this.scene.tweens.killTweensOf(this.img);
    this.img.setAlpha(0).setVisible(false).setDisplaySize(this.baseW, this.baseH);
  }
}

export interface Stage {
  readonly geometry: StageGeometry;
  readonly lights: { blue: StageLight; red: StageLight };
}

/**
 * BGM 한 박(ms) — audio.ts 의 120BPM 8분음표(0.25s) 기준 **4분음표 = 0.5초**.
 * 배경 네온이 이 박에 맞춰 "쿵짝쿵짝" 뛴다.
 */
const BEAT_MS = 500;

/**
 * 배경 네온 비트 — "쿵짝쿵짝". 배경 이미지 자체의 밝기를 한 박마다 살짝 흔들어
 * 네온사인이 음악에 맞춰 뛰는 것처럼 보이게 한다(강박은 크게, 약박은 작게).
 *
 * ⚠️ 코드로 그리던 **뒤 조명 워시는 제거**했다(2026-08-05 유저 확정 — 전용 이미지를
 * 따로 받기로 함). 지금은 별도 레이어 없이 배경 밝기만 건드린다.
 */
function startBeat(scene: Phaser.Scene, bg?: Phaser.GameObjects.Image): void {
  if (!bg) return;
  let beat = 0;
  scene.time.addEvent({
    delay: BEAT_MS,
    loop: true,
    callback: () => {
      if (!bg.active) return;
      const strong = beat % 2 === 0; // 쿵(강) / 짝(약)
      beat++;
      scene.tweens.killTweensOf(bg);
      bg.setAlpha(1);
      scene.tweens.add({
        targets: bg,
        alpha: strong ? 0.86 : 0.94,
        duration: strong ? 80 : 100,
        yoyo: true,
        ease: 'Quad.Out',
      });
    },
  });
}

/**
 * 게임 화면의 무대를 세운다 — 배경 → 조명 워시 → 조명(숨김) → 보드 → 로고.
 * 깊이 0~4 를 쓴다(말 5, 캐릭터 6, HUD 10 위로).
 */
export function buildStage(scene: Phaser.Scene, doc: LayoutDoc | undefined): Stage {
  const bg = nodeOf(doc, STAGE_NODE.BG);
  const board = nodeOf(doc, STAGE_NODE.BOARD);
  const logo = nodeOf(doc, STAGE_NODE.LOGO);
  const blue = nodeOf(doc, STAGE_NODE.LIGHT_BLUE);
  const red = nodeOf(doc, STAGE_NODE.LIGHT_RED);

  const put = (n: StageNode, depth: number): Phaser.GameObjects.Image | undefined => {
    if (!scene.textures.exists(n.key)) return undefined;
    return scene.add
      .image(n.x, n.y, n.key)
      .setDisplaySize(n.w, n.h)
      .setAngle(n.angle)
      .setAlpha(n.alpha)
      .setDepth(depth);
  };

  const bgImg = put(bg, 0);
  startBeat(scene, bgImg);
  const lights = {
    blue: new StageLight(scene, blue, 2),
    red: new StageLight(scene, red, 2),
  };
  put(board, 3);
  put(logo, 4);

  return { geometry: geometryOf(board), lights };
}
