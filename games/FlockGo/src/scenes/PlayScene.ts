/**
 * PlayScene — 양떼고 본편.
 *
 * 화면 크롬(배경·HUD·배너·부스터 버튼)은 에디터 main.json 이 SSOT(buildLayout 1:1 렌더),
 * 양떼 필드는 'field' 노드의 사각형을 기준으로 코드가 동적으로 그린다
 * — 디자이너가 에디터에서 노드를 옮기면 게임도 그대로 따라간다(노드 id 가 바인딩 계약).
 *
 * 규칙(돼지 탈출류):
 *   · 양을 탭 → 바라보는 방향으로 직진. 길이 트여 있으면 화면 밖으로 탈출(+코인).
 *   · 막혀 있으면 블로커에 쿵 부딪히고 **바로 뒤에 멈춘다**(steps-1 전진, 보드 확정).
 *   · 폭탄 양: 다른 양이 탈출할 때마다 카운트 1 감소, 0 이 되면 폭발 = 실패. 먼저 내보내자.
 *   · 전부 탈출시키면 스테이지 클리어 → 다음 스테이지(마릿수 증가).
 * 부스터: 제거(코인 30)·섞기(20, 방향 재배정 = 해결가능 복구)·전환(10, 탭한 양 180°).
 */
import Phaser from 'phaser';
import { loadGameAssets, preloadKoreanFonts, UI_LAYOUT_KEY } from '../assets.js';
import { buildLayout, type LayoutDoc, type LayoutIndex } from '../ui/layoutLoader.js';
import {
  applyExit,
  boosterRemove,
  flipDir,
  generateBoard,
  generateReferenceBoard,
  moveSheep,
  resolveTap,
  sheepById,
  shuffleDirs,
  BLOB_CY,
  FIELD_W,
  D_CELL,
} from '../logic/board.js';
import { mulberry32, type Rand } from '../logic/rng.js';
import type { Board } from '../logic/types.js';
import { ensurePuffTexture, SheepView, type FieldMetrics, type FlockBounds } from './sheepView.js';
import { showPopup } from './popups.js';

const SAVE_KEY = 'flockgo_save_v1';
const COIN_PER_SHEEP = 3;
/** 레퍼런스 고정 레벨(돼지게임 5스테이지 카피) 사용 — 배치·방향 스터디용(#2).
 *  ⚠️PO 확정: 이 레퍼런스 배치가 기준 — 절차 생성 전환은 PO 지시 전까지 금지(2026-07-08 원복). */
const USE_REFERENCE_LEVEL = true;
/** 마름모 격자 시각화(구조 확인용) — 양 1마리=2셀 구조를 명확히 보이게. */
const SHOW_GRID = true;
const COST = { remove: 30, shuffle: 20, swap: 10 } as const;

type BoosterMode = 'none' | 'remove' | 'swap';

interface SaveData {
  stage: number;
  coins: number;
}

function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<SaveData>;
      if (typeof p.stage === 'number' && typeof p.coins === 'number' && p.stage >= 1 && p.coins >= 0) {
        return { stage: Math.floor(p.stage), coins: Math.floor(p.coins) };
      }
    }
  } catch {
    /* 손상 세이브는 초기화 */
  }
  return { stage: 1, coins: 0 };
}

export class PlayScene extends Phaser.Scene {
  private layout!: LayoutIndex;
  private metrics!: FieldMetrics;
  private board!: Board;
  private views = new Map<number, SheepView>();
  private rand: Rand = mulberry32(Date.now() >>> 0);
  private save: SaveData = { stage: 1, coins: 0 };
  private mode: BoosterMode = 'none';
  private over = false;
  private paused = false;
  private msgTimer?: Phaser.Time.TimerEvent;
  private closePopup?: () => void;
  private fieldRect = { x: 540, y: 1350, w: 1000, h: 1520 };
  private gridGfx?: Phaser.GameObjects.Graphics;

