/**
 * Hook — 낚싯바늘.
 *
 * 상태:
 *  - IDLE      : 수면 위 대기
 *  - DESCEND   : 자유 낙하 (탭하지 않는 동안)
 *  - REELING   : 탭 하고 있는 동안 위로 (리트랙트)
 *  - HOOKED    : 물고기 잡힌 상태로 위로 끌어올림
 *
 * 외부에서는 update(dt, isTapping), reset(), attachFish(fish) 만 호출.
 */

import Phaser from 'phaser';
import { FISHING } from '../config/game.config.js';
import { getFishCombatProfile } from '../config/fish.config.js';

export const HOOK_STATE = {
  IDLE:    'IDLE',
  DESCEND: 'DESCEND',
  REELING: 'REELING',
  HOOKED:  'HOOKED',
  CASTING: 'CASTING',   // 화면 위에서 castStartY 까지 천천히 내려오는 단계
  // 유저 모드 II — 미끼가 CAST 버튼에서 발사되는 방식
  USER2_AIM:   'USER2_AIM',    // 발사 전 대기 (needle swing)
  USER2_FLY:   'USER2_FLY',    // 발사 중 (가속하며 비행)
  USER2_DECEL: 'USER2_DECEL',  // 버튼 뗀 후 관성으로 감속 (속도 0 도달 시 STOP)
  USER2_STOP:  'USER2_STOP',   // 정지 — fish 가 peck 가능, 누르면 회수 시작
  USER2_REEL:  'USER2_REEL',   // 회수 — 누르고 있는 동안 CAST 버튼 방향으로 가속
};

// ─── 파이팅 게이지 구간별 레이트 (사용자 요청 난이도) ───
//   t = 스무딩된 텐션. ④⑤⑥ 소모 2배씩↑, ①②③ 회복 2배씩↑ (선형 t 누적이 아닌 "구간 상수").
//   반환값은 in-HP-zone 기준 base /s. 호출부에서 존 밖 ×0.4, 최종 ×sizeFactor.
//   값은 FISHING.fight 에서 관리 (ARCH-04: 매직 넘버 추출, 기존 리터럴과 동일).
const FIGHT = FISHING.fight;
function fightConsumeRate(t) {        // t ∈ [0, 0.95]  → ④25 / ⑤50 / ⑥100
  if (t < FIGHT.zoneThresholds[0]) return FIGHT.consumeSteps[0];
  if (t < FIGHT.zoneThresholds[1]) return FIGHT.consumeSteps[1];
  return FIGHT.consumeSteps[2];
}
function fightRecoverRate(at) {       // at = |t| ∈ (0, 1]  → ③8 / ②16 / ①32
  if (at < FIGHT.zoneThresholds[0]) return FIGHT.recoverSteps[0];
  if (at < FIGHT.zoneThresholds[1]) return FIGHT.recoverSteps[1];
  return FIGHT.recoverSteps[2];
}

export class Hook {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x — 수평 중심 좌표 (좌우 흔들림은 없는 단순 버전)
   */
  constructor(scene, x) {
    this.scene = scene;
    this.baseX = x;                 // 로드 tip 의 고정 x (수면 위 줄 출발점)
    this.x = x;                     // hook 자체의 현재 x (struggle 중에는 좌우 흔들림)
    this.y = FISHING.castStartY;
    this.state = HOOK_STATE.IDLE;

    // 낚싯줄 그래픽
    this.line = scene.add.graphics();
    this.line.setDepth(50);

    // 미끼 (lure) 스프라이트 — 작게 (사용자 요청: "아주 작게 미끼로 배치")
    // 원본 51×143. 높이 30px 로 설정 → scale ≈ 0.21, 표시 폭 ≈ 11px.
    // origin (0.5, 0) → 상단 중심에 anchor → this.y 가 줄 연결점(상단), 미끼 끝은 this.y + 30.
    if (scene.textures.exists('lure')) {
      this.lure = scene.add.image(this.x, this.y, 'lure');
      this.lure.setOrigin(0.5, 0);
      const LURE_DISPLAY_H = 30;
      this.lure.setScale(LURE_DISPLAY_H / this.lure.height);
      this.lure.setDepth(51);
      this._lureHeight = LURE_DISPLAY_H;
    } else {
      // fallback: 작은 회색 그래픽 (텍스처 미로드 시 안전망)
      this.hookG = scene.add.graphics();
      this.hookG.setDepth(51);
      this._lureHeight = 8;
    }

    this._drawHook();

    // 잡힌 물고기 참조
    this.attachedFish = null;
    // peck/dash 중인 물고기 잠금 (한 마리만 미끼 노리도록)
    this.targetedBy = null;
    // ─── 미끼 bump (spring-damper) ───
    //   PECKING 시 fish 가 미끼 터치 → applyBump() 로 impulse 전달.
    //   매 프레임 spring 으로 0 복귀 (k=stiffness, c=damping).
    this._bumpOX = 0;       // 현재 bump x 오프셋
    this._bumpOY = 0;
    this._bumpVX = 0;       // bump velocity
    this._bumpVY = 0;
    // 입질 시도 cooldown (초)
    this._biteCooldown = 0;
    // 유저 모드 II — 미끼가 CAST 버튼에서 발사되는 방식
    this._mode = 'auto';     // 'auto' | 'user' | 'user2' — FishingScene 이 setMode 로 지정
    this._baseY = 0;         // 낚싯줄 출발점 y (기본 0 = 화면 상단, user2 = CAST 버튼 y)
    this._u2Angle    = -Math.PI / 2;   // 발사 각도 (atan2 좌표계, -π/2 = 위)
    this._u2Vel      = 0;     // 현재 속도 (가속도 적분)
    // ─── Throw (FLY) — 빠른 발사 ───
    this._u2InitVel  = 260;   // 발사 시작 속도 (이전 180 → 더 빠르게)
    this._u2MaxVel   = 720;   // 최대 속도 (이전 480 → 더 빠르게)
    this._u2Accel    = 720;   // 가속도 (px/s²)
    // ─── Decelerate — release 후 관성 감속 ───
    this._u2Decel    = 700;   // 감속도 (px/s²) → 약 1초에 0 도달
    // ─── Reel — 회수 (가속) ───
    //   사용자 요청: 중간 누름 0.3s = 중속 (~470 px/s), 긴 누름 0.5s = 최대 (720 px/s).
    //   accel = (720 − 100) / 0.5 = 1240 px/s² → 0.5s 에 정확히 cap 도달.
    this._u2ReelInitVel = 100;    // 회수 시작 (짧은 탭 = 살짝만 이동)
    this._u2ReelMaxVel  = 720;    // 최대 속도 (긴 누름 = 빠른 회수)
    this._u2ReelAccel   = 1240;   // 가속도 (0.5s 에 max 도달)
    this._u2Edge     = 20;        // 화면 테두리에서 20px 안쪽까지가 최대
    // HOOKED 안착 lift (사용자 요청) — 잡은 물고기가 CAST 버튼 안으로 끌려들어오지 않도록
    //   파이팅 anchor 를 idle/회수 rest(baseY-30) 보다 이만큼 위로 올린다.
    this._u2HookedLift = 100;
  }

