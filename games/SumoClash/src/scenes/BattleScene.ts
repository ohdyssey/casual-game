/**
 * BattleScene — 레인 디펜스 본편 오케스트레이터.
 *   에디터 레이아웃(main.json)을 단일 진실 공급원으로 렌더하고, 그 위에
 *   순수 시뮬레이션(logic/battle)을 결선한다:
 *     입력(덱/출발점/스킬 탭) → logic 명령 → 새 BattleState → view/hud 동기화.
 *   디자인이 비어 있으면 구획 자리표시자를 그린다(에디터 배치 가이드).
 */
import Phaser from 'phaser';
import { GAME_WIDTH } from '@casual/core';
import { NODES } from '../../.pue-harness/generated/screens.js';
import { LAYOUT_KEY } from '../assets.js';
import { buildLayout, type LayoutDoc, type LayoutIndex } from '../ui/layoutLoader.js';
import { LANE_COUNT, MANA_MAX, type AbilityKind, type BattleState } from '../logic/types.js';
import { ABILITY_ORDER, ABILITY_SPECS, DECK_ORDER, STAGE_1, UNIT_SPECS } from '../logic/roster.js';
import { createBattle, currentNext, placeUnit, reorderQueue, tick } from '../logic/battle.js';
import { castAbility } from '../logic/abilities.js';
import { BattleView } from './battleView.js';
import { Hud } from '../ui/hud.js';
import { Deck } from '../ui/deck.js';
import { SkillBar } from '../ui/skillBar.js';
import { sfx, startBgm, stopBgm } from '../audio.js';

export class BattleScene extends Phaser.Scene {
  private state!: BattleState;
  private view: BattleView | null = null;
  private hud: Hud | null = null;
  private deck: Deck | null = null;
  private skillBar: SkillBar | null = null;
  private resultShown = false;

  constructor() {
    super('battle');
  }

  create(): void {
    // 씬 재시작 대비 초기화. 판마다 다른 AI 시드 — 상대 전략(페르소나·전개)이 매번 달라진다.
    this.view = null;
    this.resultShown = false;
    this.state = createBattle(STAGE_1, { aiSeed: Math.floor(Math.random() * 0x7fffffff) });

    const doc = (this.cache.json.get(LAYOUT_KEY) ?? null) as LayoutDoc | null;
    const hasDesign = !!doc && Array.isArray(doc.nodes) && doc.nodes.length > 0;
    if (!hasDesign) {
      this.drawPlaceholder();
      return;
    }

    const layout = buildLayout(this, doc as LayoutDoc);
    this.view = new BattleView(this, layout);
    this.hud = new Hud(layout);
    this.deck = new Deck(
      this,
      layout,
      (lane) => this.tryPlace(lane),
      (from, to) => this.tryReorder(from, to),
    );
    this.skillBar = new SkillBar(this, layout, (kind) => this.tryCast(kind));
    this.wireEmojiButton(layout);

    // 첫 프레임 동기화.
    this.hud.update(this.state);
    this.deck.update(this.state);
    this.skillBar.update(this.state);

    // 사운드 — 전투 시작 큐 + 배경음 루프(자동재생 잠김 시 첫 제스처 후 시작).
    sfx(this, 'sfx_start');
    startBgm(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => stopBgm());

    // DEV 노브 — 헤드리스 검증에서 씬/상태 프로브용.
    if (import.meta.env?.DEV) {
      (globalThis as Record<string, unknown>).__battleScene = this;
    }
  }

  override update(_time: number, delta: number): void {
    if (!this.view || this.resultShown) return;
    const wasReady = this.state.timeMs >= this.state.nextReadyAtMs;
    this.state = tick(STAGE_1, this.state, delta);
    this.view.sync(this.state, delta);
    this.hud?.update(this.state);
    this.deck?.update(this.state);
    this.skillBar?.update(this.state);
    this.playTickSounds(wasReady);
    if (this.state.status !== 'playing') this.showResult(this.state.status);
  }

  /** 이번 틱 도메인 이벤트 → 효과음(로직이 낸 순수 이벤트를 사운드로 변환). */
  private playTickSounds(wasReady: boolean): void {
    const e = this.state.events;
    if (e.newClashes > 0) sfx(this, 'sfx_clash');
    if (e.kos > 0) sfx(this, 'sfx_ko_drain');
    if (e.scores > 0) sfx(this, 'sfx_ringout_score');
    if (e.allyRingouts > 0) sfx(this, 'sfx_ringout');
    if (e.bounty > 0) sfx(this, 'sfx_bounty');
    // NEXT 충전 완료(대기→준비 전이)에 팝 사운드.
    const nowReady = this.state.timeMs >= this.state.nextReadyAtMs;
    if (!wasReady && nowReady) sfx(this, 'sfx_charge_pop');
  }