  constructor() {
    super('play');
  }

  preload(): void {
    loadGameAssets(this);
  }

  create(): void {
    void preloadKoreanFonts();
    ensurePuffTexture(this);
    this.save = loadSave();

    const doc = (this.cache.json.get(UI_LAYOUT_KEY) ?? null) as LayoutDoc | null;
    if (!doc || !Array.isArray(doc.nodes) || doc.nodes.length === 0) {
      this.add
        .text(540, 1200, '레이아웃(main.json)이 비어 있습니다\n에디터에서 디자인을 저장해 주세요', {
          fontFamily: '"Jua", sans-serif',
          fontSize: '44px',
          color: '#ffffff',
          align: 'center',
        })
        .setOrigin(0.5);
      return;
    }
    this.layout = buildLayout(this, doc);
    this.hideDesignerSamples();
    this.bindField();
    this.bindHud();
    this.startStage(this.save.stage);
  }

  /** 에디터의 양 샘플 노드(각도·크기 레퍼런스)는 게임에선 숨긴다 — 문서는 보존(디자이너 참고용). */
  private hideDesignerSamples(): void {
    for (const e of this.layout.entries()) {
      const key = e.node.key ?? '';
      if (e.node.type === 'image' && (key.startsWith('up_Sheep01') || key.startsWith('up_FlockGo_Sheep'))) {
        e.obj.setVisible(false);
      }
    }
  }

  /** 'field' 노드 → 무리 기하(중심·스케일). 게임에선 가이드 사각형을 숨긴다(에디터에선 보임). */
  private bindField(): void {
    const node = this.layout.nodeById('field');
    const fx = node?.x ?? 540;
    const fy = node?.y ?? 1350;
    const fw = node?.w ?? 1000;
    const fh = node?.h ?? 1520;
    this.fieldRect = { x: fx, y: fy, w: fw, h: fh };
    this.layout.tryById('field')?.setAlpha(0);
    // 무리(블롭) 중심 = 필드 상단 BLOB_CY 지점, 스케일 = 필드폭/기준폭.
    this.metrics = {
      centerX: fx,
      centerY: fy - fh / 2 + fh * BLOB_CY,
      scale: fw / FIELD_W,
    };
  }

  /**
   * 보이지 않는 **마름모 격자** 시각화(디버그·구조 확인용). 격자 셀 = 화면 45° 다이아몬드,
   * 피치 = 0.707·D_CELL·scale. 양 1마리 = **인접 2셀(도미노)**을 차지한다(2:1). SHOW_GRID 로 토글.
   */
  private drawDiamondGrid(): void {
    this.gridGfx?.destroy();
    if (!SHOW_GRID) return;
    const g = this.add.graphics().setDepth(2);
    g.lineStyle(2, 0xdcf5d0, 0.15); // 더 옅은 녹색(PO 2026-07-08: 투명도 상향) — 필드에 은은하게 깔리는 가이드
    // 양이 앉는 격자 = 짝수셀 서브격자(대각 D_CELL 간격). 화면 x±y 좌표 피치 = √2·D_CELL.
    // → 다이아몬드 1칸 = 양 폭(1칸), 양 1마리 = 인접 2칸(도미노).
    const p = Math.SQRT2 * D_CELL * this.metrics.scale;
    const cx = this.metrics.centerX;
    const cy = this.metrics.centerY;
    const r = this.fieldRect;
    const x0 = r.x - r.w / 2;
    const x1 = r.x + r.w / 2;
    const y0 = r.y - r.h / 2;
    const y1 = r.y + r.h / 2;
    // 셀 경계는 격자점 사이(반칸 오프셋). 두 대각 직선족: x+y=K(기울기 -1), x−y=K(기울기 +1).
    const drawFam = (slopeNeg: boolean): void => {
      const base = slopeNeg ? cx + cy : cx - cy; // 격자점이 지나는 값
      const lo = slopeNeg ? x0 + y0 : x0 - y1;
      const hi = slopeNeg ? x1 + y1 : x1 - y0;
      const nLo = Math.floor((lo - base) / p) - 1;
      const nHi = Math.ceil((hi - base) / p) + 1;
      for (let n = nLo; n <= nHi; n++) {
        const K = base + (n + 0.5) * p; // 셀 경계(반칸 오프셋)
        if (slopeNeg) {
          // x+y=K, x∈[max(x0,K−y1), min(x1,K−y0)]
          const xa = Math.max(x0, K - y1);
          const xb = Math.min(x1, K - y0);
          if (xa <= xb) g.lineBetween(xa, K - xa, xb, K - xb);
        } else {
          // x−y=K, x∈[max(x0,K+y0), min(x1,K+y1)]
          const xa = Math.max(x0, K + y0);
          const xb = Math.min(x1, K + y1);
          if (xa <= xb) g.lineBetween(xa, xa - K, xb, xb - K);
        }
      }
    };
    drawFam(true);
    drawFam(false);
    this.gridGfx = g;
  }