  // HOOKED(파이팅) 시 미끼가 안착할 anchor Y — idle/빈줄 회수 rest 보다 _u2HookedLift 만큼 위.
  _u2HookedAnchorY() {
    return (this._baseY ?? 0) - 30 - (this._u2HookedLift ?? 0);
  }

  /**
   * 유저 모드 II 초기화 — 미끼가 CAST 버튼 근처에서 출발, 위로 발사 가능.
   * @param {number} startX CAST 버튼 중심 x (= baseX, rod 출발점)
   * @param {number} startY CAST 버튼 위쪽 — 미끼 초기 위치 + 줄 출발 y
   */
  setUser2Mode(startX, startY) {
    this._mode = 'user2';
    this.baseX = startX;
    this._baseY = startY;
    this.x = startX;
    this.y = startY - 30;   // 미끼는 CAST 버튼 살짝 위에서 시작
    this.state = HOOK_STATE.USER2_AIM;
    // 기존 cast tween 취소
    if (this._castTween) {
      this._castTween.remove();
      this._castTween = null;
    }
  }

  /**
   * user2: 버튼 누름 — 상태에 따라 분기
   *   USER2_AIM   → USER2_FLY  (캡처된 각도로 발사, 빠른 가속)
   *   USER2_STOP/DECEL → USER2_REEL (회수 시작, init 속도부터 가속)
   *   USER2_FLY/REEL → 무시 (이미 동작 중)
   *   짧게 누르면 reel 속도가 init 에 머물러 조금만 이동,
   *   길게 누르면 가속도 적분으로 빠르게 회수.
   */
  user2Shoot(angle) {
    if (this._mode !== 'user2') return;
    if (this.state === HOOK_STATE.USER2_AIM) {
      this._u2Angle = angle;
      this._u2Vel   = this._u2InitVel;
      this.state = HOOK_STATE.USER2_FLY;
    } else if (this.state === HOOK_STATE.USER2_STOP || this.state === HOOK_STATE.USER2_DECEL) {
      this._u2Vel = this._u2ReelInitVel;
      this.state = HOOK_STATE.USER2_REEL;
      // 누름 시간 추적 — 0.5s 이상 시 long press 락 (release 이후에도 자동 완전 회수)
      this._u2ReelTime = 0;
      this._u2LongPressLocked = false;
    }
  }

  /**
   * user2: 버튼 뗌
   *   FLY                → DECEL (관성으로 더 진행 후 정지)
   *   REEL (≥0.5s 락)   → 유지 (자동 완전 회수, CAST 버튼 도달까지 계속 진행)
   *   REEL (짧은 누름)   → STOP (즉시 정지, 부분 회수)
   */
  user2Stop() {
    if (this._mode !== 'user2') return;
    if (this.state === HOOK_STATE.USER2_FLY) {
      this.state = HOOK_STATE.USER2_DECEL;
    } else if (this.state === HOOK_STATE.USER2_REEL) {
      if (this._u2LongPressLocked) {
        // 긴 누름 락 — release 무시. 자동으로 CAST 버튼 도달까지 회수.
        return;
      }
      this.state = HOOK_STATE.USER2_STOP;
      this._u2Vel = 0;
    }
  }

  /** user2: 미끼 회수 완료 후 AIM 으로 복귀 (catch/fail 시 호출) */
  user2Reset() {
    if (this._mode !== 'user2') return;
    this.x = this.baseX;
    this.y = this._baseY - 30;
    this._u2Vel = 0;
    this.state = HOOK_STATE.USER2_AIM;
    this.attachedFish = null;
    this._u2LongPressLocked = false;
    this._u2ReelTime = 0;
    this._struggleFrozen = false;
    this._strugglePhase  = null;
    this._tensionLevel   = 0;
    this._lineTightness  = 0;
    this._proximityTensionBoost = 1.0;
    this._struggleTime   = 0;
    this._fishHp         = 0;
    this._fishMaxHp      = 0;
    this._forceSnapTimer  = 0;
    this._struggleVel     = 0;
    this._tensionSmoothed = 0;
    this._strikeWindow    = 1.5;
    this._firstPressDone  = false;
    this._lineSnapped     = false;
  }

