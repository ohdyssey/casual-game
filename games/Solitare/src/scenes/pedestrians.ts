/**
 * pedestrians.ts — 배경 보행 캐릭터(에디터 동선 따라 걷기).
 *
 * 8방향 스프라이트 시트(정지 포즈 1장/방향, 걷기 프레임 없음)를 **동선(path)** 을 따라 이동시키고,
 * 걷는 느낌은 **맥동(bob: 상하 흔들림 + 미세 갸우뚱)** 으로 낸다. 이동 방향(벡터)에 맞춰 8방향 프레임을 고른다.
 *
 * 렌더 깊이는 씬이 지정(플레이 화면에선 반투명막 바로 뒤). 순수 표시 오브젝트 — 게임 로직과 무관.
 */
import Phaser from 'phaser';

export interface PathPoint {
  readonly x: number;
  readonly y: number;
}

// 8방향(45° 섹터) → 시트 프레임 인덱스(4열×2행, 행우선 0..7). 화면좌표(+x 오른쪽·+y 아래).
//   섹터 순서 = E,SE,S,SW,W,NW,N,NE (round(deg/45) 로 인덱싱).
//   시트 프레임 확정(확대 확인): 1=S앞·2=N뒤·4=좌향(앞)·6=우향(앞)·5=뒤좌(NW)·7=뒤우(NE).
//   → 우측계열(E/SE)=6, 좌측계열(W/SW)=4, N=2, S=1, NW=5, NE=7 로 좌우 정확히.
const SECTOR_FRAME: readonly number[] = [6, 6, 1, 4, 4, 5, 2, 7];

function frameForVelocity(vx: number, vy: number): number {
  const deg = (Math.atan2(vy, vx) * 180) / Math.PI; // -180..180
  const s = ((Math.round(deg / 45) % 8) + 8) % 8;
  return SECTOR_FRAME[s];
}

export interface PedestrianOptions {
  /** 표시 배율(시트 프레임 대비). */
  readonly scale?: number;
  /** 이동 속도(px/sec). */
  readonly speed?: number;
  /** 렌더 깊이(반투명막 바로 뒤 등). */
  readonly depth?: number;
  /** 시작 진행도(0..1, 경로 길이 비율) — 여러 명 분산 배치용. */
  readonly startFrac?: number;
  /** 순환 경로 여부(false=왕복 핑퐁). */
  readonly closed?: boolean;
  /** 맥동 세기(상하 px). */
  readonly bobAmp?: number;
  /** 걸음 불규칙 위상 시드(캐릭터마다 다르게 → 속도 변동·짧은 멈춤이 서로 어긋남). */
  readonly seed?: number;
  /** 좌우 미러 시트(예: char_girl) → sprite 를 수평 반전해 동일 프레임 매핑 사용. */
  readonly flip?: boolean;
}

/** 한 명의 보행 캐릭터 — 경로를 따라 걷고 맥동한다. */
export class Pedestrian {
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly pts: PathPoint[];
  private readonly segLen: number[]; // 각 세그먼트 길이
  private readonly total: number; // 전체 경로 길이
  private readonly speed: number;
  private readonly closed: boolean;
  private readonly bobAmp: number;
  private dist: number; // 경로 시작부터의 누적 거리
  private dir: 1 | -1 = 1; // 왕복 방향
  private phase = 0; // 맥동 위상
  private gaitT: number; // 걸음 불규칙 타이머
  private readonly seed: number;
  private bx = 0; // 회피 전 기준 위치(다른 캐릭터가 참조)
  private by = 0;
  private ax = 0; // 교차 회피 오프셋(부드럽게 이징)
  private ay = 0;

  constructor(scene: Phaser.Scene, key: string, waypoints: readonly PathPoint[], opts: PedestrianOptions = {}) {
    this.pts = waypoints.map((p) => ({ x: p.x, y: p.y }));
    this.closed = opts.closed ?? false;
    this.speed = opts.speed ?? 120;
    this.bobAmp = opts.bobAmp ?? 8;
    // 세그먼트 길이 사전 계산(순환이면 마지막→처음도 포함).
    this.segLen = [];
    const last = this.closed ? this.pts.length : this.pts.length - 1;
    for (let i = 0; i < last; i++) {
      const a = this.pts[i];
      const b = this.pts[(i + 1) % this.pts.length];
      this.segLen.push(Math.hypot(b.x - a.x, b.y - a.y));
    }
    this.total = this.segLen.reduce((s, l) => s + l, 0) || 1;
    this.dist = (opts.startFrac ?? 0) * this.total;
    this.seed = opts.seed ?? 0;
    this.gaitT = this.seed * 1000; // 시드로 위상 어긋남

    const start = this.posAt(this.dist);
    this.sprite = scene.add
      .sprite(start.x, start.y, key, 1)
      .setOrigin(0.5, 0.62) // 발 위치가 좌표 아래쪽에 오도록 약간 하향 앵커
      .setScale(opts.scale ?? 0.55)
      .setFlipX(opts.flip ?? false) // 미러 시트(char_girl) 좌우 반전
      .setDepth(opts.depth ?? 4);
  }

  /** 누적 거리 d(경로 시작 기준)에서의 좌표 + 진행 방향 벡터. */
  private sampleAt(d: number): { x: number; y: number; vx: number; vy: number } {
    let rem = Phaser.Math.Clamp(d, 0, this.total);
    for (let i = 0; i < this.segLen.length; i++) {
      const len = this.segLen[i] || 1;
      if (rem <= len || i === this.segLen.length - 1) {
        const a = this.pts[i];
        const b = this.pts[(i + 1) % this.pts.length];
        const t = Phaser.Math.Clamp(rem / len, 0, 1);
        return {
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          vx: b.x - a.x,
          vy: b.y - a.y,
        };
      }
      rem -= len;
    }
    const a = this.pts[0];
    return { x: a.x, y: a.y, vx: 1, vy: 0 };
  }

