/**
 * FishingTutorial — 첫 플레이 인터랙티브 튜토리얼 (user2 모드 전용).
 *
 * 흐름 (단계 머신, scene.update 에서 매 프레임 구동):
 *   INTRO       환영 + 안내
 *   CASTING     CAST 버튼을 자동으로 눌러 캐스팅 시연 (사용자 요청)
 *   AWAIT_BITE  친근한 물고기를 미끼 근처에 스폰 → 입질(PECKING) 대기
 *   STRIKE      "바늘이 가운데일 때 CAST!" — 챔질 안내 (입질 타임아웃 완화)
 *   FIGHT       "CAST 꾹 눌러 끌어올리기" — 파이팅 안내 (줄 끊김 방지)
 *   DONE        완료 → 영구 저장
 *
 * 시각: 화면을 전체 가리지 않고(요청), 상단 배너 + 대상을 가리키는 화살표 + 펄스 링만 사용.
 *       건너뛰기 버튼으로 언제든 종료 가능.
 *
 * 결합: FishingScene 의 castBtn / hook / spawner / meter / catches 를 직접 참조한다.
 *       파이팅 무실패는 hook._tutorialNoFail 플래그로 Hook 이 처리.
 */

import { strokeText, centerInBox } from '../ui/components.js';
import { HOOK_STATE } from '../entities/Hook.js';
import { FISH_STATE } from '../entities/Fish.js';
import { markTutorialDone } from './UserProfile.js';

const STEP = {
  INTRO:      'INTRO',
  CASTING:    'CASTING',
  AWAIT_BITE: 'AWAIT_BITE',
  STRIKE:     'STRIKE',
  FIGHT:      'FIGHT',
  DONE:       'DONE',
  FINISHED:   'FINISHED',
};

const DEPTH = {
  arrow:  1500,
  banner: 1501,
  text:   1502,
  skip:   1510,
};

const ACCENT = '#ffe040';      // 화살표/링 강조색
const STROKE = '#0a2540';      // 어두운 외곽선

export class FishingTutorial {
  constructor(scene) {
    this.scene = scene;
    this._step = null;
    this._t = 0;                 // 현재 단계 누적 시간(초)
    this._castTriggered = false;
    this._friendlySpawned = false;
    this._baseCatches = scene.catches ?? 0;
    this._objs = [];             // 정리 대상 게임오브젝트
    this._tweens = [];           // 정리 대상 트윈
  }

  // ─── 시작 ───
  start() {
    this._buildOverlay();
    this._setStep(STEP.INTRO);
  }

  // ─── 오버레이 구성 (배너 / 화살표 / 링 / 건너뛰기) ───
  _buildOverlay() {
    const W = this.scene.scale.width;

    // 상단 배너 배경 + 텍스트 (플레이 영역 상단, CAST/게이지 가리지 않음)
    this._bannerCx = W / 2;
    this._bannerCy = 300;
    this.bannerBg = this.scene.add.graphics().setDepth(DEPTH.banner);
    this._track(this.bannerBg);
    this.bannerText = strokeText(this.scene, this._bannerCx, this._bannerCy, '', 22, {
      color: '#ffffff', strokeColor: STROKE, strokeWidth: 4,
    });
    this.bannerText.setOrigin(0.5, 0.5).setAlign('center').setDepth(DEPTH.text);
    this._track(this.bannerText);

    // 가리키는 화살표 (▼ 텍스트) — 대상 위에서 까딱이며 가리킴
    this.arrow = strokeText(this.scene, 0, 0, '▼', 60, {
      color: ACCENT, strokeColor: STROKE, strokeWidth: 6,
    });
    this.arrow.setOrigin(0.5, 0.5).setDepth(DEPTH.arrow).setVisible(false);
    this._track(this.arrow);

    // 게이지 타깃 존 하이라이트 — 바늘이 머물러야 할 구간(④⑤)을 게이지 위에 직접 표시.
    //   depth 85.5: 게이지 이미지(85) 위 + 바늘(86) 아래 → 바늘이 하이라이트 위로 읽힘.
    this.zoneHi = this.scene.add.graphics().setDepth(85.5).setVisible(false);
    this._track(this.zoneHi);

    // 게이지 구간 라벨 (④⑤⑥) — 타깃 존 중앙에 표시
    this.zoneLabel = strokeText(this.scene, 0, 0, '④⑤⑥', 26, {
      color: '#bfffce', strokeColor: STROKE, strokeWidth: 4,
    });
    this.zoneLabel.setOrigin(0.5, 0.5).setDepth(DEPTH.arrow).setVisible(false);
    this._track(this.zoneLabel);

    this._buildSkip(W);
  }