  // 시각: 반투명 흰 줄 + 미끼 이미지 (lure)
  // struggle 시 줄은 TAUT (rod tip baseX → hook x 직선, 사선) — fish 가 좌우로 흔들리며
  // 줄이 팽팽하게 끌려가는 느낌. fish 의 횡 위치는 hook.x 자체가 oscillate 한 결과.
  // 미끼: 상단(this.y)이 줄 연결점, 하단(this.y + _lureHeight)이 미끼 끝(fish 입질 지점).
  _drawHook() {
    // 미끼 bump 오프셋 적용 — 입질 톡톡 시 lure 가 부드럽게 튕김
    let rx = this.x + (this._bumpOX || 0);
    let ry = this.y + (this._bumpOY || 0);
    let lureRotOverride = null;

    // ─── PECKING fish 가 있으면 lure 가 fish 입에 link 됨 (사용자 요청) ───
    //   lure 의 중간점 (midpoint) 을 fish mouth 에 일치 → 입과 lure 의 중간이 걸림.
    //   anchor 는 mouth 에서 rod 방향으로 lureLen/2 만큼 떨어진 곳 (lure 의 절반은 rod 쪽 visible,
    //   나머지 절반은 fish 입 안쪽으로 들어가 fish body 에 covered).
    const peckFish = (this.targetedBy
      && this.targetedBy.state === 'PECKING'
      && this.state !== HOOK_STATE.HOOKED
      && this.targetedBy.sprite)
      ? this.targetedBy : null;
    if (peckFish) {
      const lh = this._lureHeight || 30;
      // 사용자 요청: mouth 가 image 끝(0.40)보다 살짝 안쪽(0.35) → lure 가 입 안으로 살짝 들어감.
      //   fish positioning 의 FISH_MOUTH_FRAC 와 동일하게 0.35.
      const fhead = peckFish.def.size * 0.35;
      const sprRot = peckFish.sprite.rotation;
      // head direction world: (sin(rot), -cos(rot))
      const hdx = Math.sin(sprRot);
      const hdy = -Math.cos(sprRot);
      const mouthX = peckFish.x + hdx * fhead;
      const mouthY = peckFish.y + hdy * fhead;
      const rodX = this.baseX;
      const rodY = this._baseY || 0;
      let dxr = rodX - mouthX;
      let dyr = rodY - mouthY;
      const drm = Math.sqrt(dxr * dxr + dyr * dyr) || 1;
      // anchor 를 mouth 에서 rod 쪽으로 lh/2 만큼 → lure midpoint = mouth.
      const halfLh = lh / 2;
      rx = mouthX + halfLh * (dxr / drm) + (this._bumpOX || 0);
      ry = mouthY + halfLh * (dyr / drm) + (this._bumpOY || 0);
      // lure rotation: anchor → tip 방향이 rod 반대 (= -unit(rod-mouth)) 와 일치
      lureRotOverride = Math.atan2(dxr / drm, -dyr / drm);
    }

    this.line.clear();
    // 사용자 요청: 줄 끊김 중에는 line 안 그림 (snap effect 가 별도로 표시).
    if (this._lineSnapped) {
      // lure 도 hide (떨어진 느낌)
      if (this.lure) this.lure.setVisible(false);
      return;
    }
    if (this.lure && !this.lure.visible) this.lure.setVisible(true);
    // 사용자 요청: 낚시줄 노란색
    this.line.lineStyle(1.8, 0xffe040, 0.85);
    // rod tip (baseX, baseY) → 미끼 상단 (rx, ry)
    //   기본 모드: baseY=0 (화면 위에서 줄이 내려옴)
    //   user2 모드: baseY = CAST 버튼 위치 (아래에서 발사)
    //
    // 낚시줄 묘사 (사용자 요청):
    //   - tightness 1 (HOOKED 또는 REEL 후 팽팽): 직선
    //   - tightness 0 (slack): wavy with full amp
    //   - 0 < tightness < 1: 진폭이 (1 - tightness) 만큼 축소 → 점진 팽팽화
    const bX = this.baseX;
    const bY = this._baseY || 0;
    const ldx = rx - bX;
    const ldy = ry - bY;
    const tightness = this._lineTightness ?? 0;
    const isTaut = tightness >= 0.99;

    if (isTaut) {
      this.line.lineBetween(bX, bY, rx, ry);
    } else {
      const lineDist = Math.sqrt(ldx * ldx + ldy * ldy) || 1;
      const perpX = -ldy / lineDist;
      const perpY =  ldx / lineDist;
      // 진폭 — 가까울수록 크게, 멀어지면 감소. tightness 만큼 추가 축소.
      const wavyAmp = Math.max(4, 35 - lineDist * 0.07) * (1 - tightness);
      const cycles = Math.max(2.5, Math.min(4.5, lineDist / 120));
      const SEG = 28;
      this.line.beginPath();
      this.line.moveTo(bX, bY);
      for (let i = 1; i <= SEG; i++) {
        const t = i / SEG;
        const sx = bX + ldx * t;
        const sy = bY + ldy * t;
        const taper = Math.sin(t * Math.PI);
        const wave  = Math.sin(t * Math.PI * 2 * cycles) * wavyAmp * taper;
        this.line.lineTo(sx + perpX * wave, sy + perpY * wave);
      }
      this.line.strokePath();
    }

    // 미끼 이미지 — origin(0.5, 0) 이라 상단 중심이 (rx, ry)
    //   user2 모드: 미끼의 tip 이 CAST 버튼 반대 방향을 향하도록 회전.
    //   lure 의 local +Y 가 (lure 본체 진행 방향) outward 방향 (CAST → lure) 과 일치하도록.
    //   rotation = atan2(dy, dx) - π/2 (Phaser rotation=0 일 때 +Y=down 인 점 고려).
    if (this.lure) {
      this.lure.setPosition(rx, ry);
      if (lureRotOverride !== null) {
        // PECKING — lure 가 fish 입 향함
        this.lure.setRotation(lureRotOverride);
      } else if (this._mode === 'user2') {
        const dx = rx - this.baseX;
        const dy = ry - (this._baseY ?? 0);
        if (dx * dx + dy * dy > 1) {
          this.lure.setRotation(Math.atan2(dy, dx) - Math.PI / 2);
        }
      }
    } else if (this.hookG) {
      this.hookG.clear();
      this.hookG.fillStyle(0xb0b0b0, 1);
      this.hookG.fillCircle(rx, ry + 4, 3);
      this.hookG.lineStyle(1.5, 0x303030, 1);
      this.hookG.strokeCircle(rx, ry + 4, 3);
    }
  }

  // 사용자 요청: 미끼가 castStartY 에 바로 배치되지 않고, 화면 위에서 천천히 내려옴.
  // 1) y 를 화면 위 (-30) 로 teleport
  // 2) tween 으로 castStartY 까지 2.2s 동안 Sine.Out (시작 빠름 → 끝 느림 = 자연스러운 캐스팅)
  // 3) tween 완료 시 state = DESCEND (정상 게임플레이 재개)
  cast() {
    if (this._castTween) {
      this._castTween.remove();
      this._castTween = null;
    }
    this.y = -30;
    this.x = this.baseX;
    this.state = HOOK_STATE.CASTING;
    this._autoReeling = false;
    this._strugglePhase = null;
    this.attachedFish = null;
    this.struggleFailed = false;

    // 사용자 요청 정확 구현: position 1 → position 2 (위로 복귀)
    //  Phase 1 (position 1): -30 → castStartY + 80 = 700  (강하, 1.4s, Cubic.Out)
    //  Phase 2 (position 2): 700 → castStartY = 620      (천천히 위로 80px, 1.6s, Sine.InOut)
    //  cast 종료 후 state=IDLE → 자동 descent 안 함 (X 위치로 안 떨어짐)
    const phase1Y = FISHING.castStartY + 80;
    this._castTween = this.scene.tweens.chain({
      targets: this,
      tweens: [
        { y: phase1Y,              duration: 1400, ease: 'Cubic.Out' },
        { y: FISHING.castStartY,   duration: 1600, ease: 'Sine.InOut' },
      ],
      onComplete: () => {
        this.state = HOOK_STATE.IDLE;     // cast 끝 → IDLE 로 정착 (DESCEND 아님)
        this._castTween = null;
      },
    });
  }

  /**
   * 사용자 입력 없이 강제로 위로 끌어올림 (낚시 실패 시).
   * castStartY 도달 후 자동으로 다시 DESCEND 진입.
   */
  forceReel() {
    this._autoReeling = true;
  }

  reset() {
    this.y = FISHING.castStartY;
    this.x = this.baseX;            // 횡 흔들림 해제 → 원위치
    this.state = HOOK_STATE.IDLE;
    this.attachedFish = null;
    this.targetedBy = null;
    this._strugglePhase = null;
    this.struggleFailed = false;
    this._drawHook();
  }