  /** NEXT 캐릭터를 지정 레인에 배치(큐 규칙은 로직이 검증). */
  private tryPlace(lane: number): boolean {
    const next = placeUnit(this.state, currentNext(this.state), lane);
    if (!next) return false;
    this.state = next;
    sfx(this, 'sfx_deploy');
    return true;
  }

  /** 좌측 카드 드래그 재정렬(큐 1..4 — NEXT 불가침은 로직이 검증). */
  private tryReorder(from: number, to: number): boolean {
    const next = reorderQueue(this.state, from, to);
    if (!next) return false;
    this.state = next;
    return true;
  }

  /** 스킬별 시전 플래시 색 — 전장 전체 효과의 체감. */
  private static readonly CAST_FLASH: Readonly<Record<AbilityKind, number>> = {
    rally: 0xfff2cc,
    healWave: 0x7dff9b,
    attackBoost: 0xffb347,
    sumoSpirit: 0xc27dff,
  };

  private tryCast(kind: AbilityKind): boolean {
    const next = castAbility(this.state, kind);
    if (!next) return false;
    this.state = next;
    sfx(this, 'sfx_ability');
    // 시전 체감 — 공통 컬러 플래시 + 스킬별 고유 연출.
    const W = this.scale.width;
    const H = this.scale.height;
    const flash = this.add
      .rectangle(W / 2, H / 2, W, H, BattleScene.CAST_FLASH[kind], 0.24)
      .setDepth(90);
    this.tweens.add({ targets: flash, alpha: 0, duration: 280, onComplete: () => flash.destroy() });
    switch (kind) {
      case 'rally': // 집결 — 함성이 아래에서 위로 밀어 올라가는 빛의 띠.
        this.sweepBand(0xffe08a);
        this.cameras.main.shake(120, 0.004);
        break;
      case 'healWave': // 치유의 물결 — 아군 진영에서 퍼지는 초록 파동.
        this.ringBurst(W / 2, H * 0.62, 0x54e07a, 3);
        break;
      case 'attackBoost': // 힘 강화 — 주황 기운이 전열로 솟구친다(지속 틴트는 뷰가 표시).
        this.sweepBand(0xffb347);
        this.cameras.main.shake(120, 0.004);
        break;
      case 'sumoSpirit': // 스모의 혼 — 보라 충격파 + 강한 진동.
        this.ringBurst(W / 2, H * 0.45, 0xc27dff, 2);
        this.cameras.main.shake(220, 0.006);
        break;
    }
    return true;
  }

