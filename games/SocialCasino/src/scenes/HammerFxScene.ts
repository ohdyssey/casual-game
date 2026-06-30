/**
 * HammerFxScene — 공격/약탈 발동 시 **임팩트 망치 + 커튼 전환 연출**(단일 망치 이미지 + 좌우 커튼 2장).
 *
 * 연출(요청 2026-06-26): 퍼즐·슬롯 매칭이 모두 끝나고 → 공격 스테이지로 넘어가는 흐름에 **연결**되는 컷씬.
 *   ① 보드 위에서 망치가 **확대 팝(Back) + 임팩트 셰이크 + 뒷 배경(글로우+햇살)** 으로 등장(회전 없음: 펄스+미세 흔들림).
 *   ② **동시에 커튼**(좌/우 2장)이 화면 밖에서 **좌우로 닫혀**(sweep in) 보드를 덮는다 — 망치는 커튼 **앞**(항상 보임).
 *   ③ 커튼이 닫힌 사이 PlayScene 이 **Stage1 을 커튼 뒤에서 띄운다(skipReveal=자체 찢기 생략)**.
 *   ④ 커튼이 **좌우로 열리면서**(sweep out) Stage1(공격 스테이지)을 드러낸다 = "스테이지로 이동".
 *   ⑤ 망치는 스테이지 위에서 **아래로 약간 축소되며 페이드아웃**해 소멸 → 씬 종료.
 *
 * 이 씬은 **최상위 오버레이**(update 마다 bringToTop). 커튼(depth5) < 망치 묶음 root(depth10). 커튼은 화면 절대좌표라
 *   root 의 등장/소멸 스케일과 무관(별도 오브젝트). 이미지/크기는 디자이너 main.json 노드(망치 up_SC_UI_49,
 *   커튼 up_SC_UI_50-1/2) 단일 출처(정적 렌더선 skip). (이전 24프레임 spriteDocClip → 단일 이미지 교체.)
 */
import Phaser from 'phaser';
import { DESIGN_W, DESIGN_H } from './PlayScene.js';
import { UI_LAYOUT_KEY, uploadPath } from '../assets.js';
import { buildAttackBanner, type AttackKind } from '../ui/attackBanner.js';
import type { LayoutDoc, LayoutNode } from '../ui/layoutLoader.js';

/** 단일 망치 이미지 + 커튼 2장 — 디자이너가 main.json image 노드로 배치/저장. */
export const HAMMER_IMAGE_KEY = 'up_SC_UI_49';
export const CURTAIN_LEFT_KEY = 'up_SC_UI_50-1';
export const CURTAIN_RIGHT_KEY = 'up_SC_UI_50-2';

/** PlayScene 이 scene.launch 로 넘기는 데이터. */
export interface HammerFxLaunchData {
  readonly type?: AttackKind;
  readonly mult?: number; // 배너 "×N"(발동 파워)
  readonly x?: number; // 텍스트/망치 중심 x(배너 중심)
  readonly y?: number; // 텍스트/망치 중심 y(배너 중심)
}

/** 종류별 강조색(공격 빨강 / 약탈 골드) — 배경 글로우·햇살 틴트. */
const COLOR_NUM: Record<AttackKind, number> = { attack: 0xff5252, raid: 0xffc23d };

/** 커튼이 완전히 열려 **스테이지가 드러난 순간** game.events 로 알린다 → Stage1 이 받아 룰렛 연출을 시작(0.7초 뒤). */
export const STAGE_REVEALED_EVENT = 'raid:stage-revealed';

// 깊이: 커튼(뒤) < 망치 묶음(앞).
const CURTAIN_DEPTH = 5;
const ROOT_DEPTH = 10;