  private bindHud(): void {
    const btn = (id: string, handler: () => void): void => {
      const obj = this.layout.tryById(id);
      if (!obj || !('setInteractive' in obj)) return;
      (obj as Phaser.GameObjects.Image).setInteractive({ useHandCursor: true });
      obj.on('pointerdown', () => {
        this.tweens.add({ targets: obj, scale: (obj as Phaser.GameObjects.Image).scale * 0.92, duration: 70, yoyo: true });
        handler();
      });
    };
    btn('hud_pause', () => this.openPause());
    btn('btn_remove', () => this.toggleBooster('remove'));
    btn('btn_swap', () => this.toggleBooster('swap'));
    btn('btn_shuffle', () => this.useShuffle());
  }

  // ── 스테이지 흐름 ───────────────────────────────────────────────

  private startStage(stage: number): void {
    this.over = false;
    this.mode = 'none';
    this.closePopup?.();
    this.closePopup = undefined;
    for (const v of this.views.values()) v.destroy();
    this.views.clear();
    this.drawDiamondGrid(); // 보이지 않는 마름모 격자 시각화(구조 확인용)

    // 레퍼런스 고정 레벨(돼지게임 5스테이지 실측 인스턴스)을 그대로 재현 — 위치는 REFERENCE_LEVEL
    // 의 정확한 디자인 offset 으로 posOverride 해 픽셀 배치를 보존, 방향은 실측 배정.
    if (USE_REFERENCE_LEVEL) {
      // 양 = 2셀 도미노 → renderCell(중점)에 렌더(SheepView 기본). 마름모 격자 위 규칙 배치.
      this.board = generateReferenceBoard();
      for (const s of this.board.sheep) {
        const view = new SheepView(this, s, this.metrics);
        view.onTap(() => this.onTapSheep(s.id));
        this.views.set(s.id, view);
      }
    } else {
      // 에디터 샘플(10마리)의 격자 구조를 기반으로 전체 무리를 절차 생성(대칭·균형·겹침 0).
      this.board = generateBoard(stage, this.rand);
      for (const s of this.board.sheep) {
        const view = new SheepView(this, s, this.metrics);
        view.onTap(() => this.onTapSheep(s.id));
        this.views.set(s.id, view);
      }
    }
    this.setText('hud_stage', `${stage}스테이지`);
    this.refreshHud();
    const hasBomb = this.board.sheep.some((s) => s.kind === 'bomb');
    this.showMsg(
      hasBomb
        ? '폭탄 양은 카운트가 다 되기 전에 먼저 탈출시키자!'
        : '양을 탭하면 바라보는 방향으로 달려가요!',
      4200,
    );
  }