  _buildSkip(W) {
    // 상단 중앙 — 좌측 퀘스트 보드 / 우측 RANK·MENU 버튼과 겹치지 않는 빈 영역.
    const cx = W / 2;
    const cy = 212;
    const w = 132, h = 46;
    const bg = this.scene.add.graphics().setDepth(DEPTH.skip);
    bg.fillStyle(0x0a2540, 0.78);
    bg.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 14);
    bg.lineStyle(2, 0xffffff, 0.6);
    bg.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 14);
    this._track(bg);

    const label = strokeText(this.scene, cx, cy, '건너뛰기 ✕', 18, {
      color: '#ffffff', strokeColor: STROKE, strokeWidth: 3,
    });
    centerInBox(label, 0.5);
    label.setDepth(DEPTH.skip + 1);
    this._track(label);

    const hit = this.scene.add.rectangle(cx, cy, w, h, 0x000000, 0)
      .setDepth(DEPTH.skip + 2)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => this._finish(true));
    this._track(hit);
  }

  // ─── 단계 전환 ───
  _setStep(step) {
    this._step = step;
    this._t = 0;

    switch (step) {
      case STEP.INTRO:
        this._setBanner('🎣 낚시에 오신 걸 환영해요!\nCAST 버튼으로 미끼를 던져 물고기를 낚아봐요.');
        this._pointArrowAtCast();
        this._hideZone();
        break;

      case STEP.CASTING:
        this._setBanner('잘 보세요 — CAST 버튼을 눌러 미끼를 멀리 던집니다!');
        this._pointArrowAtCast();
        this._hideZone();
        this._castTriggered = false;
        break;

      case STEP.AWAIT_BITE:
        this._setBanner('미끼를 던졌어요. 물고기가 미끼를 물 때까지 기다려요…');
        this._pointArrowAtHook();
        this._hideZone();
        this._friendlySpawned = false;
        break;

      case STEP.STRIKE:
        // 챔질: 바늘이 게이지 ⟨가운데(초록)⟩ 올 때 CAST. 강조는 게이지 위 초록 존.
        this._setBanner('입질이다! 게이지 바늘이 ⟨가운데 초록 구간⟩에\n올 때 CAST 버튼을 눌러 챔질하세요!');
        this._showZone(-0.485, 0.485, false, '');   // 중앙 catch 존
        this._pointArrowAtZone(-0.485, 0.485);
        if (this.scene.hook) this.scene.hook._tutorialNoFail = true;
        break;

      case STEP.FIGHT:
        // 파이팅: 핵심 — 바늘을 게이지 ④⑤⑥ 구간(초록)에 "위치"시켜 유지. (CAST 위 깜박임 X)
        this._setBanner('파이팅! 게이지 바늘을 ④⑤⑥ 구간(초록)에 유지하세요.\nCAST를 누르면 올라가고 놓으면 내려가요. 맨 끝(빨강)은 줄이 끊겨요!');
        this._showZone(0, 0.95, true, '④⑤⑥');       // ④⑤⑥ 타깃(초록) + 맨 끝 snap(빨강)
        this._pointArrowAtZone(0, 0.95);             // 화살표를 게이지 ④⑤⑥ 존에 (CAST 위 아님)
        if (this.scene.hook) this.scene.hook._tutorialNoFail = true;
        break;

      case STEP.DONE:
        this._setBanner('🎉 잡았다! 첫 물고기를 낚았어요.\n이제 자유롭게 즐겨보세요!');
        this._setArrowVisible(false);
        this._hideZone();
        markTutorialDone(this.scene.profile);
        if (this.scene.hook) this.scene.hook._tutorialNoFail = false;
        break;

      default:
        break;
    }
  }

  // ─── 매 프레임 업데이트 (FishingScene.update 에서 호출) ───
  update(dt) {
    if (this._step == null || this._step === STEP.FINISHED) return;
    this._t += dt;

    const hook = this.scene.hook;

    switch (this._step) {
      case STEP.INTRO:
        if (this._t >= 2.6) this._setStep(STEP.CASTING);
        break;

      case STEP.CASTING:
        // CAST 버튼 자동 클릭 (1회) — 미끼가 곧장 위로 발사되도록 needle 중앙 고정.
        if (!this._castTriggered && hook?.state === HOOK_STATE.USER2_AIM) {
          this._castTriggered = true;
          this._autoCast();
        }
        // 발사가 멈춰 미끼가 자리잡으면(STOP) 입질 대기로. (안전 타임아웃 8s)
        if (this._castTriggered &&
            (hook?.state === HOOK_STATE.USER2_STOP || this._t >= 8)) {
          this._setStep(STEP.AWAIT_BITE);
        }
        break;

      case STEP.AWAIT_BITE:
        // 화살표가 미끼를 따라가도록 갱신
        this._pointArrowAtHook();
        // 잠깐 기다려도 입질이 없으면 친근한 물고기를 미끼 근처에 스폰.
        if (!this._friendlySpawned && !hook?.targetedBy && this._t >= 0.8) {
          this._spawnFriendlyFish();
          this._friendlySpawned = true;
        }
        // 입질(PECKING) 시작 → 챔질 단계
        if (this._isFishPecking()) this._setStep(STEP.STRIKE);
        break;

      case STEP.STRIKE: {
        // 입질 타임아웃 완화 — 사용자가 안내를 읽고 누를 시간 확보.
        const peck = hook?.targetedBy;
        if (peck && peck.state === FISH_STATE.PECKING) peck._strikeTimeout = 99;
        // 챔질 성공 → 파이팅
        if (hook?.state === HOOK_STATE.HOOKED) { this._setStep(STEP.FIGHT); break; }
        // 챔질 실패(놓침) → 다시 입질 대기
        if (!this._isFishPecking() && !this._isFishApproaching()
            && hook?.state !== HOOK_STATE.HOOKED) {
          this._setBanner('아깝게 놓쳤어요! 다시 입질을 기다려요…');
          this._setStep(STEP.AWAIT_BITE);
        }
        break;
      }

      case STEP.FIGHT:
        // 잡으면(catches 증가) 완료.
        if ((this.scene.catches ?? 0) > this._baseCatches) this._setStep(STEP.DONE);
        // 만일 물고기를 놓쳤다면(HOOKED 해제) 다시 입질 대기로 복귀.
        else if (hook?.state !== HOOK_STATE.HOOKED && this._t > 0.5
                 && !this.scene._showcaseActive) {
          this._setStep(STEP.AWAIT_BITE);
        }
        break;

      case STEP.DONE:
        if (this._t >= 3.2) this._finish(false);
        break;

      default:
        break;
    }
  }

  // ─── CAST 버튼 자동 클릭 (캐스팅 시연) ───
  _autoCast() {
    const scene = this.scene;
    const cast = scene.castBtn;
    if (!cast) return;
    scene._needleValue = 0;          // 곧장 위로 발사 (각도 = -π/2)
    cast.emit('pointerdown');        // FishingScene 의 pointerdown 핸들러 → user2Shoot
    // 0.45s 후 버튼 떼기 → DECEL → STOP (적당한 비거리).
    scene.time.delayedCall(450, () => {
      if (this._step === STEP.FINISHED) return;
      cast.emit('pointerup');
    });
  }

  // ─── 친근한 물고기 스폰 (미끼 근처, 소형 = 빠른 catch) ───
  _spawnFriendlyFish() {
    const hook = this.scene.hook;
    const spawner = this.scene.spawner;
    if (!hook || !spawner) return;
    const W = this.scene.scale.width;
    const side = hook.x < W / 2 ? 1 : -1;          // 미끼 안쪽에서 접근
    const atX = Math.max(60, Math.min(W - 60, hook.x + side * 110));
    spawner._spawnOne(hook.y, {
      speciesId: 'clownfish',
      atX,
      depth: hook.y,
      dir: -side,                                  // 미끼 쪽으로 향함
    });
    const fish = spawner.fishes[spawner.fishes.length - 1];
    if (fish) fish._hookInterest = true;           // 확실히 입질하도록
  }

  _isFishPecking() {
    const t = this.scene.hook?.targetedBy;
    return !!(t && t.state === FISH_STATE.PECKING);
  }

  // 챔질 직후 DASHING / 막 HOOKED 진입 등 "진행 중" 상태 감지 (놓침 오판 방지).
  _isFishApproaching() {
    const fishes = this.scene.spawner?.getFishes?.() ?? [];
    return fishes.some((f) => !f.dead &&
      (f.state === FISH_STATE.DASHING ||
       f.state === FISH_STATE.HOOKED ||
       f.state === FISH_STATE.ATTRACTED ||
       f.state === FISH_STATE.PECKING));
  }

  // ─── 배너 텍스트 + 배경 갱신 ───
  _setBanner(msg) {
    const W = this.scene.scale.width;
    this.bannerText.setWordWrapWidth(W - 120, true);
    this.bannerText.setText(msg);
    this.bannerText.setPosition(this._bannerCx, this._bannerCy);

    const pad = 18;
    const w = this.bannerText.width + pad * 2;
    const h = this.bannerText.height + pad * 2;
    const x = this._bannerCx - w / 2;
    const y = this._bannerCy - h / 2;
    this.bannerBg.clear();
    this.bannerBg.fillStyle(0x062a55, 0.82);
    this.bannerBg.fillRoundedRect(x, y, w, h, 16);
    this.bannerBg.lineStyle(3, 0xffe040, 0.9);
    this.bannerBg.strokeRoundedRect(x, y, w, h, 16);
  }

  // ─── 화살표 ───
  _pointArrowAtCast() {
    const cast = this.scene.castBtn;
    if (!cast) { this._setArrowVisible(false); return; }
    const topY = cast.y - cast.displayHeight / 2;
    this._placeArrow(cast.x, topY - 24);
  }

  _pointArrowAtHook() {
    const hook = this.scene.hook;
    if (!hook) { this._setArrowVisible(false); return; }
    this._placeArrow(hook.x, hook.y - 54);
  }

  _placeArrow(x, y) {
    this.arrow.setVisible(true);
    this.arrow.setPosition(x, y);
    this._restartBob(y);
  }

  _setArrowVisible(v) {
    this.arrow.setVisible(v);
    if (!v && this._bobTween) { this._bobTween.remove(); this._bobTween = null; }
  }

  _restartBob(baseY) {
    if (this._bobTween) { this._bobTween.remove(); this._bobTween = null; }
    this.arrow.y = baseY;
    this._bobTween = this.scene.tweens.add({
      targets: this.arrow,
      y: baseY + 16,
      duration: 480,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
  }

  // ─── 게이지 타깃 존 하이라이트 ───
  //   텐션 게이지(meter)의 바늘 호(arc) 위에 "유지해야 할 구간"을 초록 띠로 직접 그림.
  //   tension [tLo,tHi] → 바늘 회전각 → 호 위 각도 구간. 사용자 요청: ④⑤ 위치 강조.
  _gaugeArc() {
    const meter = this.scene.meter;
    if (!meter) return null;
    const dH = meter.displayHeight;
    // _buildActionLayer 의 needle 기하와 동일: pivot = meter.y + dH×0.635, arm = dH×0.92.
    return {
      px: meter.x,
      py: meter.y + dH * 0.635,
      midR: dH * 0.73,
      thick: dH * 0.40,
    };
  }

  // tension t → 호 위 화면각 (바늘 방향 = (sin(tA), -cos(tA)), A=π/3).
  _zoneAngle(t) {
    const A = Math.PI / 3;
    return Math.atan2(-Math.cos(t * A), Math.sin(t * A));
  }

  _strokeBand(g, px, py, r, thick, tLo, tHi, color, alpha) {
    const a0 = this._zoneAngle(tLo), a1 = this._zoneAngle(tHi);
    g.lineStyle(thick, color, alpha);
    g.beginPath();
    g.arc(px, py, r, Math.min(a0, a1), Math.max(a0, a1), false);
    g.strokePath();
  }

  /** 게이지에 타깃 존을 표시. withDanger=true 면 ⑥(빨강) 위험 구간도 함께. */
  _showZone(tLo, tHi, withDanger, labelText) {
    const arc = this._gaugeArc();
    if (!arc) { this._hideZone(); return; }
    const { px, py, midR, thick } = arc;
    this.zoneHi.clear();
    // 타깃 존(초록) — ④⑤⑥ 전체 양수 구간 유지.
    this._strokeBand(this.zoneHi, px, py, midR, thick, tLo, tHi, 0x46e060, 0.46);
    // snap 경고(빨강) — 타깃 너머 맨 끝(줄 끊김). 초록 위에 덧그려 "끝은 위험" 표시.
    if (withDanger) {
      this._strokeBand(this.zoneHi, px, py, midR, thick, 0.92, 1.0, 0xff2020, 0.72);
    }
    this.zoneHi.setVisible(true);

    // 구간 라벨 (④⑤) — 타깃 존 중앙
    if (labelText) {
      const tMid = (tLo + tHi) / 2;
      const ang = this._zoneAngle(tMid);
      this.zoneLabel.setText(labelText);
      this.zoneLabel.setPosition(px + Math.cos(ang) * midR, py + Math.sin(ang) * midR);
      this.zoneLabel.setVisible(true);
    } else {
      this.zoneLabel.setVisible(false);
    }
    this._restartZonePulse();
  }

  _hideZone() {
    this.zoneHi.setVisible(false);
    this.zoneLabel.setVisible(false);
    if (this._zoneTween) { this._zoneTween.remove(); this._zoneTween = null; }
  }

  _restartZonePulse() {
    if (this._zoneTween) { this._zoneTween.remove(); this._zoneTween = null; }
    this.zoneHi.setAlpha(1);
    this._zoneTween = this.scene.tweens.add({
      targets: this.zoneHi,
      alpha: 0.5,
      duration: 600, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    });
  }

  /** 화살표를 게이지 타깃 존 중앙(바늘이 와야 할 위치)에 배치 — CAST 위가 아님. */
  _pointArrowAtZone(tLo, tHi) {
    const arc = this._gaugeArc();
    if (!arc) { this._setArrowVisible(false); return; }
    const { px, py, midR } = arc;
    const ang = this._zoneAngle((tLo + tHi) / 2);
    const zx = px + Math.cos(ang) * midR;
    const zy = py + Math.sin(ang) * midR;
    this._placeArrow(zx, zy - 48);
  }

  // ─── 종료 ───
  _finish(skipped) {
    if (this._step === STEP.FINISHED) return;
    this._step = STEP.FINISHED;
    if (this.scene.hook) this.scene.hook._tutorialNoFail = false;
    if (skipped) markTutorialDone(this.scene.profile);
    this.destroy();
  }

  _track(obj) { this._objs.push(obj); return obj; }

  destroy() {
    this._step = STEP.FINISHED;
    if (this._bobTween)  { this._bobTween.remove();  this._bobTween = null; }
    if (this._zoneTween) { this._zoneTween.remove(); this._zoneTween = null; }
    for (const o of this._objs) { try { o?.destroy(); } catch (_) { /* no-op */ } }
    this._objs = [];
  }
}