  private posAt(d: number): PathPoint {
    const s = this.sampleAt(d);
    return { x: s.x, y: s.y };
  }

  /** 회피 계산용 — 현재 기준 위치(오프셋 제외). */
  baseX(): number {
    return this.bx;
  }
  baseY(): number {
    return this.by;
  }

  /** 매 프레임 진행 — deltaMs 만큼 이동(불규칙 걸음) + 맥동 + 교차 회피 + 방향 프레임 갱신. */
  update(deltaMs: number, others: readonly Pedestrian[] = []): void {
    const dt = deltaMs / 1000;
    // **불규칙 걸음** — 서로 다른 주파수의 사인 합성으로 속도를 들쭉날쭉하게(가끔 거의 멈춤). 시드로 캐릭터마다 어긋남.
    this.gaitT += deltaMs;
    const g =
      0.6 +
      0.5 * Math.sin(this.gaitT * 0.0011 + this.seed) +
      0.34 * Math.sin(this.gaitT * 0.0029 + this.seed * 2.3) +
      0.18 * Math.sin(this.gaitT * 0.0061 + this.seed * 4.1);
    const gait = Phaser.Math.Clamp(g, 0.08, 1.45); // 0.08≈짧은 멈칫, 1.45≈빠른 걸음
    this.dist += this.speed * dt * this.dir * gait;
    // 경로 끝 처리: 순환=wrap, 아니면 왕복(핑퐁).
    if (this.closed) {
      this.dist = ((this.dist % this.total) + this.total) % this.total;
    } else if (this.dist >= this.total) {
      this.dist = this.total - (this.dist - this.total);
      this.dir = -1;
    } else if (this.dist <= 0) {
      this.dist = -this.dist;
      this.dir = 1;
    }
    const s = this.sampleAt(this.dist);
    // 진행(왕복) 방향에 맞춘 실제 속도 벡터로 프레임 선택.
    const vx = s.vx * this.dir;
    const vy = s.vy * this.dir;
    if (vx !== 0 || vy !== 0) this.sprite.setFrame(frameForVelocity(vx, vy));
    // 맥동 — 상하 흔들림 + 미세 갸우뚱(걷는 느낌). 걸음 속도(gait)에 따라 위상·세기가 변해 멈칫하면 약해진다.
    this.phase += deltaMs * 0.011 * (0.35 + gait);
    const amp = this.bobAmp * (0.4 + 0.6 * Math.min(1, gait));
    const bobY = Math.abs(Math.sin(this.phase)) * amp; // 위로 통통 튀는 느낌(절대값)
    // 회피 전 기준 위치(다른 캐릭터가 참조).
    this.bx = s.x;
    this.by = s.y - bobY;
    // **교차 회피 + 간격 유지** — 가까운 캐릭터를 만나면 **진행방향의 옆(수직)으로 비켜** 나란히 지나가고,
    //   약간의 방사 반발로 최소 간격을 유지한다. 오프셋은 부드럽게 이징.
    const AVOID_R = 210; // 넉넉한 개인 공간(이 거리 안이면 서로 비켜 간격 유지)
    const AVOID_STR = 95;
    const AVOID_MAX = 72;
    // 내 진행방향의 수직(옆) 단위벡터.
    const hl = Math.hypot(vx, vy) || 1;
    const perpx = -vy / hl;
    const perpy = vx / hl;
    let rx = 0;
    let ry = 0;
    for (const o of others) {
      if (o === this) continue;
      const dx = this.bx - o.baseX();
      const dy = this.by - o.baseY();
      const d = Math.hypot(dx, dy);
      if (d > 0.001 && d < AVOID_R) {
        const f = 1 - d / AVOID_R;
        // 상대가 내 좌/우 어느 쪽인지 → 그 반대쪽(옆)으로 비켜간다(옆으로 교차).
        const side = dx * perpx + dy * perpy >= 0 ? 1 : -1;
        rx += perpx * side * f;
        ry += perpy * side * f;
        // 최소 간격 유지용 약한 방사 반발.
        rx += (dx / d) * f * 0.35;
        ry += (dy / d) * f * 0.35;
      }
    }
    const tax = Phaser.Math.Clamp(rx * AVOID_STR, -AVOID_MAX, AVOID_MAX);
    const tay = Phaser.Math.Clamp(ry * AVOID_STR, -AVOID_MAX, AVOID_MAX);
    const ease = Math.min(1, deltaMs * 0.005);
    this.ax += (tax - this.ax) * ease;
    this.ay += (tay - this.ay) * ease;
    this.sprite.setPosition(this.bx + this.ax, this.by + this.ay);
    this.sprite.setAngle(Math.sin(this.phase) * 2.5 * Math.min(1, gait));
  }

  destroy(): void {
    this.sprite.destroy();
  }
}

/**
 * 동선(path) 노드 → 월드 웨이포인트. 에디터 path 노드의 x/y 는 점들의 **바운딩 중심**(웨이포인트 아님),
 * points 는 그 중심 기준 상대좌표 → 월드 = (x+px, y+py). 각 point 가 곧 웨이포인트.
 */
export function pathToWaypoints(node: {
  x: number;
  y: number;
  points?: ReadonlyArray<{ x: number; y: number }>;
}): PathPoint[] {
  return (node.points ?? []).map((p) => ({ x: node.x + p.x, y: node.y + p.y }));
}
