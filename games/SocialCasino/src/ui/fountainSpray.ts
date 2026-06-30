/**
 * fountainSpray.ts — 진입화면(로비) 분수대 물줄기 연출.
 *
 * 배경(up_SC_BG_02-1, depth 6)에 그려진 분수 중앙에서 **물이 솟구쳐 넓은 포물선을 그리며 아래로 쏟아져 내리고,
 * 수반(아래 풀)에서 튀는** 모습을 상시 분출한다. 세 이미터로 풍부하게 묘사한다:
 *   ① 중앙 물기둥(분수 중앙에서 솟았다 떨어짐)
 *   ② 좌우 넓은 포물선(멀리 호를 그리며 수반으로 쏟아짐)
 *   ③ 수반 착수 물보라(물이 떨어지는 아래쪽에서 잘게 튐 + 출렁임)
 *
 * 밝은 하늘 배경에서도 또렷하도록 **NORMAL 블렌드 + 흰~하늘색 반투명 물방울**(ADD 는 밝은 영역에서 묻혀
 * 얇은 간헐천처럼 보임). 부드러운 물방울 텍스처(런타임 생성) + GPU 배치 이미터라 비용이 낮다.
 * depth = 분수 배경 위·PLAY(9) 아래(기본 8).
 */
import Phaser from 'phaser';

/** 런타임 생성 물방울 텍스처 키(부드러운 흰 원). */
const TEX = 'sc_water_drop';
/** 물방울 색(입자별 랜덤 틴트) — 흰색~하늘색. */
const WATER_TINT = [0xffffff, 0xeaf7ff, 0xb9e3ff, 0x95d4ff];
/** 분출구(중앙) → 착수 수반까지 수직 낙차(px, 캔버스 기준). 수반 물보라가 이 아래에서 튄다. ⭐낙차 확대(요청 2026-06-30: 더 아래로 풍부하게). */
const BASIN_DROP = 240;
/** 솟구침/하강 중력(클수록 빨리 떨어짐). */
const GRAVITY = 760;

/**
 * 분수 물줄기 — 분출 중심(x,y)에서 물이 솟구쳐 포물선으로 아래로 쏟아지고, 그 아래 수반에서 튄다.
 * 씬 종료 시 누수 방지를 위해 `destroy()`(또는 씬 SHUTDOWN 연결)를 호출한다.
 */
export class FountainSpray {
  private readonly emitters: Phaser.GameObjects.Particles.ParticleEmitter[] = [];

  constructor(scene: Phaser.Scene, x: number, y: number, depth = 8) {
    ensureTexture(scene);
    if (!scene.textures.exists(TEX)) return;

    // 포물선은 angle/speed 대신 speedX/speedY 직접 제어 — gravityY 가 하강을, speedX 폭이 좌우 포물선 너비를 만든다.

    // ① 중앙 물기둥 — 분수 중앙에서 솟았다가 떨어진다. ⭐수명 연장 = 더 아래(낮은 수반)까지 풍부하게 쏟아져 내린다(요청).
    const column = scene.add.particles(x, y, TEX, {
      speedX: { min: -42, max: 42 },
      speedY: { min: -440, max: -350 }, // 위로(−)
      gravityY: GRAVITY,
      lifespan: { min: 1350, max: 1950 }, // ⭐길게 → 낮아진 수반까지 떨어짐
      scale: { start: 0.5, end: 0.07 },
      alpha: { start: 0.45, end: 0 }, // ⭐반투명(요청 2026-06-30)
      frequency: 12, // ⭐더 촘촘
      quantity: 4, // ⭐더 풍부
      tint: WATER_TINT,
    });

    // ② 좌우 넓은 포물선 — 양옆으로 멀리 호를 그리고 수반으로 쏟아져 내린다(주물줄기). ⭐양·수명↑ = 끝부분 낙수가 풍부.
    const arcs = scene.add.particles(x, y, TEX, {
      speedX: { min: -185, max: 185 }, // 좌우 포물선 폭
      speedY: { min: -350, max: -255 }, // 중앙보다 낮게 솟아 더 옆으로
      gravityY: GRAVITY,
      lifespan: { min: 1400, max: 2000 }, // ⭐길게 → 더 아래까지 낙하
      scale: { start: 0.44, end: 0.05 },
      alpha: { start: 0.42, end: 0 }, // ⭐반투명
      frequency: 6, // ⭐촘촘(풍부한 물줄기)
      quantity: 6, // ⭐더 풍부
      tint: WATER_TINT,
    });

    // ③ 수반 착수 물보라 — 낮아진 수반(BASIN_DROP↑)에서 잘게 튀어 오르며 출렁임. ⭐양↑ = 아래쪽 낙수가 풍성하게 쏟아져 튄다.
    const splash = scene.add.particles(x, y + BASIN_DROP, TEX, {
      speedX: { min: -155, max: 155 }, // ⭐더 넓게 튐
      speedY: { min: -165, max: -45 }, // 낮게 튀어 오름
      gravityY: 700,
      lifespan: { min: 500, max: 900 },
      scale: { start: 0.36, end: 0.04 },
      alpha: { start: 0.4, end: 0 }, // ⭐반투명
      frequency: 10, // ⭐더 촘촘
      quantity: 5, // ⭐더 풍부
      tint: [0xffffff, 0xeaf8ff, 0xbfe6ff],
    });

    this.emitters.push(column, arcs, splash);
    for (const e of this.emitters) e.setDepth(depth);
  }

  /** 물줄기 위치 이동(분수 좌표 미세 조정용). 수반 물보라는 분출구 아래 BASIN_DROP 만큼 따라간다. */
  setPosition(x: number, y: number): void {
    const [column, arcs, splash] = this.emitters;
    column?.setPosition(x, y);
    arcs?.setPosition(x, y);
    splash?.setPosition(x, y + BASIN_DROP);
  }

  /** 이미터 정리(씬 종료/재진입 시 누수 방지). */
  destroy(): void {
    for (const e of this.emitters) e.destroy();
    this.emitters.length = 0;
  }
}

/** 부드러운 원형 물방울 텍스처(동심원 누적 → soft falloff)를 1회 생성. */
function ensureTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX)) return;
  const r = 14;
  const g = scene.make.graphics({}, false);
  const steps = 7;
  // 바깥→안쪽으로 반투명 원을 겹쳐 칠해 중심이 밝고 가장자리가 부드럽게 사라지는 물방울.
  for (let i = steps; i >= 1; i--) {
    g.fillStyle(0xffffff, 0.16);
    g.fillCircle(r, r, (r * i) / steps);
  }
  g.generateTexture(TEX, r * 2, r * 2);
  g.destroy();
}