  attachFish(fish) {
    this.attachedFish = fish;
    this.state = HOOK_STATE.HOOKED;
    // ─── 저항 메카닉 (사용자 요청) ───
    //   3~4 사이클 = 끌어올림 ↔ 저항 → 최종 성공/실패 결정
    //   각 사이클은 느리게, 낚시줄이 좌우로 흔들림
    this._struggleCycle  = 0;
    this._struggleTarget = 3 + Math.floor(Math.random() * 2);   // 3 or 4
    this._strugglePhase  = 'pulling';
    this._struggleTimer  = 0;
    this._wobbleT        = 0;
    this.struggleFailed  = false;
    this._tensionLevel    = 0;     // 시작: 중앙
    this._tensionSmoothed = 0;     // HP 소모용 smoothed tension
    this._struggleTime    = 0;     // HOOKED 누적 시간 (time-based difficulty)
    this._struggleVel     = 0;     // press/release 전환 시 lerp 용 signed velocity
    // 챔질 (Strike) window — 물고기 문 후 1.5s 안에 첫 press 안 하면 도주.
    this._strikeWindow    = 1.5;
    this._firstPressDone  = false;

    // ─── 텐션 민감도 (사용자 요청: 작은 물고기 / 비싼 물고기 = 민감도 ↑) ───
    const def = fish?.def ?? {};
    const score = def.score ?? 100;
    const size  = def.size  ?? 80;
    const valueSens = Math.max(1.0, Math.min(2.0, score / 100));
    const sizeSens  = Math.max(1.0, Math.min(2.0, 80 / size));
    this._tensionSensitivity = Math.max(valueSens, sizeSens);

    // ─── Fish HP (size + score) ───
    this._fishMaxHp = score + size;
    this._fishHp    = this._fishMaxHp;

    // ─── Phase 3: 낚시줄 강도 → 줄 끊김 ───
    //   fish.weight (kg, getFishCombatProfile) 와 line.strength (kg, items.config.js) 비교.
    //   Phase 3 이전 legacy: this._lineStrength=200 (size 기반) 이었음.
    //   현재: FishingScene 이 setEquipment(line) 호출로 weight 단위 line.strength 주입.
    //   fishWeight > lineStrength: 초과 비율 × 15s 후 강제 snap.
    const lineStrengthKg = this._lineStrength ?? 200;
    const combat = getFishCombatProfile(def.id);
    const fishWeight = combat?.weight ?? (size / 4);   // fallback: size px 의 1/4 을 weight 로 근사
    this._fishWeight = fishWeight;   // 추후 UI/디버그 참조용
    if (fishWeight > lineStrengthKg) {
      const ratio = fishWeight / lineStrengthKg;
      // 무거운 fish 일수록 빨리 끊김 (ARCH-04: forceSnapBaseSec 15 / ratio, 최소 forceSnapMinSec 3).
      this._forceSnapTimer = Math.max(FIGHT.forceSnapMinSec, FIGHT.forceSnapBaseSec / ratio);
    } else {
      this._forceSnapTimer = 0;
    }
  }

  /**
   * 장비 spec 주입 — FishingScene 이 매치 시작 / 장비 변경 시 호출.
   *   line.strength (kg)  → 줄 끊김 임계
   *   rod.power    (kg)   → 잡을 수 있는 최대 fish weight (FishingScene 이 게이트로 사용)
   *   reel.drag    (0~1)  → 텐션 흡수 (Phase 4 에서 사용)
   *   reel.stability(0~1) → 텐션 스파이크 감쇠 (Phase 4)
   *
   * @param {object} opts
   * @param {object} [opts.line]
   * @param {object} [opts.rod]
   * @param {object} [opts.reel]
   */
  setEquipment({ line, rod, reel } = {}) {
    if (line) {
      this._lineStrength = line.strength;
      this._lineStretch  = line.stretch;
    }
    if (rod) {
      this._rodPower    = rod.power;
      this._rodAction   = rod.action;
      this._rodLength   = rod.length;
    }
    if (reel) {
      this._reelDrag      = reel.drag;
      this._reelSpeed     = reel.reelSpeed;
      this._reelStability = reel.stability;
    }
  }

  /** rod.power 와 비교해 fish 너무 큰지 — FishingScene 이 attach 전 호출. */
  canHookFish(fish) {
    if (!fish?.def) return false;
    const rodPower = this._rodPower;
    if (rodPower == null) return true;   // 장비 미설정 시 게이트 무시 (legacy)
    const combat = getFishCombatProfile(fish.def.id);
    return (combat?.weight ?? 0) <= rodPower;
  }

  /**
   * 무게 초과 어종 reject 를 "깔끔한 reject" 로 마무리 (BUG-02).
   *   기존: 잡을 수 없는 어종(예: 상어)이 매 ~3.5s 마다 입질 → HOOKED 도달 → 즉시 reject
   *         → respawn → 다시 입질 … 무한 bite→reject 루프(순수 friction).
   *   이 메서드는 reject 직후 긴 입질 쿨다운을 걸어 동일/유사 over-weight 어종이
   *   곧바로 재입질하지 못하게 throttle 한다. targetedBy 도 함께 해제.
   *   (FishingScene._onRodTooWeak 가 reject 처리 시 호출하도록 의도 — riskNotes 참조.)
   */
  rejectOverweightFish() {
    this.targetedBy = null;
    const cd = FIGHT.overweightRejectCooldownSec ?? 6;
    // 기존 쿨다운보다 짧아지지 않도록 max 로 갱신.
    this._biteCooldown = Math.max(this._biteCooldown ?? 0, cd);
  }

  /**
   * 미끼에 외력 전달 — 입질 톡톡 시 fish 가 호출.
   * @param {number} ix - x 방향 impulse (px/s)
   * @param {number} iy - y 방향 impulse (px/s)
   */
  applyBump(ix, iy) {
    this._bumpVX += ix;
    this._bumpVY += iy;
  }

  /**
   * 미끼의 tip (fish 가 무는 지점) 위치 반환.
   *   - lure origin (0.5, 0) — anchor 가 sprite 상단.
   *   - tip 은 local (0, _lureHeight). rotation 적용해 world 좌표 계산.
   *   - auto/user (rotation 0): tip = (this.x, this.y + lureHeight) → anchor 바로 아래.
   *   - user2 (rotation θ): tip 이 CAST 반대 방향 (outward) 으로 lureHeight 만큼 떨어진 지점.
   */
  getLureTip() {
    const lh = this._lureHeight || 30;
    if (!this.lure) return { x: this.x, y: this.y };
    const rot = this.lure.rotation;
    return {
      x: this.x - lh * Math.sin(rot),
      y: this.y + lh * Math.cos(rot),
    };
  }

  isAtTop() {
    // user2: 사용자 요청 — catch 성공 = fish HP 0 도달 (거리 X).
    //   stage 5~6 텐션 유지로 HP 를 깎아야 catch.
    if (this._mode === 'user2') {
      if (this.state !== HOOK_STATE.HOOKED) return false;
      return (this._fishHp ?? 1) <= 0;
    }
    // HOOKED 일 때는 reelTopY (더 위) 까지 올라가야 isAtTop 처리
    const top = this.state === HOOK_STATE.HOOKED
      ? (FISHING.reelTopY ?? FISHING.castStartY)
      : FISHING.castStartY;
    return this.y <= top + 4;
  }