// 망치 타이밍/모션.
const PULSE_MS = 440; // 확대축소 펄스 반주기
const SHAKE_MS = 90; // 미세 좌우 흔들림 반주기
const SHAKE_PX = 5; // 흔들림 진폭(px)
const ENTRANCE_MS = 230; // 확대 팝 등장 — 스피드업: 320→230
// ⭐망치는 **커튼이 열리기(스테이지 등장) 전에 소멸** → "퍼즐 게임에서 종료"(요청). ON_STAGE_DELAY+EXIT_MS < CURTAIN_OPEN_AT 유지.
const ON_STAGE_DELAY = 420; // 등장 후 이만큼 보였다가 소멸 시작 — 스피드업: 600→420
const EXIT_MS = 420; // 아래로 축소+페이드 소멸 → 끝나면 ~840ms (커튼 열림 950 전에 종료) — 스피드업: 600→420
const EXIT_SCALE = 0.65; // 약간 축소
const EXIT_DROP = 150; // 아래로
// ⭐텍스트(ATTACK!/RAID!)는 **망치보다 먼저** 사라진다(요청 2026-06-28): 망치 연출이 떠 있는 동안 텍스트가 먼저 페이드아웃 →
//   이어서 망치 소멸(ON_STAGE_DELAY~EXIT_MS) → 커튼 열림으로 화면전환. TEXT_EXIT_DELAY+TEXT_EXIT_MS ≤ ON_STAGE_DELAY 유지.
const TEXT_EXIT_DELAY = 240; // 등장 후 이만큼 보였다가 페이드 시작
const TEXT_EXIT_MS = 180; // 페이드아웃(끝 ~420 ≈ 망치 exit 시작) → 텍스트가 먼저 소멸

// 커튼 타이밍/지오메트리. ⚠️ PlayScene 의 Stage1 launch(STAGE_BEHIND_CURTAIN_MS) 는 [CURTAIN_CLOSE_MS, CURTAIN_OPEN_AT]
//   사이여야 닫힌 커튼 뒤에서 Stage1 이 떠 가려진다(열림이 곧 등장). 패널 폭 ~552 로 화면(1080) 닫으면 가운데 겹침.
const CURTAIN_CLOSE_MS = 210; // 좌우에서 닫히는 시간(등장, 망치 뒤에서) — 스피드업: 300→210
const CURTAIN_OPEN_AT = 950; // 열기 시작 — 망치 소멸(~840) 후. 닫힌 채 hold 하며 그 사이 Stage1 이 뒤에 뜸. — 스피드업: 1300→950
const CURTAIN_OPEN_MS = 380; // 좌우로 열리는 시간(스테이지 드러냄) → 완료 시 STAGE_REVEALED_EVENT — 스피드업: 540→380
// ⚠️ CURTAIN_Y(=DESIGN_H/2)는 **모듈 평가 시점에 계산 금지** — PlayScene↔HammerFxScene 순환 import 라 그 시점 DESIGN_H 는
//   TDZ(초기화 전)라 ReferenceError 로 번들 전체가 안 뜬다. 런타임(makeCurtain)에서 DESIGN_H/2 로 계산한다.
const LEFT_CLOSED_X = 270; // 닫힘: 오른쪽 끝이 화면 중앙 너머(겹침)
const LEFT_OPEN_X = -290; // 열림: 화면 왼쪽 밖
const RIGHT_CLOSED_X = 810;
const RIGHT_OPEN_X = 1370;
const CURTAIN_W = 552; // 폴백 표시 크기(노드 없을 때)
const CURTAIN_H = 2440;

export class HammerFxScene extends Phaser.Scene {
  private root?: Phaser.GameObjects.Container; // 망치 묶음(배경+망치) — 등장/소멸 트랜스폼 단위
  private text?: Phaser.GameObjects.Container; // 발동 텍스트(ATTACK!/RAID!) — root 와 분리(망치보다 먼저 소멸)
  private curtains: Phaser.GameObjects.Image[] = []; // 좌/우 커튼 패널

  constructor() {
    super('hammerfx');
  }

  preload(): void {
    for (const key of [HAMMER_IMAGE_KEY, CURTAIN_LEFT_KEY, CURTAIN_RIGHT_KEY]) {
      if (!this.textures.exists(key)) this.load.image(key, uploadPath(key)); // 보통 매니페스트로 캐시됨 — 방어적
    }
  }

  create(data: HammerFxLaunchData): void {
    this.curtains = [];
    this.scene.bringToTop(); // 최상위(보드·전환·스테이지 위)
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)'); // 투명 — 뒤 보드/스테이지가 비친다

    const cx = data.x ?? DESIGN_W / 2;
    const cy = data.y ?? DESIGN_H / 2;
    const type: AttackKind = data.type ?? 'attack';
    const colorNum = COLOR_NUM[type];