  private onTapSheep(id: number): void {
    if (this.over || this.paused) return;
    const view = this.views.get(id);
    const sheep = sheepById(this.board, id);
    if (!view || !sheep || view.busy) return;

    if (this.mode === 'remove') {
      this.mode = 'none';
      this.board = boosterRemove(this.board, id);
      view.flyOff(() => this.disposeView(id));
      this.refreshHud();
      this.checkClear();
      return;
    }
    if (this.mode === 'swap') {
      this.mode = 'none';
      this.board = flipDir(this.board, id);
      const flipped = sheepById(this.board, id);
      if (flipped) view.turnTo(flipped.dir);
      this.showMsg('방향을 바꿨어요!', 1800);
      return;
    }

    const result = resolveTap(this.board, id);
    if (!result) return;
    if (result.kind === 'blocked') {
      // 충돌 → 블로커 **바로 뒤**까지 전진해 멈춘다(PO 2026-07-08, 출발지 복귀 금지).
      // 이동량 = steps-1: head 칸이 블로커 직전 빈칸에 닿아 코-꼬리 접촉(풋프린트 비겹침).
      const advance = Math.max(0, result.steps - 1);
      this.board = moveSheep(this.board, id, advance);
      const blocker = this.views.get(result.blockerId);
      view.bumpBlocked(sheep, advance, blocker, () => undefined);
      return;
    }

    // 탈출 — 보드는 지금 확정, 연출은 독립 트윈.
    const outcome = applyExit(this.board, id);
    this.board = outcome.board;
    this.save.coins += COIN_PER_SHEEP;
    this.persist();
    this.refreshHud();
    this.pulseCoinbar();
    for (const s of this.board.sheep) {
      if (s.kind === 'bomb') this.views.get(s.id)?.setFuse(s.fuse);
    }
    view.walkOut(sheep, result.steps, this.flockBounds(), () => this.disposeView(id));

    if (outcome.explodedIds.length > 0) {
      this.failByExplosion(outcome.explodedIds);
      return;
    }
    this.checkClear();
  }

  private disposeView(id: number): void {
    this.views.get(id)?.destroy();
    this.views.delete(id);
  }

  /** 남은 양들의 실제 화면 분포로 무리 경계(중심+반경)를 산출 — 탈출 우회 경로용. */
  private flockBounds(): FlockBounds {
    const cx = this.metrics.centerX;
    const cy = this.metrics.centerY;
    let r = 0;
    for (const v of this.views.values()) {
      r = Math.max(r, Phaser.Math.Distance.Between(v.container.x, v.container.y, cx, cy));
    }
    return { cx, cy, r };
  }

  private checkClear(): void {
    if (this.over || this.board.sheep.length > 0) return;
    this.over = true;
    const bonus = this.save.stage * 10;
    this.save.coins += bonus;
    this.save.stage += 1;
    this.persist();
    this.refreshHud();
    this.time.delayedCall(650, () => {
      this.closePopup = showPopup(this, {
        title: '스테이지 클리어!',
        subtitle: `모든 양이 무사히 탈출했어요\n보너스 +${bonus}코인`,
        showLogo: true,
        buttons: [{ label: '다음 스테이지', onClick: () => this.startStage(this.save.stage) }],
      });
    });
  }

  private failByExplosion(ids: ReadonlyArray<number>): void {
    this.over = true;
    for (const id of ids) {
      const v = this.views.get(id);
      if (!v) continue;
      const boom = this.add
        .circle(v.container.x, v.container.y, 20, 0xff5a2e, 0.9)
        .setDepth(60);
      this.tweens.add({
        targets: boom,
        radius: 170 * this.metrics.scale,
        alpha: 0,
        duration: 520,
        ease: 'Quad.easeOut',
        onComplete: () => boom.destroy(),
      });
    }
    this.cameras.main.shake(320, 0.012);
    this.cameras.main.flash(220, 255, 120, 60);
    this.time.delayedCall(750, () => {
      this.closePopup = showPopup(this, {
        title: '펑! 폭탄 양이 터졌어요',
        subtitle: '폭탄 양을 먼저 탈출시켜야 해요',
        buttons: [{ label: '다시 도전', onClick: () => this.startStage(this.save.stage) }],
      });
    });
  }