  /**
   * @param {number} dtSec — delta time in seconds
   * @param {boolean} isTapping — 사용자가 화면을 누르고 있는지
   * @param {number} maxDepth — 도달 가능한 최대 수심
   */
  update(dtSec, isTapping, maxDepth = FISHING.maxDepth) {
    // 입질 cooldown 감소 (모든 상태에서)
    if (this._biteCooldown > 0) this._biteCooldown -= dtSec;
    this._wobbleT = (this._wobbleT ?? 0) + dtSec;

    // ─── 미끼 bump spring-damper (모든 모드 공통 — peck 톡톡 반응) ───
    //   ax = -k·x - c·v.  k=70 (낮춰 진폭 ↑), c=9 (감쇠 ↓ → 1~2회 더 튕김)
    const K = 70, C = 9;
    const ax = -K * this._bumpOX - C * this._bumpVX;
    const ay = -K * this._bumpOY - C * this._bumpVY;
    this._bumpVX += ax * dtSec;
    this._bumpVY += ay * dtSec;
    this._bumpOX += this._bumpVX * dtSec;
    this._bumpOY += this._bumpVY * dtSec;

    // ─── 낚시줄 tightness (0=full slack wavy, 1=fully taut 직선) ───
    //   HOOKED: 즉시 1 (잡힌 순간 line 바로 팽팽)
    //   USER2_REEL: 0 → 1 로 lerp — 회수 시 먼저 팽팽
    //   PECKING/DASHING (사용자 요청): 0.7 로 lerp — 입질 시작하면 줄이 어느 정도 팽팽
    //   그 외 / FLEEING: 0 으로 lerp (느슨)
    const targetedBy = this.targetedBy;
    const fishBiting = targetedBy && !targetedBy.dead && (
      targetedBy.state === 'PECKING' || targetedBy.state === 'DASHING'
    );
    if (this.state === HOOK_STATE.HOOKED) {
      this._lineTightness = 1;
    } else {
      let target = 0;
      if (this.state === HOOK_STATE.USER2_REEL) target = 1;
      else if (fishBiting) target = 0.75;     // 입질 중 — 절반 이상 팽팽
      const cur = this._lineTightness ?? 0;
      this._lineTightness = cur + (target - cur) * Math.min(1, dtSec * 4.0);
    }

    // 유저 모드 II — 전용 update 분기.
    //   HOOKED 상태에선 struggle (사용자 입력 기반) 을 실행.
    //   그 외 상태(AIM/FLY/DECEL/STOP/REEL) 는 _updateUser2 가 처리.
    if (this._mode === 'user2') {
      if (this.state === HOOK_STATE.HOOKED) {
        this._updateStruggle(dtSec, isTapping);
        // 화면 경계 clamp (다른 user2 상태와 동일)
        const sw = this.scene.scale?.width  ?? 720;
        const sh = this.scene.scale?.height ?? 1280;
        const pad = this._u2Edge;
        if (this.x < pad)      this.x = pad;
        if (this.x > sw - pad) this.x = sw - pad;
        if (this.y < pad)      this.y = pad;
        if (this.y > sh - pad) this.y = sh - pad;
        this._drawHook();
        return;
      }
      this._updateUser2(dtSec);
      return;
    }

    // 미끼 미세 floating 흔들림 (사용자 요청) — struggle pulling/resisting 단계는 제외
    //   (그 단계에서는 _updateStruggle 이 큰 진폭 흔들림으로 this.x 를 덮어씀)
    //   final-pull / failed / IDLE / DESCEND / REELING / autoReel 모두에서 적용 → 자연스럽게 떠 있음.
    //   ±3px, 1.8 rad/s (느림, 미세함).
    const struggleControlsX =
      this.state === HOOK_STATE.HOOKED &&
      (this._strugglePhase === 'pulling' || this._strugglePhase === 'resisting');
    if (!struggleControlsX) {
      this.x = this.baseX + Math.sin(this._wobbleT * 1.8) * 3;
    }

    // 자동 reel-up (낚시 실패 시) — 모든 상태보다 우선
    if (this._autoReeling) {
      this.y -= FISHING.hookReelSpeed * dtSec;
      if (this.y <= FISHING.castStartY) {
        this.y = FISHING.castStartY;
        this._autoReeling = false;
        this.state = HOOK_STATE.DESCEND;   // 자동 cast 재개
      }
      this._drawHook();
      return;
    }

    if (this.state === HOOK_STATE.IDLE) {
      this._drawHook();
      return;
    }

    // CASTING — tween 이 this.y 를 제어. 자체 이동 로직 스킵.
    if (this.state === HOOK_STATE.CASTING) {
      this._drawHook();
      return;
    }

    if (this.state === HOOK_STATE.HOOKED) {
      this._updateStruggle(dtSec, isTapping);
    } else if (isTapping) {
      // 탭 하는 동안 위로
      this.y -= FISHING.hookReelSpeed * dtSec;
      this.state = HOOK_STATE.REELING;
    } else {
      // 자유 낙하 — 사용자 요청: castStartY 아래로 안 내려감 (X 위치 회피)
      if (this.y < FISHING.castStartY) {
        this.y += FISHING.hookDescendSpeed * dtSec;
        if (this.y > FISHING.castStartY) this.y = FISHING.castStartY;
        this.state = HOOK_STATE.DESCEND;
      } else {
        // castStartY 에 도달 → IDLE 정착
        this.state = HOOK_STATE.IDLE;
      }
    }

    // 경계 처리 — HOOKED/REELING 시 reelTopY 까지 올라감 (사용자 요청: 버튼 누름 시 50px 더 위)
    // 그 외 (IDLE/DESCEND) 는 castStartY 까지
    const minY = (this.state === HOOK_STATE.HOOKED || this.state === HOOK_STATE.REELING)
      ? (FISHING.reelTopY ?? FISHING.castStartY)
      : FISHING.castStartY;
    if (this.y < minY)     this.y = minY;
    if (this.y > maxDepth) this.y = maxDepth;

    this._drawHook();
  }

