/**
 * Fish — 한 마리 물고기. 낚시 메카닉 포함.
 *
 * 상태 머신:
 *   WANDER    : 자유 유영 (원형 궤도 + drift)
 *   ATTRACTED : hook 발견, 가까이 접근
 *   PECKING   : 톡톡 건드림 (2~5회), 매 peck 후 dash 확률 체크
 *   DASHING   : 미끼를 향해 빠르게 dash → hook 에 닿으면 HOOKED
 *   HOOKED    : 잡힘. FishingScene 이 위치/회전/anim 제어 (입이 hook 에)
 *
 * Hook 잠금:
 *   하나의 fish 가 ATTRACTED 진입 시 hook.targetedBy = this 로 점유.
 *   다른 fish 는 hook.targetedBy 가 있으면 WANDER 에 머무름.
 */

import Phaser from 'phaser';
import { HOOK_STATE } from './Hook.js';
import { getSwimProfile } from '../config/fish.config.js';

const BASE_SPEED = 45;

// 어종이 헤엄칠 수 있는 수직 범위 — sprite 의 size(높이) 를 반영해 동적 산출.
//
// 일반 어종 (small/mid): 캔버스 상단 가까이(y≈20) 까지 swim 허용.
//   HUD UI 는 z=110+, fish 는 z=7 → fish 가 자연스럽게 HUD 뒤에서 헤엄침.
// 대형 어종 (shark): 캔버스 상단까지 가면 sprite 가 너무 커서 어색.
//
// 사용자 요청: 하단 나무 데크 아래 영역도 fish 활동 공간으로 확장 →
//   FISH_DECK_TOP 를 데크 위(780) → 캔버스 바닥 근처(1180) 로 상향.
//   표준 모드에서는 deck/UI(z=11~140) 가 fish(z=6~7) 를 시각적으로 가리지만
//   플립/세로 확장 모드에서 그대로 노출.
const FISH_TOP_LIMIT_SMALL = 20;
const FISH_TOP_LIMIT_LARGE = 160;
const FISH_DECK_TOP        = 1180;   // 이전 780. 사용자 요청 — 데크 아래도 swim 영역.
const FISH_PEEK_UNDER_F    = 0.4;    // 클수록 (UI 너머) 안으로 더 들어감

// ─── 포식자 회피 (사용자 요청: 대형어종/먹이관계 어종을 주변에서 피함) ───
//   먹이사슬을 크기로 모델링: 상대가 내 크기의 PREDATOR_SIZE_RATIO 배 이상이면 포식자로 인지.
//   (특정 먹이관계가 필요하면 어종 def 에 fearsIds: ['shark', ...] 식으로 명시 지정 가능 — 옵션.)
const PREDATOR_SIZE_RATIO   = 1.5;   // 상대 크기 ≥ 내 크기 ×1.5 → 포식자로 인지
const PREDATOR_AVOID_MIN_R  = 110;   // 최소 회피 반경(px)
const PREDATOR_AVOID_R_FACT = 0.9;   // 회피 반경 = max(MIN_R, predatorSize × 0.9) — 큰 포식자일수록 넓게
const PREDATOR_FLEE_SPEED   = 95;    // 회피 시 궤도중심 이동 속도(px/s)
const PREDATOR_PANIC_DIST   = 75;    // 이 거리 안이면 놀란 듯 _fast anim

export const FISH_STATE = {
  WANDER:    'WANDER',
  FLEEING:   'FLEEING',
  ATTRACTED: 'ATTRACTED',
  PECKING:   'PECKING',
  DASHING:   'DASHING',
  HOOKED:    'HOOKED',
};