  // ── 부스터 ─────────────────────────────────────────────────────

  private toggleBooster(mode: Exclude<BoosterMode, 'none'>): void {
    if (this.over || this.paused) return;
    if (this.mode === mode) {
      this.mode = 'none';
      this.showMsg('취소했어요', 1200);
      return;
    }
    const cost = COST[mode];
    if (!this.spendCoins(cost, mode === 'remove' ? 'btn_remove' : 'btn_swap')) return;
    this.mode = mode;
    this.showMsg(mode === 'remove' ? '탈출시킬 양을 선택하세요!' : '방향을 바꿀 양을 선택하세요!', 5000);
  }

  private useShuffle(): void {
    if (this.over || this.paused) return;
    if (!this.spendCoins(COST.shuffle, 'btn_shuffle')) return;
    this.mode = 'none';
    this.board = shuffleDirs(this.board, this.rand);
    for (const s of this.board.sheep) this.views.get(s.id)?.turnTo(s.dir);
    this.showMsg('양들이 방향을 바꿨어요!', 2200);
  }

  /** 코인 차감 — 부족하면 버튼 흔들고 false. (부스터 진입 시점에 선차감) */
  private spendCoins(cost: number, btnId: string): boolean {
    if (this.save.coins < cost) {
      const obj = this.layout.tryById(btnId);
      if (obj) {
        this.tweens.add({ targets: obj, x: (obj as Phaser.GameObjects.Image).x + 10, duration: 45, yoyo: true, repeat: 3 });
      }
      this.showMsg(`코인이 부족해요 (필요: ${cost})`, 2000);
      return false;
    }
    this.save.coins -= cost;
    this.persist();
    this.refreshHud();
    return true;
  }

  // ── HUD ────────────────────────────────────────────────────────

  private setText(id: string, value: string): void {
    this.layout.tryById<Phaser.GameObjects.Text>(id)?.setText(value);
  }

  private refreshHud(): void {
    this.setText('hud_coin_text', String(this.save.coins));
    this.setText('rank_text', `양 ${this.board?.sheep.length ?? 0}마리`);
  }

  private pulseCoinbar(): void {
    const bar = this.layout.tryById('hud_coinbar');
    if (!bar) return;
    this.tweens.add({ targets: bar, scale: (bar as Phaser.GameObjects.Image).scale * 1.06, duration: 90, yoyo: true });
  }

  /** 안내 배너 — 문구 갱신 + 자동 페이드(에디터 배너/텍스트 노드 재사용). */
  private showMsg(text: string, autoHideMs: number): void {
    const banner = this.layout.tryById('banner_msg');
    const label = this.layout.tryById<Phaser.GameObjects.Text>('msg_text');
    if (!banner || !label) return;
    this.msgTimer?.remove();
    this.tweens.killTweensOf([banner, label]);
    label.setText(text);
    banner.setAlpha(1);
    label.setAlpha(1);
    this.msgTimer = this.time.delayedCall(autoHideMs, () => {
      this.tweens.add({ targets: [banner, label], alpha: 0, duration: 400 });
    });
  }

  private openPause(): void {
    if (this.over || this.paused) return;
    this.paused = true;
    const close = showPopup(this, {
      title: '일시정지',
      subtitle: `${this.save.stage}스테이지 진행 중`,
      buttons: [
        {
          label: '이어하기',
          onClick: () => {
            this.paused = false;
            close();
          },
        },
        {
          label: '다시하기',
          primary: false,
          onClick: () => {
            this.paused = false;
            close();
            this.startStage(this.save.stage);
          },
        },
      ],
    });
  }

  private persist(): void {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.save));
    } catch {
      /* 저장 실패는 치명 아님(시크릿 모드 등) */
    }
  }
}