  // ─── 저항 사이클 ─── (사용자 요청)
  //   pulling   : 느리게 위로 (정상 reel 의 25%) — 1.4s
  //   resisting : fish 가 끌어내림 (descend 의 35%) — 0.9s
  //   사이클 완료 → 다음 cycle 또는 마지막엔 성공/실패 결정
  //   final-pull: 정상 속도로 끝까지 (성공 경로)
  //   failed    : struggleFailed=true → FishingScene 이 정리
  _updateStruggle(dtSec, isTapping = false) {
    // user2 — 사용자 입력 기반 (cycle 없이 hold/release 로 직접 제어)
    if (this._mode === 'user2') {
      this._updateUser2Struggle(dtSec, isTapping);
      return;
    }
    this._struggleTimer += dtSec;
    // 코드 리뷰 4-4: 매 프레임 재선언 대신 FISHING 설정에서 1회 참조
    const PULL_DUR   = FISHING.strugglePullDurSec   ?? 1.4;
    const RESIST_DUR = FISHING.struggleResistDurSec ?? 0.9;

    // ─── 텐션 게이지 — spring 기반 (사용자 요청: needle 이 텐션 변화를 명확히 반영) ───
    //   각 phase 마다 needle 이 향할 "목표" 위치가 있고, spring k 로 매끄럽게 수렴.
    //   pulling 목표 +0.70 (우측 위험권), resisting 목표 -0.40 (좌측 안전권)
    //   tap 시 목표가 더 극단 → 시각적으로 더 명확한 reaction.
    //   k=4.0 → 약 1초 만에 거의 도달 → 1.4s/0.9s phase 내 visible swing 완료.
    let tensionTarget = 0;
    if (this._strugglePhase === 'pulling') {
      tensionTarget = isTapping ? 0.92 : 0.70;
    } else if (this._strugglePhase === 'resisting') {
      tensionTarget = isTapping ? -0.10 : -0.40;
    }
    const k = 4.0;
    const curT = this._tensionLevel ?? 0;
    this._tensionLevel = curT + (tensionTarget - curT) * k * dtSec;
    // 미세 jitter — needle 이 살아있는 듯 떨림 (작게)
    this._tensionLevel += (Math.random() - 0.5) * 0.02;
    // 오른쪽 끝 → 줄 끊김
    if (this._tensionLevel >= 0.95) {
      this._tensionLevel = 1.0;
      this._strugglePhase = 'failed';
      this.struggleFailed = true;
      return;
    }
    // 왼쪽은 -1 까지 clamp
    if (this._tensionLevel < -1.0) this._tensionLevel = -1.0;

    if (this._strugglePhase === 'pulling') {
      // pulling: 정상 reel 의 25%. 사용자 탭 시 50% 가속 → 더 빠르게 reel-in.
      const pullMul = isTapping ? 0.50 : 0.25;
      this.y -= FISHING.hookReelSpeed * pullMul * dtSec;
      if (this._struggleTimer >= PULL_DUR) {
        this._strugglePhase = 'resisting';
        this._struggleTimer = 0;
      }
    } else if (this._strugglePhase === 'resisting') {
      // resisting: 탭 시 텐션 증가 = 더 빠르게 끌어내려짐 (실패 방향).
      const resistMul = isTapping ? 0.55 : 0.35;
      this.y += FISHING.hookDescendSpeed * resistMul * dtSec;
      if (this._struggleTimer >= RESIST_DUR) {
        this._struggleCycle += 1;
        this._struggleTimer = 0;
        if (this._struggleCycle >= this._struggleTarget) {
          // 사용자 요청: 텐션 게이지가 오른쪽 끝(0.95+) 안 넘었으면 성공.
          //   기존 30% 랜덤 실패 제거 — 실패는 오직 tension break 로만.
          this._strugglePhase = 'final-pull';
        } else {
          this._strugglePhase = 'pulling';
        }
      }
    } else if (this._strugglePhase === 'final-pull') {
      this.y -= FISHING.hookReelSpeed * dtSec;
    }

    // ─── 횡 흔들림 (사용자 요청) ───
    //   pulling/resisting 단계에서 hook.x 를 좌우로 oscillate → fish 가 따라서 흔들림
    //   줄은 baseX(rod tip, 상단) → x(hook, 하단) 사선으로 팽팽하게 그려짐
    //   final-pull 단계는 흔들림 없이 일직선 — 깔끔하게 끌어올림
    if (this._strugglePhase === 'pulling' || this._strugglePhase === 'resisting') {
      const t = this._wobbleT;
      // 복합 sin — 8 rad/s ±30px + 13.5 rad/s ±10px (불규칙한 thrash 느낌)
      this.x = this.baseX + Math.sin(t * 8) * 30 + Math.sin(t * 13.5) * 10;
    } else {
      this.x = this.baseX;
    }
  }