export class Fish {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} def      어종 정의
   * @param {number} startX   초기 x
   * @param {number} y        목표 depth (_cy) — 진입 후 정착할 y
   * @param {number} dir      좌/우 진행 방향 (+1=우향, -1=좌향)
   * @param {object} [opts]
   * @param {boolean} [opts.entryFromTop]    상단에서 내려오며 진입 (y=-50 → 목표 depth)
   * @param {boolean} [opts.entryFromBottom] 하단에서 올라가며 진입 (y=800 → 목표 depth)
   */
  constructor(scene, def, startX, y, dir, opts = {}) {
    this.scene = scene;
    this.def = def;
    this.dir = dir;
    this.dead = false;
    this.state = FISH_STATE.WANDER;

    // ─── 속도 jitter ───
    this._speedJitter = 0.7 + Math.random() * 0.6;
    const effSpeed = this.def.speed * this._speedJitter;

    // ─── 원형 궤도 ───
    // ignoresHook(대형 - 상어): 작은 wobble + 풀 횡 이동 → 거의 직선 횡단.
    if (def.ignoresHook) {
      this._orbitRadius = 25 + Math.random() * 20;
      this._orbitAngVel = 0.15 + Math.random() * 0.10;
      this._driftSpeed = effSpeed;                            // 풀 속도 (직선 횡단)
    } else {
      this._orbitRadius = 30 + Math.random() * 120;
      this._orbitRadius *= 0.5 + (effSpeed / BASE_SPEED) * 0.6;
      this._orbitAngVel = (0.4 + Math.random() * 0.5) * (effSpeed / BASE_SPEED);
      this._driftSpeed = 8 + Math.random() * 18;
    }
    if (Math.random() < 0.5) this._orbitAngVel *= -1;

    // ─── 어종별 유영 프로파일 적용 (사용자 요청: 자연스러운 종별 패턴) ───
    const profile = getSwimProfile(def.id);
    this._orbitRadius *= profile.orbitRadiusMul ?? 1;
    this._orbitAngVel *= profile.orbitAngVelMul ?? 1;
    this._driftSpeed  *= profile.driftMul       ?? 1;
    // 수직 wave multiplier (기본 vMul = 0.30 → 종별 ×0.3 ~ ×1.3 으로 조정)
    this._vMul = 0.30 * (profile.vWaveMul ?? 1);
    // 어종별 body wave (sprite Y scale 미세 진동 — 호흡/꼬리 흔들기 시각)
    this._bodyWaveAmp  = profile.bodyWaveAmp  ?? 0;
    this._bodyWaveFreq = profile.bodyWaveFreq ?? 0;
    this._bodyWaveT    = Math.random() * Math.PI * 2;   // 랜덤 phase

    // 초기 orbit 각도 고정 → fish 가 startX 에서 정확히 시작 (smooth off-screen 입장).
    //   dir = +1 (좌측 입장):  cos(angle) = -1 → angle = π
    //   dir = -1 (우측 입장):  cos(angle) = +1 → angle = 0
    this._orbitAngle = dir === 1 ? Math.PI : 0;

    this._cx = startX + dir * this._orbitRadius;
    this._cy = y;
    this.x = startX;
    this.y = y;

    // ─── drift 진행 방향 yaw (수평 ± 약 60° 안에서 random) ───
    // 사용자 요청: 순수 수평/수직 swim 이 아닌 다양한 random 각도 swim.
    // yaw > 0 = 하향 진행, yaw < 0 = 상향 진행 (screen coord).
    // 매 ~2-4초마다 target yaw 갱신, 매 프레임 부드럽게 lerp.
    // 초기 yaw 는 작은 ±20° 정도로 시작 (입장 직후 너무 가파르지 않게).
    this._driftYaw       = (Math.random() - 0.5) * (Math.PI / 4);    // ±22.5°
    this._driftYawTarget = this._driftYaw;
    this._driftYawTimer  = 2 + Math.random() * 2;

    // ─── 수직 진입 phase (상단/하단 입장) ───
    // entryFromTop  : sprite 가 완전히 화면 위(canvas top=0 보다 더 위) 에서 시작
    //                 → 천천히 내려와 목표 depth 도달 시 정상 orbit 으로 전환.
    // entryFromBottom: 데크 아래(완전히 가려진 곳) 에서 올라와 목표 depth 도달.
    // sprite halfHeight 를 고려해서 시작 y 가 화면 밖에 머물도록.
    const halfHForEntry = (def.size ?? 60) * 0.5;
    this._entryYVel = 0;
    this._entryTargetY = y;
    if (opts.entryFromTop) {
      this.y = -halfHForEntry - 30;                  // sprite 가 캔버스 위로 완전 벗어남
      this._entryYVel = 60 + Math.random() * 40;
    } else if (opts.entryFromBottom) {
      // 반응형: 실제 캔버스 높이 기준 (코드 리뷰 3-3)
      const sceneH = scene.scale?.height ?? 1280;
      this.y = sceneH + halfHForEntry + 20;          // 화면 아래 완전 벗어남
      this._entryYVel = -(60 + Math.random() * 40);
    }

    // 대형 어종(ignoresHook)은 heading 기반 직진 모델 사용.
    //   - 진행 방향(_heading) 으로 항상 전진 → 뒤로 가지 않음.
    //   - _headingTurnRate 가 천천히 변하면서 점진적 방향전환 효과.
    if (def.ignoresHook) {
      this._heading = dir === 1 ? 0 : Math.PI;             // 0=우, π=좌
      this._headingTurnRate = 0;                           // rad/sec, slowly drifts
      this._headingTurnTimer = 2 + Math.random() * 3;      // 다음 회전 변경 시점
    }

    this._mutateTimer = 4 + Math.random() * 6;

    // ─── 낚시 메카닉 ───
    this._peckTarget = 0;
    this._peckCount  = 0;
    this._peckTimer  = 0;
    this._peckCycleDur = 0.55;
    this._dashTimer  = 0;
    // Phase 2: spawner 가 미끼 매칭으로 _hookInterest 를 결정 (opts.hookInterest).
    //   spawner 가 명시한 값(true/false) 우선. 미명시 시 legacy 80% fallback.
    this._hookInterest = (typeof opts.hookInterest === 'boolean')
      ? opts.hookInterest
      : (Math.random() < 0.80);

    // 어종별 깊이 (HOOKED 시 reel-up 안내용)
    this._depthRange = { min: def.depthMin, max: def.depthMax };

    this.sprite = this._makeSprite();
    this.sprite.setPosition(this.x, this.y);
    // 텍스처 누락으로 _makeSprite 가 dead container 를 반환하면 Fish 인스턴스도 즉시 dead 처리.
    //   → FishSpawner 의 dead 필터가 다음 tick 에 정리, zombie 누적 방지.
    if (this.sprite?.dead) this.dead = true;
  }

  _makeSprite() {
    if (!this.def.sprite || !this.scene.textures.exists(this.def.sprite)) {
      const c = this.scene.add.container(0, 0);
      c.dead = true;
      return c;
    }
    const sprite = this.scene.add.sprite(0, 0, this.def.sprite);
    // z-depth — 상어는 다른 fish 뒤 (6). 너무 낮으면 caustics/shimmer 가 덮어 안 보임.
    sprite.setDepth(this.def.ignoresHook ? 6 : 7);

    const tex = sprite.texture.get(0);
    const frameW = tex?.width || 256;
    // 상어 거리감 — 살짝만 작게 (×0.85).
    const sizeAdjust = this.def.ignoresHook ? 0.85 : 1.0;
    const baseScale = (this.def.size * sizeAdjust) / frameW;
    sprite.setScale(baseScale);
    this._baseSpriteScale = baseScale;   // body wave 시 기준 scale

    const effSpeed = this.def.speed * this._speedJitter;
    const orbitMag = Math.abs(this._orbitAngVel);
    const intensity = (effSpeed / BASE_SPEED) * 0.7 + orbitMag * 0.6;

    const base = this.def.animKey;     // e.g. 'clownfish_swim' / 'bluetang_swim'
    let animKey;
    if (intensity < 0.7)      animKey = `${base}_slow`;
    else if (intensity < 1.3) animKey = `${base}_normal`;
    else                      animKey = `${base}_fast`;

    this._currentAnim = animKey;
    if (this.scene.anims.exists(animKey)) {
      sprite.play({ key: animKey, startFrame: Math.floor(Math.random() * 4) });
    }
    return sprite;
  }

  _playAnim(key) {
    if (this._currentAnim === key) return;
    if (!this.scene.anims.exists(key)) return;
    this.sprite.play(key);
    this._currentAnim = key;
  }

  /** Scene 에서 매 프레임 호출. hook 객체 전달. */
  update(dtSec, screenWidth, hook, neighbors = null) {
    if (this.dead) return;

    // 사용자 요청: hook 과 상호작용 중인 fish 는 낚시줄(50)/lure(51) 위 레이어로 표시.
    //   ATTRACTED/PECKING/DASHING/HOOKED → 52 (line 위)
    //   그 외 (WANDER/FLEEING) → 정상 swim 깊이 (6 shark / 7 일반)
    if (this.sprite) {
      const above = this.state === FISH_STATE.ATTRACTED
                 || this.state === FISH_STATE.PECKING
                 || this.state === FISH_STATE.DASHING
                 || this.state === FISH_STATE.HOOKED;
      const targetDepth = above ? 52 : (this.def.ignoresHook ? 6 : 7);
      if (this.sprite.depth !== targetDepth) this.sprite.setDepth(targetDepth);
    }

    // ─── 회수/발사 중 입질 해제 (사용자 요청) ───
    //   user2: 미끼가 USER2_STOP(정지) 이 아닌데(=발사/감속/회수/조준 중) fish 가 미끼에
    //   엮여 있으면, 이동하는 미끼를 계속 쫓아 "끌려오는" 현상이 생긴다.
    //   → 회수 시점엔 입질을 멈추고 미끼 반대로 풀어준다(도주). 이미 잡힌 HOOKED 은 제외.
    //   정상 catch(PECKING→press→DASHING)는 hook 이 STOP 을 유지하므로 영향 없음.
    if (hook && hook._mode === 'user2'
        && hook.state !== HOOK_STATE.USER2_STOP
        && hook.state !== HOOK_STATE.HOOKED
        && (this.state === FISH_STATE.ATTRACTED
            || this.state === FISH_STATE.PECKING
            || this.state === FISH_STATE.DASHING)) {
      const tip = hook.getLureTip ? hook.getLureTip() : { x: hook.x, y: hook.y };
      const m = Math.sqrt((tip.x - this.x) ** 2 + (tip.y - this.y) ** 2) || 1;
      this._fleeDirX = (this.x - tip.x) / m;
      this._fleeDirY = (this.y - tip.y) / m;
      this._fleeTimer = 0;
      if (hook.targetedBy === this) hook.targetedBy = null;
      this.state = FISH_STATE.FLEEING;
      this._playAnim(`${this.def.animKey}_fast`);
      return;
    }

    switch (this.state) {
      case FISH_STATE.WANDER:    this._updateWander(dtSec, screenWidth, hook, neighbors);  break;
      case FISH_STATE.ATTRACTED: this._updateAttracted(dtSec, hook);            break;
      case FISH_STATE.PECKING:   this._updatePecking(dtSec, hook);              break;
      case FISH_STATE.DASHING:   this._updateDashing(dtSec, hook);              break;
      case FISH_STATE.FLEEING:   this._updateFleeing(dtSec, screenWidth);       break;
      case FISH_STATE.HOOKED:    /* FishingScene 이 제어 */                     break;
    }

    // ─── 심해 시각 효과 (사용자 요청) ───
    if (this.state === FISH_STATE.WANDER) {
      this._applyDepthVisual();
      this._applyBodyWave(dtSec);
    } else if (this._depthTinted) {
      this.sprite?.clearTint();
      this.sprite?.setAlpha(1.0);
      this._depthTinted = false;
    }
  }

  // 어종별 body wave — sprite scale Y 미세 진동 (호흡 / 꼬리 흔들기 시각).
  //   WANDER 만 적용. HOOKED 의 showcase scale tween 과 충돌 안 함.
  _applyBodyWave(dtSec) {
    if (!this.sprite || !this._bodyWaveAmp || !this._baseSpriteScale) return;
    this._bodyWaveT += dtSec * this._bodyWaveFreq;
    const wave = Math.sin(this._bodyWaveT);
    const sy = this._baseSpriteScale * (1 + wave * this._bodyWaveAmp);
    this.sprite.scaleY = sy;
  }

  // 깊이에 따른 푸른 tint 만 적용 (사용자 요청: 투명도 제거, 색상만 흐리게).
  //   depthRatio   : 0 (수면) ~ 1 (심해)
  //   sizeWeight   : 0 (small ≤ 80) ~ 1 (large ≥ 300)
  //   effectStr    : depthRatio × sizeWeight (둘 다 클 때만 강한 효과)
  //   alpha 는 항상 1.0 유지 — 투명 fade 없이 색상만 어둡고 푸른빛으로 흐려짐.
  _applyDepthVisual() {
    if (!this.sprite) return;
    // 사용자 요청: 어두운 색이라도 흐릿한 느낌 — 물 배경과 블렌딩.
    //   너무 진한 navy 는 밝은 물 배경에서 검은 silhouette 처럼 튐.
    //   medium gray-blue 로 채도 낮추고 명도 중간 → 안개 낀 듯 흐릿.
    if (this.def.ignoresHook) {
      // 사용자 요청: 너무 진한 검은 silhouette 이 되지 않도록 tint 밝기 ↑.
      //   sprite 의 어두운 픽셀이 tint 와 곱해지면 결과가 매우 어두워지므로
      //   tint 자체는 medium-light 톤이어야 sprite 의 명암 재현 + 채도만 낮춤.
      this.sprite.setTint(0xa0b0c0);   // light gray-blue (RGB 160, 176, 192)
      this.sprite.setAlpha(1.0);
      this._depthTinted = true;
      return;
    }
    const PLAY_TOP = 240;
    const PLAY_BOTTOM = 890;
    const depthRatio = Math.max(0, Math.min(1,
      (this.y - PLAY_TOP) / (PLAY_BOTTOM - PLAY_TOP)));
    const sizeWeight = Math.max(0, Math.min(1, (this.def.size - 80) / 220));   // 80→0, 300→1
    const effectStr  = depthRatio * sizeWeight;

    if (effectStr < 0.02) {
      if (this._depthTinted) {
        this.sprite.clearTint();
        this.sprite.setAlpha(1.0);
        this._depthTinted = false;
      }
      return;
    }
    // 색상 tint 만 강화 (alpha 는 그대로) — 투명이 아닌 "어둡고 푸른빛" 으로 흐려짐.
    // depthRatio×sizeWeight=1 일 때 tint 약 (105, 140, 200) — 진한 푸른 hazy.
    const r = Math.round(255 - effectStr * 150);
    const g = Math.round(255 - effectStr * 115);
    const b = Math.round(255 -  effectStr * 55);
    this.sprite.setTint((r << 16) | (g << 8) | b);
    this.sprite.setAlpha(1.0);   // 항상 불투명
    this._depthTinted = true;
  }

  // ─── WANDER: 원형 궤도 + hook 발견 시 ATTRACTED ───
  _updateWander(dtSec, screenWidth, hook, neighbors = null) {
    // hook 에 잡힌 fish 가 요동치는 중이면 주변 fish 회피 (사용자 요청)
    this._applyHookStruggleAvoidance(dtSec, hook);
    // 포식자/대형어종 회피 (사용자 요청: 먹이관계 어종을 주변에서 피함)
    this._applyPredatorAvoidance(dtSec, neighbors);

    // ── 수직 진입 phase (top/bottom 에서 입장 중) ──
    // 목표 depth 에 도달하면 _entryYVel=0 으로 비활성화 → 정상 orbit/heading.
    if (this._entryYVel !== 0) {
      this.y += this._entryYVel * dtSec;
      this._cy = this.y;   // orbit center 동기화 → 진입 후 자연스럽게 전환
      this._cx = this.x;

      // sprite 가 진행방향(아래/위) 으로 회전 (sprite 원본 = 머리 위 기준)
      // heading π/2 = 아래, -π/2 = 위. setRotation = heading + π/2
      const facing = this._entryYVel > 0 ? Math.PI : 0;
      this.sprite.setRotation(facing);
      this.sprite.setPosition(this.x, this.y);

      // 목표 depth 도달 체크
      if ((this._entryYVel > 0 && this.y >= this._entryTargetY) ||
          (this._entryYVel < 0 && this.y <= this._entryTargetY)) {
        this.y = this._entryTargetY;
        this._cy = this.y;
        this._entryYVel = 0;
        // shark heading 초기화 (정상 항해 시작)
        if (this.def.ignoresHook) {
          this._heading = this.dir === 1 ? 0 : Math.PI;
        }
      }
      return;
    }

    // ── 대형 어종(ignoresHook): heading 기반 직진 모델 ──
    // - 항상 _heading 방향으로 전진 → 절대 뒤로 가지 않음.
    // - _headingTurnRate 가 가끔 살짝 바뀌어 점진적 방향전환.
    // - heading 은 초기 방향에서 ±60° 안으로 clamp (뒤집힘 방지).
    if (this.def.ignoresHook) {
      // 회전 속도 갱신 (몇 초마다 새 작은 회전속도)
      this._headingTurnTimer -= dtSec;
      if (this._headingTurnTimer <= 0) {
        this._headingTurnRate = (Math.random() - 0.5) * 0.18;   // ±0.09 rad/sec
        this._headingTurnTimer = 3 + Math.random() * 4;
      }
      // heading 점진 변화
      this._heading += this._headingTurnRate * dtSec;

      // ── yaw clamp — 초기 진행방향 기준 ±60° 안 ──
      const baseHeading = this.dir === 1 ? 0 : Math.PI;
      const MAX_YAW = Math.PI / 3;     // 60°
      let yaw = this._heading - baseHeading;
      // angle 정규화 [-π, π]
      while (yaw >  Math.PI) yaw -= 2 * Math.PI;
      while (yaw < -Math.PI) yaw += 2 * Math.PI;
      if (yaw >  MAX_YAW) { yaw =  MAX_YAW; this._headingTurnRate = -Math.abs(this._headingTurnRate); }
      if (yaw < -MAX_YAW) { yaw = -MAX_YAW; this._headingTurnRate =  Math.abs(this._headingTurnRate); }
      this._heading = baseHeading + yaw;

      // 전진 (heading 방향)
      const effSpeed = this.def.speed * this._speedJitter;
      this.x += effSpeed * Math.cos(this._heading) * dtSec;
      this.y += effSpeed * Math.sin(this._heading) * dtSec;
      this._cx = this.x;
      this._cy = this.y;

      // 수직 clamp — 벽 부딪힘 시 부드러운 반사 (즉시 heading 반전 X)
      //   사용자 요청: 갑작스러운 방향 전환 제거 → 강한 turnRate(5 rad/s) 로 0.3s 동안
      //   heading 을 부드럽게 회전시켜 천장/바닥에서 떨어지게.
      const halfH_ = this.def.size * 0.5;
      const yMin_ = FISH_TOP_LIMIT_LARGE + halfH_ * 0.5;
      const yMax_ = FISH_DECK_TOP - halfH_ * (1 - FISH_PEEK_UNDER_F);
      // bounce timer 카운트 다운 — 종료 시 turnRate 를 정상 드리프트로 복귀
      if (this._bounceTimer > 0) {
        this._bounceTimer -= dtSec;
        if (this._bounceTimer <= 0) {
          this._headingTurnRate = (Math.random() - 0.5) * 0.18;
        }
      }

      if (this.y < yMin_) {
        this.y = yMin_;
        // 위로 향하면서 천장 충돌 — 0.3s 동안 강한 turnRate 로 부드럽게 아래로 회전
        if (Math.sin(this._heading) < 0 && this._bounceTimer <= 0) {
          // cos(heading)>0=오른쪽→turnRate+, <0=왼쪽→turnRate-  (heading 을 아래쪽으로 회전)
          this._headingTurnRate = Math.cos(this._heading) > 0 ? 5.0 : -5.0;
          this._bounceTimer = 0.3;
        }
      }
      if (this.y > yMax_) {
        this.y = yMax_;
        // 아래로 향하면서 바닥 충돌 — heading 을 위쪽으로 회전
        if (Math.sin(this._heading) > 0 && this._bounceTimer <= 0) {
          this._headingTurnRate = Math.cos(this._heading) > 0 ? -5.0 : 5.0;
          this._bounceTimer = 0.3;
        }
      }

      // sprite rotation 부드러운 lerp (즉시 스냅 방지)
      const targetRot = this._heading + Math.PI / 2;
      const curRot = this.sprite.rotation;
      let dRot = targetRot - curRot;
      while (dRot >  Math.PI) dRot -= 2 * Math.PI;
      while (dRot < -Math.PI) dRot += 2 * Math.PI;
      this.sprite.rotation = curRot + dRot * Math.min(1, dtSec * 5);
      this.sprite.setPosition(this.x, this.y);

      // 사용자 요청: huntable 어종 (상어 등) hook 감지 — heading-based 어종도 잡힐 수 있게.
      if (this.def.huntable && this._hookInterest && hook
          && (hook.state === HOOK_STATE.DESCEND
              || hook.state === HOOK_STATE.IDLE
              || hook.state === HOOK_STATE.USER2_STOP)
          && !hook.targetedBy
          && (hook._biteCooldown ?? 0) <= 0
          && hook.canHookFish?.(this) !== false   // BUG-02: rod power 초과 어종은 입질 차단 → 무한 bite→reject 루프 방지
          && !this.dead) {
        const dxh = hook.x - this.x;
        const dyh = hook.y - this.y;
        const distH = Math.sqrt(dxh * dxh + dyh * dyh);
        // 큰 어종은 감지 범위도 넓게 (size × 0.7).
        if (distH < Math.max(160, this.def.size * 0.7)) {
          this.state = FISH_STATE.ATTRACTED;
          hook.targetedBy = this;
          hook._biteCooldown = 3.5;
          this._peckTarget = 3 + Math.floor(Math.random() * 5);
          this._peckCount  = 0;
          this._peckTimer  = 0;
          this._strikeTimeout = this.scene?.profile?.strikeWindowSec ?? 2.5;
          const ang = Math.random() * Math.PI * 2;
          this._peckApproachX = Math.cos(ang);
          this._peckApproachY = Math.sin(ang);
          this._playAnim(`${this.def.animKey}_normal`);
        }
      }

      // 화면 밖 죽음 — fish 크기에 비례한 dead margin.
      const deadMargin_ = Math.max(200, this.def.size * 0.5 + 100);
      if (this.x < -deadMargin_ || this.x > screenWidth + deadMargin_) this.dead = true;
      return;
    }

    // ── 일반 어종: 기존 orbit + drift ──
    this._orbitAngle += this._orbitAngVel * dtSec;

    // ── drift yaw 갱신 — random 각도로 자연스럽게 swim (사용자 요청) ──
    // 매 2~4초마다 새 target yaw (±60°) 를 뽑고, 매 프레임 lerp 로 부드럽게 접근.
    this._driftYawTimer -= dtSec;
    if (this._driftYawTimer <= 0) {
      this._driftYawTarget = (Math.random() - 0.5) * (Math.PI * 2 / 3);   // ±60°
      this._driftYawTimer  = 2 + Math.random() * 2;
    }
    this._driftYaw += (this._driftYawTarget - this._driftYaw) * Math.min(1, dtSec * 0.7);

    // drift = (dir * cos(yaw), sin(yaw)) — 수평 + 수직 성분 모두 random.
    //   dir 부호는 유지 → fish 가 결국 화면 한쪽으로 빠져나감.
    //   yaw 가 ±60° 안이라 cos(yaw) ≥ 0.5 → 수평 성분이 0 이 되진 않음.
    const yawCos = Math.cos(this._driftYaw);
    const yawSin = Math.sin(this._driftYaw);
    this._cx += this._driftSpeed * this.dir * yawCos * dtSec;
    this._cy += this._driftSpeed * yawSin * dtSec;

    // ── _cy 벽 반사 — yaw 가 큰 vertical 일 때 화면 너무 위/아래로 안 나가도록 ──
    const halfH = this.def.size * 0.5;
    const CY_TOP    = FISH_TOP_LIMIT_SMALL + halfH + 10;
    const CY_BOTTOM = FISH_DECK_TOP - halfH * (1 - FISH_PEEK_UNDER_F) - 10;
    if (this._cy < CY_TOP) {
      this._cy = CY_TOP;
      this._driftYaw = Math.abs(this._driftYaw);          // 위쪽 충돌 → 강제 하향
      this._driftYawTarget = this._driftYaw;
    } else if (this._cy > CY_BOTTOM) {
      this._cy = CY_BOTTOM;
      this._driftYaw = -Math.abs(this._driftYaw);         // 아래쪽 충돌 → 강제 상향
      this._driftYawTarget = this._driftYaw;
    }

    // 수직 wave multiplier — 어종별 프로파일 적용 (기본 0.30, 종별 0.09~0.39 범위)
    const vMul = this._vMul ?? 0.30;
    this.x = this._cx + Math.cos(this._orbitAngle) * this._orbitRadius;
    this.y = this._cy + Math.sin(this._orbitAngle) * this._orbitRadius * vMul;

    // 일반 어종 clamp — orbit wobble 까지 포함한 최종 y 가 화면 안에 있도록.
    const yMin = FISH_TOP_LIMIT_SMALL + halfH;
    const yMax = FISH_DECK_TOP - halfH * (1 - FISH_PEEK_UNDER_F);
    this.y = Math.max(yMin, Math.min(yMax, this.y));

    // ─── heading = 실제 속도 벡터 (drift + orbit 미분) ───
    //   이전: orbit tangent 만 사용 → orbit 한 바퀴 마다 뒤로 가는 구간 발생
    //   변경: 실제 fish 가 움직이는 방향 = drift + d(orbit)/dt 로 facing 정확.
    //   drift 가 random yaw 로 진행하므로 yawCos/Sin 을 vx/vy 에 반영.
    const orbitVx = -Math.sin(this._orbitAngle) * this._orbitRadius * this._orbitAngVel;
    const orbitVy =  Math.cos(this._orbitAngle) * this._orbitRadius * vMul * this._orbitAngVel;
    const vx = this._driftSpeed * this.dir * yawCos + orbitVx;
    const vy = this._driftSpeed * yawSin + orbitVy;
    // 속도 너무 작으면 dir 기준으로 고정 (제자리 회전 방지)
    const speedMag = Math.sqrt(vx * vx + vy * vy);
    const targetRot = (speedMag > 1)
      ? Math.atan2(vy, vx) + Math.PI / 2
      : (this.dir === 1 ? Math.PI / 2 : -Math.PI / 2);

    // rotation 부드러운 lerp — 즉시 스냅 방지
    const curRot = this.sprite.rotation;
    let diff = targetRot - curRot;
    while (diff >  Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    this.sprite.rotation = curRot + diff * Math.min(1, dtSec * 6);   // ~0.17s 수렴
    this.sprite.setPosition(this.x, this.y);

    // 사용자 요청: fish 가 갑자기 방향을 바꾸지 않도록 —
    //   - 이전: 4~10초마다 30% 확률로 _orbitAngVel *= -1 (즉시 반전) → 갑자기 방향전환
    //   - 신규: _orbitAngVel 을 천천히 보간해서 점진적으로 새 angVel 로 변화
    //   - 반경 점진 변화도 step 을 작게 + 0.5 sec 동안 lerp 로 부드럽게
    this._mutateTimer -= dtSec;
    if (this._mutateTimer <= 0) {
      const isLarge = this.def.ignoresHook;
      // 다음 mutate 타이밍 (대형은 더 길게)
      this._mutateTimer = (isLarge ? 10 : 6) + Math.random() * 6;

      // 회전속도 target 만 잡고, 매 프레임 lerp 로 부드럽게 접근 → 즉시 반전 없음.
      // angVel 부호는 유지 (절대값만 살짝 변동) — 방향 전환 없음.
      const curMag = Math.abs(this._orbitAngVel);
      const sign   = Math.sign(this._orbitAngVel) || 1;
      const newMag = Math.max(0.15, curMag + (Math.random() - 0.5) * 0.25);
      this._targetOrbitAngVel = sign * Math.min(newMag, 1.2);

      // 반경 target — 큰 변화 없음
      if (Math.random() < 0.4) {
        const lo = isLarge ? 180 : 30;
        const hi = isLarge ? 320 : 180;
        const step = 20;     // 50 → 20 으로 감소
        this._targetOrbitRadius = Math.max(lo, Math.min(hi,
          this._orbitRadius + (Math.random() - 0.5) * step));
      }
    }
    // angVel / radius 를 target 으로 lerp (매 프레임 부드럽게 접근)
    if (this._targetOrbitAngVel !== undefined) {
      const lerp = Math.min(1, dtSec * 0.8);   // ~1.25초에 대부분 도달
      this._orbitAngVel += (this._targetOrbitAngVel - this._orbitAngVel) * lerp;
    }
    if (this._targetOrbitRadius !== undefined) {
      const lerp = Math.min(1, dtSec * 0.5);
      this._orbitRadius += (this._targetOrbitRadius - this._orbitRadius) * lerp;
    }

    // ─── hook 발견 체크 ───
    // 1) ignoresHook 어종(대형 — 상어/참치)은 절대 입질하지 않음 (감상용)
    // 2) 이 fish 가 관심(_hookInterest)이 있는 경우만 시도
    // 3) 발견 거리 115px (이전 90 → 입질 빈도 상향)
    // 4) 입질 시도 인터벌 — 모든 fish 통틀어 최소 4.5초 (이전 7s → 입질 빈도 상향)
    if (!this.def.ignoresHook
        && this._hookInterest && hook
        && (hook.state === HOOK_STATE.DESCEND
            || hook.state === HOOK_STATE.IDLE
            || hook.state === HOOK_STATE.USER2_STOP)
        && !hook.targetedBy
        && (hook._biteCooldown ?? 0) <= 0
        && hook.canHookFish?.(this) !== false   // BUG-02: rod power 초과 어종은 입질 차단 → 무한 bite→reject 루프 방지
        && !this.dead) {
      const dx = hook.x - this.x;
      const dy = hook.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // 사용자 요청: 입질 빈도 ↑ — 감지 범위 115 → 160, cooldown 4.5 → 2.0s
      if (dist < 160) {
        this.state = FISH_STATE.ATTRACTED;
        hook.targetedBy = this;
        hook._biteCooldown = 2.0;
        this._peckTarget = 3 + Math.floor(Math.random() * 5);
        this._peckCount  = 0;
        this._peckTimer  = 0;
        // 사용자 요청: PECKING 진입 후 2.5s 안에 챔질 없으면 미끼 먹고 도주.
        //   향후 레벨 ↑ 시 점진적으로 짧아질 예정 (난이도 ↑).
        //   profile.strikeWindowSec 이 있으면 사용, 없으면 default 2.5.
        const profile = this.scene?.profile;
        this._strikeTimeout = profile?.strikeWindowSec ?? 2.5;
        // 사용자 요청: fish 가 lure 를 무는 방향 랜덤 — outward 기준 ±π (전방위).
        const ang = Math.random() * Math.PI * 2;
        this._peckApproachX = Math.cos(ang);
        this._peckApproachY = Math.sin(ang);
        this._playAnim(`${this.def.animKey}_normal`);
      }
    }

    // 화면 밖
    const margin = 180;
    if (this._cx < -margin || this._cx > screenWidth + margin) {
      this.dead = true;
    }
  }

  // ─── hook 에 잡혀 요동치는 fish 주변 회피 (사용자 요청) ───
  //   조건: hook.state === HOOKED 인 동안 항상 (phase 무관 — DASHING/panic 도 포함).
  //   반경 300px 안의 fish 가 hook 위치 반대 방향으로 점진 push.
  //   가까울수록 강하게 + 가까운 fish 는 _fast anim 으로 전환 (눈에 띄는 reaction).
  _applyHookStruggleAvoidance(dtSec, hook) {
    if (!hook || hook.state !== HOOK_STATE.HOOKED) return;

    const AVOID_RADIUS = 300;
    const dx = this.x - hook.x;
    const dy = this.y - hook.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < AVOID_RADIUS && dist > 0.1) {
      const force = (AVOID_RADIUS - dist) / AVOID_RADIUS;   // 0~1
      const speed = 230 * force;                            // 이전 140 → 230 (강화)
      const ox = (dx / dist) * speed * dtSec;
      const oy = (dy / dist) * speed * dtSec;
      this.x += ox;
      this.y += oy;
      // orbit center 도 같이 이동 → 회피 후 자연스럽게 새 궤도 유지
      this._cx += ox;
      this._cy += oy;

      // 강한 회피 (force > 0.35) → _fast anim 으로 전환 → 놀란 듯 빠르게 헤엄
      if (force > 0.35 && !this.def.ignoresHook) {
        const fastKey = `${this.def.animKey}_fast`;
        if (this._currentAnim !== fastKey && this.scene.anims.exists(fastKey)) {
          this.sprite?.play(fastKey);
          this._currentAnim = fastKey;
        }
      }
    }
  }

  // ─── 포식자 회피 (사용자 요청) ───
  //   neighbors 중 "위협"(크기 ×PREDATOR_SIZE_RATIO↑, 또는 def.fearsIds 명시)에서 멀어지는
  //   steering. 궤도중심(_cx,_cy)을 밀어 자연스러운 회피 궤도로 전환. 대형 apex(상어,
  //   ignoresHook)는 스스로 피하지 않음(먹이사슬 최상위). O(N²), N≤15 이라 부담 없음.
  _applyPredatorAvoidance(dtSec, neighbors) {
    if (!neighbors || this.def.ignoresHook) return;
    const mySize = this.def.size ?? 80;
    let pushX = 0, pushY = 0, nearest = Infinity;
    for (const other of neighbors) {
      if (other === this || other.dead || !other.sprite) continue;
      const otherSize = other.def.size ?? 80;
      const isThreat = otherSize >= mySize * PREDATOR_SIZE_RATIO
        || (Array.isArray(this.def.fearsIds) && this.def.fearsIds.includes(other.def.id));
      if (!isThreat) continue;
      const dx = this.x - other.x;
      const dy = this.y - other.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const radius = Math.max(PREDATOR_AVOID_MIN_R, otherSize * PREDATOR_AVOID_R_FACT);
      if (dist >= radius || dist < 0.1) continue;
      const force = (radius - dist) / radius;   // 0~1 (가까울수록 ↑)
      const w = force * force;                    // 가까울수록 급격히 강하게
      pushX += (dx / dist) * w;
      pushY += (dy / dist) * w;
      if (dist < nearest) nearest = dist;
    }
    if (pushX === 0 && pushY === 0) return;
    const mag = Math.sqrt(pushX * pushX + pushY * pushY) || 1;
    const mv = PREDATOR_FLEE_SPEED * dtSec;
    // 궤도중심 이동 → 다음 orbit 계산이 회피 위치를 반영 (자연스러운 전환).
    this._cx += (pushX / mag) * mv;
    this._cy += (pushY / mag) * mv;
    // 가까우면 놀란 듯 빠른 헤엄.
    if (nearest < PREDATOR_PANIC_DIST) {
      const fastKey = `${this.def.animKey}_fast`;
      if (this._currentAnim !== fastKey && this.scene?.anims?.exists(fastKey)) {
        this.sprite?.play(fastKey);
        this._currentAnim = fastKey;
      }
    }
  }

  // ─── ATTRACTED: lure tip 으로 천천히 접근 ───
  //   사용자 요청: 미끼 tip (fish 가 실제로 무는 지점) 으로 접근 → 입과 미끼가 정확히 맞도록.
  _updateAttracted(dtSec, hook) {
    if (!hook) { this._releaseHook(hook); return; }

    const tip = hook.getLureTip ? hook.getLureTip() : { x: hook.x, y: hook.y };
    const dx = tip.x - this.x;
    const dy = tip.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 32) {
      this.state = FISH_STATE.PECKING;
      this._peckTimer = 0;
      this._playAnim(`${this.def.animKey}_normal`);
      return;
    }

    const approachSpeed = 70;
    this.x += (dx / dist) * approachSpeed * dtSec;
    this.y += (dy / dist) * approachSpeed * dtSec;

    const heading = Math.atan2(dy, dx);
    this.sprite.setRotation(heading + Math.PI / 2);
    this.sprite.setPosition(this.x, this.y);
  }

  // ─── PECKING: 입만 톡톡 닿았다 떼었다 (게이지 중심 통과에 동기화) ───
  // 사용자 요청:
  //  - 게이지가 중간을 지날 때 fish 가 hook 을 터치 (zero-crossing 시점)
  //  - |needle| 이 클수록 fish 가 hook 에서 멀어짐 (가시적 oscillation)
  //  - 2~5회 터치 후 마지막 터치 시점의 |needle| 로 catch/flee 판정
  //  - needle 속도 자체가 3 rad/s 로 감속됨 → 터치 간격 ~1.05s
  _updatePecking(dtSec, hook) {
    if (!hook) { this._releaseHook(hook); return; }
    this._peckTimer += dtSec;

    // 사용자 요청: 2.5초 안에 챔질 (CAST press) 없으면 미끼 먹고 도주.
    //   user2 mode 만 적용 (auto 모드는 needle 자동 판정).
    if (hook._mode === 'user2') {
      this._strikeTimeout = (this._strikeTimeout ?? 2.5) - dtSec;
      if (this._strikeTimeout <= 0) {
        // 도주 — fish 가 lure 방향에서 멀어짐
        const tipEsc = hook.getLureTip ? hook.getLureTip() : { x: hook.x, y: hook.y };
        const dxe = tipEsc.x - this.x;
        const dye = tipEsc.y - this.y;
        const m = Math.sqrt(dxe * dxe + dye * dye) || 1;
        this._fleeDirX = -dxe / m;
        this._fleeDirY = -dye / m;
        this._fleeTimer = 0;
        if (hook.targetedBy === this) hook.targetedBy = null;
        this.state = FISH_STATE.FLEEING;
        this._playAnim(`${this.def.animKey}_fast`);
        // FishingScene 알림 — "FISH STOLE BAIT!" 메시지 등
        this.scene?.events?.emit('fish_strike_timeout', this);
        return;
      }
    }

    // 미끼 tip + outward 방향 (anchor → tip) — fish 위치 계산용
    const tip = hook.getLureTip ? hook.getLureTip() : { x: hook.x, y: hook.y };
    const lureLen = hook._lureHeight || 30;
    const oxRaw = tip.x - hook.x;
    const oyRaw = tip.y - hook.y;
    const oMag = Math.sqrt(oxRaw * oxRaw + oyRaw * oyRaw) || 1;
    const outX = oxRaw / oMag;
    const outY = oyRaw / oMag;

    // 게이지 중심 통과 감지 — needle 부호 변경 = 터치 모멘트
    const curNeedle  = hook._needleValue ?? 0;
    const prevNeedle = (this._prevNeedleVal === undefined) ? curNeedle : this._prevNeedleVal;
    this._prevNeedleVal = curNeedle;
    const crossedZero =
      (prevNeedle > 0 && curNeedle <= 0) ||
      (prevNeedle < 0 && curNeedle >= 0);

    // ─── safety timeout (코드 리뷰 9-4: 프레임레이트 의존성 해결) ───
    //   needle 속도 3 rad/s, 정상 zero-cross 간격 ≈ 1.05s.
    //   저프레임/스파이크로 한 사이클(2.1s) 동안 zero-cross 가 한 번도 안 잡히면
    //   강제로 peck count 증가. 정상 동작에서는 절대 trigger 안 됨 (1.05s 마다 정상 cross).
    const FORCE_PECK_TIMEOUT = 2.4;
    const forcePeck = this._peckTimer > FORCE_PECK_TIMEOUT && !crossedZero;

    if (crossedZero || forcePeck) {
      this._peckTimer = 0;
      this._peckCount += 1;

      // 미끼 bump — fish 가 lure 를 톡 친 느낌으로 lure 가 강하게 튕김
      //   방향: fish → tip 단위벡터 (lure 가 fish 의 반대로 밀려남)
      if (crossedZero && hook.applyBump) {
        const dxh = tip.x - this.x;
        const dyh = tip.y - this.y;
        const m = Math.sqrt(dxh * dxh + dyh * dyh) || 1;
        const impulse = 110;
        const jitter = (Math.random() - 0.5) * 60;
        hook.applyBump((dxh / m) * impulse + jitter, (dyh / m) * impulse);
      }

      // 마지막 터치에서 판정 — 게이지 중심 통과 순간이라 |needle| ≈ 0 → catch 확률 매우 높음
      if (this._peckCount >= this._peckTarget) {
        if (hook._mode === 'user2') {
          // user2 모드: 사용자가 CAST 버튼을 눌러야 catch 시도.
          //   peck count 를 초기화해 fish 가 무한히 톡톡 — 사용자 액션 대기.
          this._peckCount = 0;
        } else {
          const needleVal = Math.abs(curNeedle);
          if (needleVal < 0.485) {
            this.state = FISH_STATE.DASHING;
            this._dashTimer = 0;
            this._playAnim(`${this.def.animKey}_fast`);
            return;
          }
          // 외곽 → FLEEING
          const dxh = tip.x - this.x;
          const dyh = tip.y - this.y;
          const m = Math.sqrt(dxh * dxh + dyh * dyh) || 1;
          this._fleeDirX = -dxh / m;
          this._fleeDirY = -dyh / m;
          this._fleeTimer = 0;
          if (hook.targetedBy === this) hook.targetedBy = null;
          hook.forceReel?.();
          this.state = FISH_STATE.FLEEING;
          this._playAnim(`${this.def.animKey}_fast`);
          return;
        }
      }
    }

    // 사용자 요청: 무는 방향이 랜덤. _peckApproachX/Y 가 WANDER→ATTRACTED 진입 시 캡처됨.
    //   center = tip + approach_dir * (size×0.35 + releaseGap)
    //   사용자 요청: mouth point 는 image 끝(0.40)보다 살짝 안쪽(0.35) → lure 가 입 살짝 들어간 모습.
    const FISH_MOUTH_FRAC = 0.35;
    const mouthOffset = this.def.size * FISH_MOUTH_FRAC;
    const releaseGap = Math.abs(curNeedle) * 10;
    const totalOffset = mouthOffset + releaseGap;
    // approach direction (fallback: outward)
    const apX = this._peckApproachX ?? outX;
    const apY = this._peckApproachY ?? outY;
    const targetX = tip.x + apX * totalOffset;
    const targetY = tip.y + apY * totalOffset;

    this.x += (targetX - this.x) * 0.30;
    this.y += (targetY - this.y) * 0.30;

    // heading = -approach (head 가 tip 향함, body 는 approach 쪽으로 뻗음)
    const heading = Math.atan2(-apY, -apX);
    this.sprite.setRotation(heading + Math.PI / 2);
    this.sprite.setPosition(this.x, this.y);
  }

  // ─── DASHING: lure tip 으로 빠른 dash → 닿으면 HOOKED ───
  _updateDashing(dtSec, hook) {
    if (!hook) { this._releaseHook(hook); return; }
    this._dashTimer += dtSec;

    const tip = hook.getLureTip ? hook.getLureTip() : { x: hook.x, y: hook.y };
    const dx = tip.x - this.x;
    const dy = tip.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // 입 (image 끝 살짝 안쪽 = size × 0.35) 이 tip 에 닿는 순간 HOOKED
    const headHitDist = this.def.size * 0.35;
    if (dist < headHitDist || this._dashTimer > 0.7) {
      this.state = FISH_STATE.HOOKED;
      this.isHooked = true;
      return;
    }

    const dashSpeed = 320;
    this.x += (dx / dist) * dashSpeed * dtSec;
    this.y += (dy / dist) * dashSpeed * dtSec;

    const heading = Math.atan2(dy, dx);
    this.sprite.setRotation(heading + Math.PI / 2);
    this.sprite.setPosition(this.x, this.y);
  }

  // ─── FLEEING: hook 반대 방향으로 도망 ───
  _updateFleeing(dtSec, screenWidth) {
    this._fleeTimer += dtSec;

    // 사용자 요청: 실패 직후 fish 가 갑자기 쭉 끌려가는 듯한 느낌 제거.
    //   첫 0.6s 동안 속도 0 → 360 ramp-up (점진적으로 가속).
    const RAMP_DUR = 0.6;
    const speedScale = Math.min(1.0, this._fleeTimer / RAMP_DUR);
    const fleeSpeed = 360 * speedScale;
    this.x += this._fleeDirX * fleeSpeed * dtSec;
    this.y += this._fleeDirY * fleeSpeed * dtSec;

    // sprite 의 머리가 도망 방향으로
    const heading = Math.atan2(this._fleeDirY, this._fleeDirX);
    this.sprite.setRotation(heading + Math.PI / 2);
    this.sprite.setPosition(this.x, this.y);

    // 1.5초 도망 후 또는 화면 밖 → 사라짐 (반응형: 실제 화면 높이, 코드 리뷰 3-2)
    const margin = 100;
    const sceneH = this.scene.scale?.height ?? 1280;
    if (this._fleeTimer > 1.5
        || this.x < -margin || this.x > screenWidth + margin
        || this.y < -margin || this.y > sceneH + margin) {
      this.dead = true;
    }
  }

  // hook 점유 해제 (fish 가 일찍 사라질 때)
  _releaseHook(hook) {
    if (hook && hook.targetedBy === this) hook.targetedBy = null;
    this.state = FISH_STATE.WANDER;
  }

  destroy() {
    this.dead = true;
    this.sprite?.destroy();
  }
}
