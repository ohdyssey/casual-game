/**
 * BattleView — 시뮬레이션 스냅샷(BattleState)을 스프라이트로 동기화한다.
 *
 * 레인 좌표계: 에디터 배치를 앵커로 삼는 원근 보간.
 *   - 하단 앵커 = 출발점 5개 노드 중심(레인별 x, y)
 *   - 상단 앵커 = 적 대기 마커 5개 노드(레인별 x, 발끝 y)
 *   - pos 0→LANE_LENGTH 를 하단→상단으로 lerp, 스케일도 원근 축소
 *   앵커를 레이아웃에서 읽으므로 디자이너가 배치를 바꿔도 코드 수정이 없다.
 *
 * 연출:
 *   - 걷기: 밑둥(origin 0.5,1) 기준 사인 롤 — 미세한 뒤뚱거리는 스모 걸음.
 *   - 장애물: 에디터 마스코트(개+깃발) 텍스처를 동적 렌더, 내구도 바 표시, 파괴 시 페이드.
 *
 * 에디터의 캐릭터/마스코트 마커는 "위치 가이드"로만 쓰고 숨긴다 — 실제 개체는
 * 스폰/파괴가 있어 동적으로 생성한다.
 */
import Phaser from 'phaser';
import { LANE_COUNT, LANE_LENGTH, type BattleState, type Combatant, type UnitKind } from '../logic/types.js';
import { UNIT_SPECS } from '../logic/roster.js';
import { chainForce, chainOf, CONTACT_DIST } from '../logic/battle.js';
import type { LayoutIndex } from '../ui/layoutLoader.js';
import {
  ALLY_MARKER_IDS,
  buildLanePaths,
  EMBLEM_MARKER_IDS,
  ENEMY_MARKER_IDS,
  MASCOT_ID,
  type LanePath,
} from '../ui/laneAnchors.js';

/** 장애물 텍스처(에디터 업로드 — 개+깃발). */
const OBSTACLE_TEX = 'up_SC_UI_020';

/** 하단 기준 유닛 표시 폭(px) — 에디터 아군 마커 폭. */
const BASE_UNIT_W = 146;
/** 상단(원근 소실점 쪽) 스케일 — 에디터 적 마커 폭(120)/아군 마커 폭 비율. */
const TOP_SCALE = 120 / BASE_UNIT_W;
/** 장애물 하단 기준 표시 폭 — 에디터 마스코트 마커 폭. */
const OBSTACLE_W = 120;
/** 유닛 HP(기력) 바 치수. */
const HP_BAR_W = 88;
const HP_BAR_H = 10;
/** 뒤뚱 걷기 — 롤 진폭(도)과 각속도(rad/ms). 밑둥 피벗이라 아주 작아도 살아 보인다. */
const WADDLE_DEG = 2.8;
const WADDLE_SPEED = 0.016;
/** 힘 강화(Attack Boost) 지속 중 아군 틴트. */
const BOOST_TINT = 0xffb347;
/**
 * 아군 직업 엠블럼(어깨 배지) — Stl_0N 은 직업 번호 순(1P 2T 3S 4H 5B 6C).
 *   캐릭터/카드 이미지 순서(3B 4S 5H)와 다름 — 디자이너 레이아웃 페어링으로 확정.
 */
const EMBLEM_TEX: Readonly<Record<UnitKind, string>> = {
  pusher: 'up_SC_Chr_Stl_01',
  tank: 'up_SC_Chr_Stl_02',
  sprinter: 'up_SC_Chr_Stl_03_v2',
  healer: 'up_SC_Chr_Stl_04',
  brawler: 'up_SC_Chr_Stl_05',
  crusher: 'up_SC_Chr_Stl_06',
};
/**
 * 적 캐릭터 아트 — 아군과 같은 직업, 같은 이미지 순서(1P 2T 3B 4S 5H 6C)의 em_0N 세트.
 *   능력치는 동일하고 겉모습(적 버전 아트)과 회색 엠블럼으로만 구분한다.
 */