  /** 확장 파동 링 — (x,y)에서 커지며 사라지는 원. */
  private ringBurst(x: number, y: number, color: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const g = this.add.graphics().setDepth(85);
      g.lineStyle(12, color, 0.9);
      g.strokeCircle(0, 0, 46);
      g.setPosition(x, y).setScale(0.3).setAlpha(0.95);
      this.tweens.add({
        targets: g,
        scale: 9,
        alpha: 0,
        delay: i * 110,
        duration: 520,
        ease: 'Cubic.Out',
        onComplete: () => g.destroy(),
      });
    }
  }

  /** 세로 스윕 밴드 — 하단(아군 진영)에서 상단으로 지나가는 빛의 띠. */
  private sweepBand(color: number): void {
    const W = this.scale.width;
    const band = this.add.rectangle(W / 2, 2100, W, 260, color, 0.28).setDepth(85);
    this.tweens.add({
      targets: band,
      y: 300,
      alpha: 0,
      duration: 480,
      ease: 'Cubic.Out',
      onComplete: () => band.destroy(),
    });
  }

  /** 이모지 버튼 — 소셜 기능 전 단계의 바운스 반응만. TODO: 이모트/소셜 기획 확정 후 결선. */
  private wireEmojiButton(layout: LayoutIndex): void {
    const btn = layout.tryById<Phaser.GameObjects.Image>(NODES.MAIN.LAYER_3_COPY31);
    if (!btn) return;
    btn.setInteractive({ useHandCursor: true });
    btn.on('pointerdown', () => {
      sfx(this, 'sfx_button');
      const { displayWidth, displayHeight } = btn;
      this.tweens.add({
        targets: btn,
        displayWidth: { from: displayWidth * 1.15, to: displayWidth },
        displayHeight: { from: displayHeight * 1.15, to: displayHeight },
        duration: 200,
        ease: 'Back.Out',
      });
    });
  }

  /** 승패 오버레이 — 탭하면 재도전. TODO(디자이너): 결과 화면 에디터 저작 요청(현재 코드 생성). */
  private showResult(status: 'won' | 'lost'): void {
    this.resultShown = true;
    stopBgm();
    if (status === 'won') sfx(this, 'sfx_win');
    const W = this.scale.width;
    const H = this.scale.height;
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.62).setDepth(100).setInteractive();
    const title = status === 'won' ? '승리!' : '패배...';
    const color = status === 'won' ? '#ffd94d' : '#ff8a7a';
    this.add
      .text(W / 2, H * 0.42, title, { fontFamily: '"Jua", sans-serif', fontSize: '120px', color })
      .setStroke('#3a1408', 14)
      .setOrigin(0.5)
      .setDepth(101);
    this.add
      .text(W / 2, H * 0.52, '탭하여 다시 도전', { fontFamily: '"Jua", sans-serif', fontSize: '44px', color: '#ffe3b3' })
      .setOrigin(0.5)
      .setDepth(101);
    dim.once('pointerdown', () => this.scene.restart());
  }

  /** 에디터 디자인이 없을 때의 구획 스캐폴드(참조 이미지 레이아웃 존). */
  private drawPlaceholder(): void {
    const W = GAME_WIDTH; // 720
    const H = this.scale.height;
    const cx = W / 2;

    this.add.rectangle(cx, H * 0.22, W, H * 0.44, 0x7fb2e6).setOrigin(0.5); // 하늘
    this.add.rectangle(cx, H * 0.66, W, H * 0.66, 0xc99a5b).setOrigin(0.5); // 흙 필드

    this.zone(cx, 70, W - 80, 56, 0xb23a2e, '적 본진 HP  (Wave 1/3)');

    const laneTop = 150;
    const laneBottom = H - 360;
    const laneH = laneBottom - laneTop;
    const laneW = (W - 80) / LANE_COUNT;
    for (let i = 0; i < LANE_COUNT; i++) {
      const lx = 40 + laneW * i + laneW / 2;
      const tint = i % 2 === 0 ? 0x6f8f3f : 0x7c9c47;
      this.add.rectangle(lx, laneTop + laneH / 2, laneW - 8, laneH, tint, 0.55).setOrigin(0.5);
    }

    this.zone(95, laneTop + 30, 120, 48, 0x2f6fb0, `마나 6/${MANA_MAX}`);

    let cardY = laneTop + 110;
    for (const kind of DECK_ORDER) {
      const u = UNIT_SPECS[kind];
      this.card(70, cardY, 96, 96, 0x6a4a8a, `${u.name}\n${u.cost}💧`);
      cardY += 108;
    }

    this.zone(cx, H - 290, W - 80, 48, 0x2f74b0, '아군 본진 HP');

    const abilW = (W - 100) / 4;
    let abx = 50 + abilW / 2;
    const colors = [0x2f8fc0, 0x3fae5a, 0xc0792a, 0x8a3fb0];
    ABILITY_ORDER.forEach((kind, i) => {
      const a = ABILITY_SPECS[kind];
      this.add.circle(abx, H - 130, 44, colors[i]).setStrokeStyle(4, 0xffe08a);
      this.add
        .text(abx, H - 130, `${a.name}\n${a.cost}💧`, {
          fontFamily: '"Jua", sans-serif',
          fontSize: '15px',
          color: '#ffffff',
          align: 'center',
        })
        .setOrigin(0.5);
      abx += abilW;
    });

    this.add
      .text(cx, H - 40, '독립 에디터에서 UI를 배치하면 이 자리표시자를 대체합니다', {
        fontFamily: '"Jua", sans-serif',
        fontSize: '16px',
        color: '#ffe3b3',
      })
      .setOrigin(0.5)
      .setAlpha(0.8);
  }

  /** 라벨 달린 둥근 존 박스. */
  private zone(x: number, y: number, w: number, h: number, color: number, label: string): void {
    this.add.rectangle(x, y, w, h, color, 0.9).setStrokeStyle(3, 0xffe08a).setOrigin(0.5);
    this.add
      .text(x, y, label, { fontFamily: '"Jua", sans-serif', fontSize: '20px', color: '#ffffff', align: 'center' })
      .setOrigin(0.5);
  }

  /** 좌측 덱 카드. */
  private card(x: number, y: number, w: number, h: number, color: number, label: string): void {
    this.add.rectangle(x, y, w, h, color, 0.95).setStrokeStyle(3, 0xffe08a).setOrigin(0.5);
    this.add
      .text(x, y, label, { fontFamily: '"Jua", sans-serif', fontSize: '16px', color: '#ffffff', align: 'center' })
      .setOrigin(0.5);
  }
}