    // ── 커튼(뒤, 화면 절대좌표) — 좌우에서 닫혀 보드를 덮었다가(등장) 좌우로 열려 스테이지를 드러냄 ──
    //   오른쪽 패널 열림 완료 시 revealAndStop(스테이지 드러남 알림 + 씬 종료). 좌우 동시에 끝나므로 한쪽에만 단다.
    const left = this.makeCurtain(CURTAIN_LEFT_KEY, LEFT_CLOSED_X, LEFT_OPEN_X);
    const right = this.makeCurtain(CURTAIN_RIGHT_KEY, RIGHT_CLOSED_X, RIGHT_OPEN_X, () => this.revealAndStop());
    this.curtains = [left, right].filter((c): c is Phaser.GameObjects.Image => !!c);

    // ── 망치 묶음(앞) — 커튼 위에 항상 보인다 ──
    const root = this.add.container(cx, cy).setDepth(ROOT_DEPTH);
    this.root = root;

    // 뒷 배경 이펙트(글로우 + 햇살 — 회전 없음, 맥동만).
    const glow = this.makeGlow(colorNum);
    root.add(glow);
    this.tweens.add({ targets: glow, alpha: { from: 0.45, to: 0.85 }, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const rays = this.makeRays(colorNum);
    root.add(rays);
    this.tweens.add({ targets: rays, scaleX: 1.06, scaleY: 1.06, duration: 760, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // 망치(회전 없음: 확대축소 펄스 + 미세 좌우 흔들림).
    const node = this.nodeByKey(HAMMER_IMAGE_KEY);
    if (this.textures.exists(HAMMER_IMAGE_KEY)) {
      const hammer = this.add.image(0, 0, HAMMER_IMAGE_KEY);
      if (node?.w && node?.h) hammer.setDisplaySize(node.w, node.h);
      root.add(hammer);
      const base = hammer.scaleX;
      this.tweens.add({ targets: hammer, scaleX: base * 1.07, scaleY: base * 1.07, duration: PULSE_MS, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.tweens.add({ targets: hammer, x: { from: -SHAKE_PX, to: SHAKE_PX }, duration: SHAKE_MS, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else if (import.meta.env?.DEV) {
      console.warn(`[hammerfx] 망치 이미지 미로드: ${HAMMER_IMAGE_KEY}`);
    }

    // 텍스트(망치 앞) — ⭐root(망치)와 **분리**: 망치보다 **먼저** 사라지게 한다(요청 2026-06-28:
    //   망치 연출 중 텍스트가 먼저 소멸 → 이어서 망치 소멸 → 커튼 열림으로 화면전환).
    const text = buildAttackBanner(this, type, Math.round(data.mult ?? 0))
      .setPosition(cx, cy)
      .setDepth(ROOT_DEPTH + 1)
      .setScale(0.25)
      .setAlpha(0);
    this.text = text;
    this.tweens.add({ targets: text, scaleX: 1, scaleY: 1, alpha: 0.85, duration: ENTRANCE_MS, ease: 'Back.easeOut' }); // 망치와 동시 팝인
    this.tweens.add({ targets: text, scaleX: 1.12, scaleY: 1.12, alpha: 0, delay: TEXT_EXIT_DELAY, duration: TEXT_EXIT_MS, ease: 'Quad.easeIn' }); // 망치보다 먼저 소멸

    // ① 등장: 확대 팝 + 임팩트 셰이크.
    root.setScale(0.25).setAlpha(0);
    this.tweens.add({ targets: root, scaleX: 1, scaleY: 1, alpha: 1, duration: ENTRANCE_MS, ease: 'Back.easeOut' });
    this.cameras.main.shake(180, 0.006);

    // ⑤ 망치는 **커튼이 열리기 전에**(퍼즐 게임 단계에서) 아래로 약간 축소되며 소멸(요청: 퍼즐 게임에서 종료).
    //   ⚠️ `delayedCall` 대신 delay 트윈(타이머가 안 먹는 환경에서도 트윈은 확실히 진행). 씬 종료는 커튼 열림(revealAndStop)이 담당.
    this.tweens.add({
      targets: root,
      scaleX: EXIT_SCALE,
      scaleY: EXIT_SCALE,
      y: cy + EXIT_DROP,
      alpha: 0,
      delay: ON_STAGE_DELAY,
      duration: EXIT_MS,
      ease: 'Quad.easeIn',
    });
    // 커튼이 없으면(이미지 미로드) 커튼 열림 콜백이 안 오므로 — 폴백으로 스테이지 알림 + 종료를 직접 예약(트윈 기반).
    if (this.curtains.length === 0) {
      this.tweens.add({ targets: root, alpha: 0, delay: CURTAIN_OPEN_AT + CURTAIN_OPEN_MS, duration: 1, onComplete: () => this.revealAndStop() });
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.root?.destroy();
      this.root = undefined;
      this.text?.destroy();
      this.text = undefined;
      for (const c of this.curtains) c.destroy();
      this.curtains = [];
    });

    if (import.meta.env?.DEV) (globalThis as Record<string, unknown>).__hammerfx = this;
  }

  /** 매 프레임 최상위 재확언 — Stage1 이 나중에 떠 bringToTop 해도 그 위(스테이지까지 연결)를 유지. 입력 오브젝트 없어 OK버튼 안 막음. */
  update(): void {
    this.scene.bringToTop();
  }

  /** 커튼 패널 1장 — 화면 밖(openX)에서 닫힘(closedX)으로 sweep in(등장) → hold → 다시 openX 로 sweep out(열림=스테이지 드러냄).
   *  onOpenDone: 열림 트윈 완료 콜백(한 패널에만 달아 1회 호출 → 스테이지 드러남 알림 + 씬 종료). */
  private makeCurtain(key: string, closedX: number, openX: number, onOpenDone?: () => void): Phaser.GameObjects.Image | undefined {
    if (!this.textures.exists(key)) {
      if (import.meta.env?.DEV) console.warn(`[hammerfx] 커튼 이미지 미로드: ${key}`);
      return undefined;
    }
    const node = this.nodeByKey(key);
    const img = this.add.image(openX, DESIGN_H / 2, key).setDepth(CURTAIN_DEPTH); // 세로 중앙(풀 높이 패널) — 런타임 계산(순환 import TDZ 회피)
    img.setDisplaySize(node?.w ?? CURTAIN_W, node?.h ?? CURTAIN_H);
    this.tweens.add({ targets: img, x: closedX, duration: CURTAIN_CLOSE_MS, ease: 'Cubic.easeInOut' }); // 닫힘(등장)
    this.tweens.add({ targets: img, x: openX, delay: CURTAIN_OPEN_AT, duration: CURTAIN_OPEN_MS, ease: 'Cubic.easeInOut', onComplete: onOpenDone }); // 열림(스테이지로)
    return img;
  }

  /** 커튼이 완전히 열린 순간 — 스테이지 드러남 알림(Stage1 이 받아 룰렛 시작) + 망치 씬 종료. */
  private revealAndStop(): void {
    this.game.events.emit(STAGE_REVEALED_EVENT);
    this.scene.stop();
  }

  /** 부드러운 방사 글로우(동심원 누적으로 라디얼 그라데이션 근사). ⭐**화면 전체로** 퍼지게 크게(요청: 잘림 방지). */
  private makeGlow(colorNum: number): Phaser.GameObjects.Graphics {
    const g = this.add.graphics();
    const steps = 8;
    const maxR = 1400; // 보드 중앙 기준이라도 화면 끝까지 덮을 만큼 크게
    for (let i = steps; i >= 1; i--) {
      g.fillStyle(colorNum, 0.1);
      g.fillCircle(0, 0, (maxR * i) / steps);
    }
    return g;
  }

  /** 12갈래 햇살(중심에서 뻗는 삼각형) — 반투명 틴트. ⭐**화면 전체로** 뻗게 길게(요청: 햇살이 잘려보이지 않게). */
  private makeRays(colorNum: number): Phaser.GameObjects.Graphics {
    const g = this.add.graphics();
    const n = 12;
    const R = 1750; // 화면 대각(코너)보다 길게 → 사방으로 화면 밖까지 뻗음
    const half = Phaser.Math.DegToRad(6);
    g.fillStyle(colorNum, 0.16);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      g.fillTriangle(0, 0, Math.cos(a - half) * R, Math.sin(a - half) * R, Math.cos(a + half) * R, Math.sin(a + half) * R);
    }
    return g;
  }

  /** main.json(에디터 SSOT)에서 key 로 image 노드를 찾는다(표시 크기 출처). */
  private nodeByKey(key: string): LayoutNode | undefined {
    const doc = this.cache.json.get(UI_LAYOUT_KEY) as LayoutDoc | undefined;
    if (!doc || !Array.isArray(doc.nodes)) return undefined;
    return doc.nodes.find((n) => n.key === key);
  }
}