const ENEMY_ART: Readonly<Record<UnitKind, string>> = {
  pusher: 'up_SC_Chr_em_01_v3',
  tank: 'up_SC_Chr_em_02',
  brawler: 'up_SC_Chr_em_03',
  sprinter: 'up_SC_Chr_em_04',
  healer: 'up_SC_Chr_em_05',
  crusher: 'up_SC_Chr_em_06',
};
/** 적 엠블럼 회색 틴트 — 같은 직업 배지를 단일 회색 톤으로 눌러 표현. */
const ENEMY_EMBLEM_TINT = 0x9a9a9a;
/** 엠블럼 표시 치수/오프셋 — 디자이너 마커 배치(56px, +43x, 세로 중앙 부근) 기준. */
const EMBLEM_W = 56;
const EMBLEM_DX = 0.3; // 유닛 폭 대비 어깨 오프셋(아군 오른어깨, 적은 반대편)
const EMBLEM_DY = 0.62; // 발끝 기준 어깨 높이(유닛 높이 비율)
/** 대결치 숫자 색 — 아군/적. */
const FORCE_COLOR_ALLY = '#6fd2ff';
const FORCE_COLOR_ENEMY = '#ff8a6f';

interface UnitSprite {
  readonly img: Phaser.GameObjects.Image;
  /** 아군 직업 엠블럼(어깨 배지) — 캐릭터를 따라다닌다. 적/텍스처 부재 시 없음. */
  readonly emblem?: Phaser.GameObjects.Image;
  lastHp: number;
  lastPos: number;
  phase: number;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export class BattleView {
  private readonly lanes: LanePath[];
  private readonly units = new Map<number, UnitSprite>();
  private readonly obstacleSprites = new Map<number, Phaser.GameObjects.Image>();
  private readonly hpBars: Phaser.GameObjects.Graphics;
  /** 대결치 라벨 풀 — 레인 5 × 진영 2. */
  private readonly forceLabels: Phaser.GameObjects.Text[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    layout: LayoutIndex,
  ) {
    // 마커 숨김(위치 가이드 역할은 앵커 산출로 끝). 엠블럼 마커도 유닛 추종 배지로 대체.
    for (const id of [...ALLY_MARKER_IDS, ...ENEMY_MARKER_IDS, ...EMBLEM_MARKER_IDS, MASCOT_ID]) {
      layout.tryById(id)?.setVisible(false);
    }
    // 레인 경로 앵커 — 출발점(하단)·적 마커 발끝(상단).
    this.lanes = buildLanePaths(layout);
    this.hpBars = scene.add.graphics().setDepth(12.5);
  }

  /** 레인 진행 좌표 → 화면 좌표(발끝 기준) + 원근 스케일. */
  posToScreen(lane: number, pos: number): { x: number; y: number; scale: number } {
    const t = Math.max(0, Math.min(1, pos / LANE_LENGTH));
    const p = this.lanes[lane];
    return {
      x: lerp(p.bottomX, p.topX, t),
      y: lerp(p.bottomY, p.topY, t),
      scale: lerp(1, TOP_SCALE, t),
    };
  }

  private artOf(c: Combatant): string {
    return c.side === 'ally'
      ? UNIT_SPECS[c.specId as UnitKind]?.art ?? ''
      : ENEMY_ART[c.specId as UnitKind] ?? '';
  }

  private spawnSprite(c: Combatant): UnitSprite | null {
    const key = this.artOf(c);
    if (!key || !this.scene.textures.exists(key)) return null;
    const img = this.scene.add.image(0, 0, key).setOrigin(0.5, 1);
    // 등장 페이드 — sync 가 매 프레임 setDisplaySize 로 스케일을 덮으므로 알파로만 연출.
    this.scene.tweens.add({ targets: img, alpha: { from: 0, to: 1 }, duration: 140 });
    // 어깨 엠블럼 — 같은 직업 배지. 아군=컬러, 적=회색 단일 톤(능력치 동일, 진영만 구분).
    let emblem: Phaser.GameObjects.Image | undefined;
    const emblemKey = EMBLEM_TEX[c.specId as UnitKind];
    if (emblemKey && this.scene.textures.exists(emblemKey)) {
      emblem = this.scene.add.image(0, 0, emblemKey).setOrigin(0.5);
      if (c.side === 'enemy') emblem.setTint(ENEMY_EMBLEM_TINT);
      this.scene.tweens.add({ targets: emblem, alpha: { from: 0, to: 1 }, duration: 140 });
    }
    const unit: UnitSprite = { img, emblem, lastHp: c.hp, lastPos: c.pos, phase: 0 };
    this.units.set(c.uid, unit);
    return unit;
  }

  /** 스냅샷 → 스프라이트 생성/이동/걷기연출/피격/소멸 동기화. */
  sync(state: BattleState, deltaMs: number): void {
    const seen = new Set<number>();
    this.hpBars.clear();

    for (const c of state.combatants) {
      seen.add(c.uid);
      let unit = this.units.get(c.uid);
      if (!unit) {
        unit = this.spawnSprite(c) ?? undefined;
        if (!unit) continue;
      }
      const { x, y, scale } = this.posToScreen(c.lane, c.pos);
      const img = unit.img;
      const tex = img.texture.getSourceImage() as { width: number; height: number };
      const w = BASE_UNIT_W * scale;
      const h = (w * tex.height) / Math.max(1, tex.width);
      img.setPosition(x, y);
      img.setDisplaySize(w, h);
      // 아래쪽(화면 앞)일수록 위에 그림 — 배경(1)과 UI 패널(13) 사이 깊이 대역.
      img.setDepth(2 + (y / 2400) * 10);

      // 엠블럼 — 캐릭터의 어깨 높이를 따라다닌다(원근 스케일 동기, 적은 반대 어깨).
      if (unit.emblem) {
        const ew = EMBLEM_W * scale;
        const etex = unit.emblem.texture.getSourceImage() as { width: number; height: number };
        unit.emblem.setDisplaySize(ew, (ew * etex.height) / Math.max(1, etex.width));
        const dx = (c.side === 'ally' ? 1 : -1) * w * EMBLEM_DX;
        unit.emblem.setPosition(x + dx, y - h * EMBLEM_DY);
        unit.emblem.setDepth(img.depth + 0.05);
      }

      // 뒤뚱 걷기 — 이동 중일 때만 밑둥 기준 사인 롤, 멈추면 감쇠.
      const moving = Math.abs(c.pos - unit.lastPos) > 0.01;
      if (moving) {
        unit.phase += deltaMs * WADDLE_SPEED;
        img.setAngle(Math.sin(unit.phase) * WADDLE_DEG);
      } else if (img.angle !== 0) {
        img.setAngle(Math.abs(img.angle) < 0.2 ? 0 : img.angle * 0.82);
      }
      unit.lastPos = c.pos;

      // 힘 강화 지속 중 아군 틴트(피격 플래시가 잠깐 덮을 수 있음 — 다음 프레임 복원).
      const boosted = state.timeMs < state.attackBoostUntilMs;
      if (c.side === 'ally' && boosted) img.setTint(BOOST_TINT);
      else if (img.tintTopLeft === BOOST_TINT) img.clearTint();

      // 피격(기력 소모) 플래시 — 스크럼 드레인은 매 틱이라 큰 낙차만 반짝인다.
      if (c.hp < unit.lastHp - 8) {
        img.setTintFill(0xffffff);
        this.scene.time.delayedCall(70, () => {
          if (img.active) img.clearTint();
        });
        unit.lastHp = c.hp;
      } else if (c.hp > unit.lastHp) {
        unit.lastHp = c.hp; // 회복은 즉시 추종
      }

      // 기력 바(만피는 표시 생략).
      if (c.hp < c.maxHp) {
        const bw = HP_BAR_W * scale;
        const bx = x - bw / 2;
        const by = y - h - 14;
        const ratio = Math.max(0, c.hp / c.maxHp);
        this.hpBars.fillStyle(0x000000, 0.55).fillRoundedRect(bx - 2, by - 2, bw + 4, HP_BAR_H + 4, 4);
        this.hpBars
          .fillStyle(c.side === 'ally' ? 0x3fae5a : 0xd8422e, 1)
          .fillRoundedRect(bx, by, Math.max(2, bw * ratio), HP_BAR_H, 3);
      }
    }

    // 대결치 — 밀착 무리의 힘 총합(정확한 합산)을 선두 위에 숫자로 표시.
    this.syncForceLabels(state);

    // 장애물 — 생성/내구도 바/파괴 페이드.
    const seenObstacles = new Set<number>();
    for (const o of state.obstacles) {
      seenObstacles.add(o.uid);
      let img = this.obstacleSprites.get(o.uid);
      if (!img) {
        if (!this.scene.textures.exists(OBSTACLE_TEX)) continue;
        img = this.scene.add.image(0, 0, OBSTACLE_TEX).setOrigin(0.5, 1);
        this.obstacleSprites.set(o.uid, img);
      }
      const { x, y, scale } = this.posToScreen(o.lane, o.pos);
      const tex = img.texture.getSourceImage() as { width: number; height: number };
      const w = OBSTACLE_W * scale;
      img.setPosition(x, y);
      img.setDisplaySize(w, (w * tex.height) / Math.max(1, tex.width));
      img.setDepth(2 + (y / 2400) * 10);
      // 내구도 바(노란색) — 손상됐을 때만.
      if (o.durability < o.maxDurability) {
        const bw = HP_BAR_W * scale;
        const bx = x - bw / 2;
        const by = y - img.displayHeight - 14;
        const ratio = Math.max(0, o.durability / o.maxDurability);
        this.hpBars.fillStyle(0x000000, 0.55).fillRoundedRect(bx - 2, by - 2, bw + 4, HP_BAR_H + 4, 4);
        this.hpBars.fillStyle(0xf2c53d, 1).fillRoundedRect(bx, by, Math.max(2, bw * ratio), HP_BAR_H, 3);
      }
    }
    for (const [uid, img] of this.obstacleSprites) {
      if (seenObstacles.has(uid)) continue;
      this.obstacleSprites.delete(uid);
      this.scene.tweens.add({
        targets: img,
        alpha: 0,
        angle: 8,
        duration: 260,
        onComplete: () => img.destroy(),
      });
    }

    // 사라진 유닛(기력 소진/장외) — 페이드 아웃 후 파괴.
    this.cleanupGone(seen);
  }

  /**
   * 대결치 표시 — 시뮬레이션과 동일한 chainOf/chainForce 로 계산해 수치가 항상 일치한다.
   * 스크럼 중이면 양측 수치가 맞붙고, 2명 이상 밀착 시엔 합산 확인용으로 표시.
   */
  private syncForceLabels(state: BattleState): void {
    const boosted = state.timeMs < state.attackBoostUntilMs;
    let used = 0;
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      const allies = state.combatants.filter((c) => c.lane === lane && c.side === 'ally').sort((a, b) => b.pos - a.pos);
      const enemies = state.combatants
        .filter((c) => c.lane === lane && c.side === 'enemy')
        .sort((a, b) => a.pos - b.pos);
      if (!allies.length && !enemies.length) continue;
      const aChain = chainOf(allies);
      const eChain = chainOf(enemies);
      const scrum = allies.length > 0 && enemies.length > 0 && enemies[0].pos - allies[0].pos <= CONTACT_DIST + 8;
      if (allies.length && (scrum || aChain.length >= 2)) {
        used = this.placeForceLabel(used, allies[0], Math.round(chainForce(aChain, boosted).push), FORCE_COLOR_ALLY);
      }
      if (enemies.length && (scrum || eChain.length >= 2)) {
        used = this.placeForceLabel(used, enemies[0], Math.round(chainForce(eChain, false).push), FORCE_COLOR_ENEMY);
      }
    }
    for (let i = used; i < this.forceLabels.length; i++) this.forceLabels[i].setVisible(false);
  }