  // ─── 유저 모드 II 전용 struggle ───
  //   누름 (isTapping=true)  : CAST 방향으로 fish 끌어옴 + 텐션 점진 상승
  //   뗌   (isTapping=false) : fish 가 외곽으로 풀려남     + 텐션 빠르게 하강
  //   양 극단 fail:
  //     +0.95 (오른쪽, 과도 텐션) → 줄 끊김 (snap)
  //     -0.95 (왼쪽,  느슨)       → 물고기 놓침 (loose, 사용자 요청)
  //   플레이: 적당한 박자로 누름/뗌 → 텐션 가운데 유지하며 점진적 catch.
  _updateUser2Struggle(dtSec, isTapping) {
    if (this._struggleFrozen) return;

    // (HOOKED 단계 1.5s strike window 는 PECKING timeout 으로 이동 — Fish.js _updatePecking)
    // ─── 누적 시간 (시간 경과 = 난이도 증가) ───
    this._struggleTime = (this._struggleTime ?? 0) + dtSec;
    const timeBoost = 1 + Math.min(FIGHT.timeBoostCap, this._struggleTime / FIGHT.timeBoostDiv);

    // 사용자 요청: 큰 물고기 = 일정 시간 후 줄 끊김 (lineStrength < fish size 시).
    //   _forceSnapTimer 가 attachFish 에서 설정됨. 0 = disabled.
    if (this._forceSnapTimer > 0) {
      this._forceSnapTimer -= dtSec;
      if (this._forceSnapTimer <= 0 && !this._tutorialNoFail) {
        this._tensionLevel = 1.0;
        this._strugglePhase = 'failed';
        this.struggleFailed = true;
        this._failureReason = 'overweight';
        return;
      }
    }

    const sens = (this._tensionSensitivity ?? 1.0)
               * (this._proximityTensionBoost ?? 1.0)
               * timeBoost;
    // HP zone tension rate boost — 1.2 → 1.05 (사용자 요청: 추가 완화).
    const _tmpDx = this.baseX - this.x;
    const _tmpDy = this._u2HookedAnchorY() - this.y;
    const _tmpInHpZone = Math.sqrt(_tmpDx * _tmpDx + _tmpDy * _tmpDy) < FIGHT.hpZoneDist;
    const zoneRateBoost = _tmpInHpZone ? 1.05 : 1.0;
    // 대형 어종 tension 가속 (사용자 요청) —
    //   size > 130 이면 size/130 비율로 tension rise 가속 + drop 감속.
    //   상어(size 254) 기준 약 1.95× rise + 1/1.4× drop → 빠른 줄 끊김 위험.
    const fishSize = this.attachedFish?.def?.size ?? 80;
    const sizeRise = fishSize > FIGHT.sizeRiseThreshold
      ? Math.min(FIGHT.sizeRiseCap, fishSize / FIGHT.sizeRiseDiv) : 1.0;
    const sizeDrop = fishSize > FIGHT.sizeRiseThreshold
      ? 1.0 / Math.min(FIGHT.sizeDropCap, fishSize / FIGHT.sizeDropDiv) : 1.0;
    // 사용자 요청: base rate 도 살짝 낮춤 (0.45→0.38, 0.80→0.65).
    // Phase 4: reel.drag → 텐션 상승 감쇠 (drag 0.85 면 RISE -50%).
    //          reel.stability → jitter noise 감쇠 (stability 0.95 면 noise -90%).
    const reelDrag      = this._reelDrag      ?? 0;
    const reelStability = this._reelStability ?? 0;
    const dragDamp = 1 - (reelDrag * 0.6);              // 0→1.0, 0.85→0.49
    const TENSION_RISE = FIGHT.tensionRise * sens * zoneRateBoost * sizeRise * dragDamp;
    const TENSION_DROP = FIGHT.tensionDrop * sens * zoneRateBoost * sizeDrop;
    const curT = this._tensionLevel ?? 0;
    if (isTapping) {
      this._tensionLevel = curT + TENSION_RISE * dtSec;
    } else {
      const lo = Math.max(0, -curT);
      const accel = 1 + lo * 1.5;   // 좌측 페널티 완화(스텝 회복과 삼중스택 방지 — 검토 권고)
      this._tensionLevel = curT - TENSION_DROP * accel * dtSec;
    }
    // jitter — reel.stability 비례로 감쇠.
    const noiseAmp = 0.015 * (1 - reelStability * 0.9);  // 0→0.015, 0.95→0.0015
    this._tensionLevel += (Math.random() - 0.5) * noiseAmp;
    // (스텝 레이트 도입 — 양수 구간 추가 jitter 제거: 구간 seam 떨림 방지, 검토 권고)

    // 양 극단 fail — 튜토리얼(_tutorialNoFail) 중에는 실패 없이 안쪽으로 clamp.
    if (this._tensionLevel >= 0.95) {
      if (this._tutorialNoFail) {
        this._tensionLevel = 0.90;
      } else {
        this._tensionLevel = 1.0;
        this._strugglePhase = 'failed';
        this.struggleFailed  = true;
        this._failureReason  = 'snap';
        return;
      }
    }
    if (this._tensionLevel <= -0.95) {
      if (this._tutorialNoFail) {
        this._tensionLevel = -0.90;
      } else {
        this._tensionLevel = -1.0;
        this._strugglePhase = 'failed';
        this.struggleFailed  = true;
        this._failureReason  = 'loose';
        return;
      }
    }

    // ─── 이동 + HP 소모 ───
    //   6단계 게이지: stage1[-1,-0.67), stage2[-0.67,-0.33), stage3[-0.33,0),
    //                 stage4[0,0.33), stage5[0.33,0.67), stage6[0.67,0.95).
    //   1) HP zone (CAST 80px 이내) 도달 전: stage 5~6 시 CAST 쪽으로 pull, stage 1~3 시 release 로 escape.
    //   2) HP zone 도달 후: hook 위치 lock, stage 5~6 텐션 유지하면 HP 점점 소모.
    //      HP 0 → isAtTop() true → showcase.
    const tx = this.baseX;
    const ty = this._u2HookedAnchorY();   // CAST 버튼 위로 올린 파이팅 anchor
    const dx = tx - this.x;
    const dy = ty - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // Phase 4: reel.reelSpeed 반영 — base 320 기준 비율로 PULL_SPEED 조정.
    //   T1 manual 220 → ratio 0.69 (느림), T6 legend 600 → ratio 1.88 (빠름).
    const reelSpeedMul = (this._reelSpeed ?? 320) / 320;
    const PULL_SPEED   = FISHING.hookReelSpeed   * 0.35 * reelSpeedMul;
    const ESCAPE_SPEED = FISHING.hookDescendSpeed * 0.30;
    const HP_ZONE_DIST = FIGHT.hpZoneDist;
    const inHpZone = dist < HP_ZONE_DIST;

    // ─── HP 변화 — smoothed tension + 크기별 단계적 소모율 ───
    //   사용자 요청: 소형→대형 점진적 HP 소모도. size 작을수록 빠르게, 클수록 느리게.
    //   sizeFactor: size 60 → 2.0× / size 130 → 1.0× / size 400 → 0.3× (linear, clamped).
    //   Segments 1-3 (t < 0): 회복 / Segments 4-6 (t ≥ 0): 소모.
    {
      this._tensionSmoothed = this._tensionSmoothed ?? 0;
      this._tensionSmoothed += (this._tensionLevel - this._tensionSmoothed)
        * Math.min(1, dtSec * 6);
      const t = this._tensionSmoothed;
      const isInHp = inHpZone;
      const maxHp = this._fishMaxHp ?? 100;
      const finishingZone = (this._fishHp ?? 0) < maxHp * 0.12;
      // 크기 기반 sizeFactor — 소형 빠르게 / 대형 느리게.
      const fishSize = this.attachedFish?.def?.size ?? 100;
      const sizeFactor = Math.max(0.3, Math.min(2.0, 2.0 - (fishSize - 60) / 200));
      // 프레임 스파이크(탭 복귀) 과소모/과회복 방지 — 이동 분기와 동일한 dt clamp.
      const dtHp = Math.min(dtSec, 0.033);
      if (t >= 0) {
        // 소모: 구간 상수(④25 / ⑤50 / ⑥100, 2배씩↑) × sizeFactor. 존 밖 ×0.4.
        //   튜토리얼 중에는 단계 배율 평탄화(40 고정).
        const hpBefore = this._fishHp ?? 0;
        const zoneRate = this._tutorialNoFail ? 40 : fightConsumeRate(t);
        const rate = zoneRate * (isInHp ? 1 : 0.4) * sizeFactor;
        let hp = Math.max(0, hpBefore - rate * dtHp);
        // 60% floor: 존 밖 소모가 60% 아래로 내려가지 않게 — 단, 시작 HP 위로 절대 환급 X.
        if (!isInHp) {
          const effFloor = Math.min(maxHp * 0.6, hpBefore);
          if (hp < effFloor) hp = effFloor;
        }
        this._fishHp = hp;
      } else if (t < 0 && !finishingZone) {
        // 회복: 구간 상수(③8 / ②16 / ①32, 2배씩↑) × sizeFactor.
        //   ×sizeFactor 가 핵심 안전장치 — 대형어도 소모>회복(~3:1) 보장 → 죽음나선 방지.
        const zoneRate = this._tutorialNoFail ? 12 : fightRecoverRate(Math.abs(t));
        const heal = zoneRate * (isInHp ? 1 : 0.4) * sizeFactor * dtHp;
        this._fishHp = Math.min(maxHp, (this._fishHp ?? 0) + heal);
      }
    }

    // ─── 릴 = 게이지 연속 구동 (사용자 요청: ⑥ 쪽 감김 / ① 쪽 풀림) ───
    //   t>0(④⑤⑥): anchor(CAST) 쪽으로 reel-in, t<0(①②③): 바깥으로 reel-out.
    //   속도는 |t| 비례(⑥/① 로 갈수록 빠름). re-press jump 방지:
    //     dtSafe clamp + MAX_STEP + _struggleVel 을 target 으로 lerp(0 교차 허용, 하드리셋 X).
    const dtSafe = Math.min(dtSec, 0.033);
    const tSm = this._tensionSmoothed ?? 0;
    const finishing = (this._fishHp ?? 0) < (this._fishMaxHp ?? 100) * 0.12;
    let targetVel = 0;   // +: reel-in(anchor 쪽), -: reel-out(바깥)
    if (tSm >= 0) {
      const pullMul = Math.max(0.25, Math.min(1.30, 0.40 + tSm * 1.1));
      targetVel = PULL_SPEED * pullMul;
    } else if (!finishing) {
      // reel-out 은 항상 pull 보다 약하게 → 좋은 플레이는 net 전진. 피니시존은 풀림 억제.
      const outMul = Math.min(0.55, Math.abs(tSm) * 0.7);
      targetVel = -ESCAPE_SPEED * outMul;
    }
    const prevVel = this._struggleVel ?? 0;
    this._struggleVel = prevVel + (targetVel - prevVel) * Math.min(1, dtSafe * 8);

    const MAX_STEP_PER_FRAME = 3;
    const stepRaw = this._struggleVel * dtSafe;
    const step = Math.max(-MAX_STEP_PER_FRAME, Math.min(MAX_STEP_PER_FRAME, stepRaw));
    if (step > 0 && dist > 0.5) {
      // reel-in: anchor 쪽
      const moveDist = Math.min(step, dist);
      this.x += (dx / dist) * moveDist;
      this.y += (dy / dist) * moveDist;
    } else if (step < 0) {
      // reel-out: anchor 반대. leash 로 한 번의 슬랙이 너무 멀리 못 풀게 제한.
      const LEASH = HP_ZONE_DIST + 40;
      if (dist < LEASH) {
        const out = Math.min(-step, LEASH - dist);
        if (dist > 0.5) {
          this.x -= (dx / dist) * out;
          this.y -= (dy / dist) * out;
        } else {
          this.y += out;   // anchor 에 거의 붙어있으면 아래로 풀림
        }
      }
    }

    // HP zone 안 미세 게이지 흔들림 (살아있는 느낌 — 기존 유지).
    if (inHpZone) {
      this._tensionLevel += (Math.random() - 0.5) * 0.05;
      this._tensionLevel += Math.sin(this._struggleTime * 5) * 0.010;
      this._tensionLevel += Math.sin(this._struggleTime * 14) * 0.005;
    }

    // needle 텐션 표시 인식용
    this._strugglePhase = isTapping ? 'pulling' : 'resisting';
  }