  private placeForceLabel(index: number, front: Combatant, value: number, color: string): number {
    const unit = this.units.get(front.uid);
    if (!unit) return index;
    let t = this.forceLabels[index];
    if (!t) {
      t = this.scene.add
        .text(0, 0, '', { fontFamily: '"Chewy", "Jua", sans-serif', fontSize: '42px', color: '#ffffff' })
        .setStroke('#22304c', 8)
        .setOrigin(0.5, 1)
        .setDepth(12.7);
      this.forceLabels[index] = t;
    }
    const img = unit.img;
    t.setText(String(value)).setColor(color).setVisible(true);
    t.setPosition(img.x, img.y - img.displayHeight - 28);
    return index + 1;
  }

  /** 스냅샷에서 사라진 유닛 정리(엠블럼 동반). */
  private cleanupGone(seen: ReadonlySet<number>): void {
    for (const [uid, unit] of this.units) {
      if (seen.has(uid)) continue;
      this.units.delete(uid);
      const img = unit.img;
      this.scene.tweens.add({
        targets: img,
        alpha: 0,
        scale: img.scale * 0.6,
        duration: 160,
        onComplete: () => img.destroy(),
      });
      const emblem = unit.emblem;
      if (emblem) {
        this.scene.tweens.add({ targets: emblem, alpha: 0, duration: 160, onComplete: () => emblem.destroy() });
      }
    }
  }
}