  // ─── 유저 모드 II 전용 update ───
  //   USER2_AIM   : 미끼 정지 — needle swing 으로 사용자 조준
  //   USER2_FLY   : _u2Angle 방향으로 가속 비행 (initVel → maxVel)
  //   USER2_DECEL : 버튼 뗀 후 관성으로 감속 진행 (vel → 0 시 STOP)
  //   USER2_STOP  : 현재 위치 정지 (fish peck 가능)
  //   USER2_REEL  : CAST 버튼 방향 가속 회수 (init → maxReel)
  //   화면 테두리 20px 안쪽으로 clamp.
  _updateUser2(dtSec) {
    if (this.state === HOOK_STATE.USER2_FLY) {
      // 발사 — 빠르게 가속
      this._u2Vel = Math.min(this._u2MaxVel, this._u2Vel + this._u2Accel * dtSec);
      this.x += Math.cos(this._u2Angle) * this._u2Vel * dtSec;
      this.y += Math.sin(this._u2Angle) * this._u2Vel * dtSec;
    } else if (this.state === HOOK_STATE.USER2_DECEL) {
      // 관성 감속 — 현재 속도 유지하며 일정 비율로 줄어듦
      this._u2Vel = Math.max(0, this._u2Vel - this._u2Decel * dtSec);
      if (this._u2Vel <= 0.5) {
        this._u2Vel = 0;
        this.state = HOOK_STATE.USER2_STOP;
      } else {
        this.x += Math.cos(this._u2Angle) * this._u2Vel * dtSec;
        this.y += Math.sin(this._u2Angle) * this._u2Vel * dtSec;
      }
    } else if (this.state === HOOK_STATE.USER2_REEL) {
      // 회수 hold 시간 추적 — 0.5s 이상이면 long press 락 (release 후에도 완전 회수)
      this._u2ReelTime = (this._u2ReelTime ?? 0) + dtSec;
      if (this._u2ReelTime >= 0.5) this._u2LongPressLocked = true;

      // 사용자 요청: 회수 시 먼저 낚시줄이 빠르게 팽팽해진 후 미끼가 회수.
      //   _lineTightness 가 1 (≥0.95) 도달 전엔 미끼 정지.
      //   tightness 는 update() 의 lerp 가 자동 증가시킴.
      if ((this._lineTightness ?? 0) >= 0.95) {
        const targetX = this.baseX;
        const targetY = this._baseY - 30;
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 6) {
          this.x = targetX;
          this.y = targetY;
          this._u2Vel = 0;
          this.state = HOOK_STATE.USER2_AIM;
          this._u2LongPressLocked = false;
          this._u2ReelTime = 0;
        } else {
          this._u2Vel = Math.min(this._u2ReelMaxVel,
                                 this._u2Vel + this._u2ReelAccel * dtSec);
          const step = Math.min(dist, this._u2Vel * dtSec);
          this.x += (dx / dist) * step;
          this.y += (dy / dist) * step;
        }
      }
      // tightness < 0.95: 줄만 팽팽해지는 단계, 미끼 정지
    }
    // 경계 clamp
    const sw = this.scene.scale?.width  ?? 720;
    const sh = this.scene.scale?.height ?? 1280;
    const pad = this._u2Edge;
    if (this.x < pad)        this.x = pad;
    if (this.x > sw - pad)   this.x = sw - pad;
    if (this.y < pad)        this.y = pad;
    if (this.y > sh - pad)   this.y = sh - pad;
    this._drawHook();
  }

  destroy() {
    this.line?.destroy();
    this.hookG?.destroy();
    this.lure?.destroy();
    this.attachedFish = null;
  }
}
