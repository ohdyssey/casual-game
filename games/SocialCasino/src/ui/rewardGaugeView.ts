/**
 * rewardGaugeView.ts — 보상 게이지(EARN SPINS)의 **뷰**(디자이너 main.json grp_2 노드 바인딩).
 *   로직은 코어 `@casual/core` rewardGauge(기본 시스템). 이 뷰는 상태 → 채움바/텍스트/타이머/배지 표시만.
 *
 * ⚠️ **채움바(up_SC_UI_53)는 "꽉 찬 파란 캡슐" 이미지**(액체가 아님) — 스케일로 줄이면 찌그러져 안 보인다.
 *   → **마스크(아래 사각형)로 바닥에서 ratio 만큼 위로 드러내** 네이비 튜브(up_SC_UI_52)를 채워 오르게 한다.
 */
import Phaser from 'phaser';
import { type RewardGaugeConfig, rewardAt } from '@casual/core';

/** main.json grp_2 에서 찾은 게이지 노드 참조. */
export interface GaugeNodeRefs {
  fillBar?: Phaser.GameObjects.Image; // up_SC_UI_53 (꽉 찬 파란 캡슐 = 채움)
  currentText?: Phaser.GameObjects.Text; // layer_16 "1,540/"
  targetText?: Phaser.GameObjects.Text; // layer_16_copy "2,000"
  timerText?: Phaser.GameObjects.Text; // layer_16_copy2 "1:59" (디지털 시계 폰트)
  timerFrame?: Phaser.GameObjects.Image; // up_SC_UI_52-5 (타이머 패널) — 타이머를 이 프레임 정중앙(좌우·상하)에 배치
  milestoneText?: Phaser.GameObjects.Text; // layer_17_copy "100"(중간단계 보상액)
  finalText?: Phaser.GameObjects.Text; // layer_17 "500"(최종 보상액)
  milestoneBadge?: Phaser.GameObjects.Image; // up_SC_UI_51-2_v2 (중간단계 배지 — 도달 팝)
  finalBadge?: Phaser.GameObjects.Image; // up_SC_UI_54_v2 (최종 배지 — 도달 팝)
  collectGem?: Phaser.GameObjects.Image; // up_T01_05 (수집 타겟 코인) — 채움 시작점(이 젬 위)
  milestoneCluster?: Phaser.GameObjects.GameObject[]; // 중간 보상 배지 묶음(프레임·아이콘·숫자) — 임계 위치로 이동
}

/** 1%라도 보이도록 하는 최소 채움 높이(px). */
const MIN_FILL_PX = 5;
/** ⭐시간 압박 — 남은 시간이 이 이하면 타이머를 **빨갛게 깜빡**(요청: 긴장도 업). 2분 미션의 마지막 30초. */
const GAUGE_URGENT_MS = 30_000;
/** ⭐디지털 시계 타이머 **글자 두께**(동색 스트로크 px) — 요청 "굵은 폰트". 값↑=더 굵음(과하면 세그먼트 뭉침). */
const TIMER_STROKE_PX = 5;
/** ⭐디지털 시계 타이머 **크기 배율**(에디터 fontSize 대비) — 요청 "약간 작게". 0.85 = 44px→~37px. */
const TIMER_FONT_SCALE = 0.85;
/** ⭐채움 100% 지점을 보상 배지 바닥에서 **이만큼 아래로** 내림(px) — 목표=100%에 정확히 선 닿게(요청, 오버슈트 해소). */
const FILL_TOP_INSET = 20;

export class RewardGaugeView {
  private readonly scene: Phaser.Scene;
  private readonly nodes: GaugeNodeRefs;
  private readonly config: RewardGaugeConfig;
  private fillRange = 0; // 채움 범위(수집젬 위 ~ 캡슐 상단)
  private fillBottomY = 0; // 채움 시작 y(=수집 타겟젬 위)
  private barX = 0;
  private barW = 0;
  private maskG?: Phaser.GameObjects.Graphics;
  private readonly ratioState = { v: 0 };
  private ratioTween?: Phaser.Tweens.Tween;
  private timerBaseColor = '#ffffff'; // 평상시 타이머 색(레이아웃 지정값 보존)
  private timerUrgent = false; // 현재 긴급(빨강 깜빡) 상태 — 전환 시에만 트윈 갱신
  private timerPulse?: Phaser.Tweens.Tween;
  // ⭐가로형(2026-07-02, main_copy 슬롯게이지 바) — 왼→오른쪽 채움. 세로형(구 캡슐)과 분기.
  private readonly horizontal: boolean;
  private fillLeftX = 0; // 가로형 채움 시작 x(바 좌측 모서리)
  private barY = 0; // 가로형 바 세로중심
  private barH = 0; // 가로형 바 높이

  constructor(scene: Phaser.Scene, nodes: GaugeNodeRefs, config: RewardGaugeConfig, horizontal = false) {
    this.scene = scene;
    this.nodes = nodes;
    this.config = config;
    this.horizontal = horizontal;
    this.timerBaseColor = (nodes.timerText?.style?.color as string | undefined) || '#ffffff';
    // ⭐타이머 = **디지털 시계(7-세그먼트 LCD) 폰트, 굵게**(요청). 에디터 지정 폰트(Russo One)를 의도적으로 덮어씀(숫자/콜론만 쓰므로 DSEG7 적합).
    //   'DSEG7 Classic' = index.html @font-face(public/fonts/DSEG7Classic-Bold.woff2, weight 700). 미로드 시 폴백 monospace.
    //   ⚠️weight 700 명시(setFontStyle 'bold') → 굵은(700) 페이스 확정 + **동색 스트로크**로 세그먼트를 더 두껍게(요청 "굵은 폰트").
    const tt = this.nodes.timerText;
    // ⭐가로형(신 게이지)은 **에디터 지정 폰트/색/크기 그대로**(요청: 디지털폰트 금지) — DSEG7 오버라이드는 세로형(구)만.
    if (tt && !horizontal) {
      tt.setFontFamily('"DSEG7 Classic", "Russo One", monospace').setFontStyle('bold');
      // ⭐디지털 폰트를 **약간 작게**(요청) — DSEG7 은 같은 px 에서 일반 폰트보다 크게 보여 에디터값×배율로 축소.
      const basePx = parseInt(String(tt.style.fontSize), 10) || 44;
      tt.setFontSize(Math.round(basePx * TIMER_FONT_SCALE));
      tt.setStroke(this.timerBaseColor, TIMER_STROKE_PX);
      tt.setOrigin(0.5, 0.5);
      // ⭐타이머 프레임(up_SC_UI_52-5) **정중앙(좌우·상하)** 에 배치(요청). 프레임 없으면 노드 자리 유지.
      const tf = this.nodes.timerFrame;
      if (tf) tt.setPosition(tf.x, tf.y);
    }
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.timerPulse?.remove());

    const bar = nodes.fillBar;
    if (bar && horizontal) {
      // ⭐가로형: 디자이너 진행 바(핑크)를 좌→우로 마스크 채움. 캡슐 리사이즈 없이 폭 비율만.
      this.fillLeftX = bar.x - bar.displayWidth / 2;
      this.fillRange = bar.displayWidth;
      this.barY = bar.y;
      this.barH = bar.displayHeight;
      const g = scene.make.graphics({});
      bar.setMask(g.createGeometryMask());
      this.maskG = g;
      this.drawMask(0);
      scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => g.destroy());
    } else if (bar) {
      const barW = bar.displayWidth;
      const fin = nodes.finalBadge;
      // ⭐채움 범위 = **출발선(0%) ~ 최종 보상(100%)** — 캡슐을 그 범위로 재배치/리사이즈해 **길이가 퍼센트에 정비례**(요청).
      //   0% 출발선 = 디자이너가 main.json 에 배치한 **채움바(up_SC_UI_53)의 바닥 모서리**(레이아웃 주도 — 디자이너가 바를 옮기면
      //   출발선도 그대로 따라감, 매직 상수 없음). 100% = 최종 보상 배지(상단). 바닥에서 위로 차오른다(drawMask MIN_FILL 로 1%도 보임).
      //   ⚠️아래 setDisplaySize 가 bar 를 리사이즈하기 **전에** 원본 바닥 좌표를 캡처해야 함.
      const bottomY = bar.y + bar.displayHeight * (1 - bar.originY);
      // ⭐100% 채움선 = 최종 보상 배지 바닥 + **FILL_TOP_INSET**(아래로 내림). 이전엔 배지 바로 밑이라 채움이 목표선을 **넘어** ~94%에서 이미 선에 닿았다(요청).
      //   인셋만큼 100% 지점을 내려 **정확히 목표=100%** 에 선에 닿게 한다. 값↑ = 100% 지점 더 아래.
      const topY = (fin ? fin.y + fin.displayHeight * (1 - fin.originY) : bar.y - bar.displayHeight * bar.originY) + FILL_TOP_INSET;
      const h = Math.max(20, bottomY - topY);
      bar.setPosition(bar.x, (topY + bottomY) / 2).setDisplaySize(barW, h); // 캡슐을 채움 범위로 늘려 배치
      this.fillBottomY = bottomY;
      this.fillRange = h;
      this.barX = bar.x;
      this.barW = barW;
      const g = scene.make.graphics({}); // 마스크용(디스플레이 리스트 밖 → 화면에 안 그려짐)
      bar.setMask(g.createGeometryMask());
      this.maskG = g;
      this.drawMask(0);
      scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => g.destroy());
    }
    // 보상 금액 텍스트 = config(SSOT)에서. ⭐폰트는 **에디터 지정값 그대로 존중**(요청 "폰트 정밀 배치" — 디자이너가 main.json 에서 Fredoka 등으로 설정). 코드가 덮어쓰지 않음.
    const cluster = nodes.milestoneCluster;
    const hasMilestone = config.milestones.length > 0;
    if (hasMilestone) {
      // ⭐중간 보상 배지를 **임계(atRatio) 채움선**에 맞춰 위아래로 이동(요청 — 숫자도 함께). 클러스터 전체를 같은 dy 만큼.
      if (cluster && cluster.length && this.fillRange > 0) {
        const mRatio = config.milestones[0]?.atRatio ?? 0.5;
        const targetY = this.fillBottomY - this.fillRange * mRatio;
        const ys = cluster.map((o) => (o as unknown as { y: number }).y);
        const curY = ys.reduce((s, y) => s + y, 0) / ys.length;
        const dy = targetY - curY;
        for (const o of cluster) (o as unknown as { y: number }).y += dy;
      }
      nodes.milestoneText?.setText(String(rewardAt(config, 0).amount));
    } else {
      // ⭐중간 보상 없음(요청 "일단 중간 보상은 설정하지 마세요") → 중간 배지/숫자/클러스터 전부 숨김.
      nodes.milestoneText?.setVisible(false);
      nodes.milestoneBadge?.setVisible(false);
      for (const o of cluster ?? []) (o as unknown as { setVisible?: (v: boolean) => void }).setVisible?.(false);
    }
    // 최종(유일) 보상 텍스트 = config(SSOT). 폰트는 에디터값(Fredoka 등) 유지 — 코드가 덮어쓰지 않음(요청 "폰트 정밀 배치").
    nodes.finalText?.setText(String(rewardAt(config, config.milestones.length).amount));
  }

  /** 마스크를 **수집젬 위**에서 ratio 비율만큼 위로 드러냄(채움). ⭐1%라도 최소 높이로 보이게. */
  private drawMask(ratio: number): void {
    const g = this.maskG;
    if (!g) return;
    const r = ratio < 0 ? 0 : ratio > 1 ? 1 : ratio;
    g.clear();
    g.fillStyle(0xffffff);
    if (this.horizontal) {
      const w = r <= 0 ? 0 : Math.max(MIN_FILL_PX, this.fillRange * r);
      g.fillRect(this.fillLeftX - 4, this.barY - this.barH / 2 - 4, w + 4, this.barH + 8); // 좌→우 채움
    } else {
      const h = r <= 0 ? 0 : Math.max(MIN_FILL_PX, this.fillRange * r);
      const top = this.fillBottomY - h;
      g.fillRect(this.barX - this.barW / 2 - 6, top, this.barW + 12, h + 4); // 바닥→위 채움
    }
  }

  /** 채움 비율(0..1). animate=true 면 부드럽게 채워 오른다. */
  setRatio(r: number, animate = true): void {
    if (!this.maskG) return;
    const target = r < 0 ? 0 : r > 1 ? 1 : r;
    this.ratioTween?.remove();
    if (animate) {
      this.ratioTween = this.scene.tweens.add({ targets: this.ratioState, v: target, duration: 320, ease: 'Quad.easeOut', onUpdate: () => this.drawMask(this.ratioState.v) });
    } else {
      this.ratioState.v = target;
      this.drawMask(target);
    }
  }

  /** 현재/목표 표시 — **"현재값/목표"** 를 `/` 로 구분(요청 2026-06-30).
   *   ⭐디자이너가 현재 main.json 에선 한 노드(layer_16 "154/200")로 합쳤다 → currentText 한 곳에 "현재/목표" 전체를 쓴다.
   *   (이전 분리형: currentText="현재 /", targetText="목표" 두 노드. targetText 존재 시 그 방식 유지 — 양쪽 레이아웃 호환.) */
  setCounts(current: number, target: number): void {
    const cur = Math.floor(current).toLocaleString('en-US');
    const tgt = target.toLocaleString('en-US');
    if (this.nodes.targetText) {
      this.nodes.currentText?.setText(`${cur} /`);
      this.nodes.targetText.setText(tgt);
    } else {
      this.nodes.currentText?.setText(`${cur}/${tgt}`);
    }
  }

  /** ⭐미션 완료~다음 미션 사이(휴면 간격) 동안 **목표 정보 + 타겟 퍼즐을 지움**(요청 2026-06-30).
   *   숨김: 타이머 시간·카운트 숫자 + **타겟 퍼즐 아이콘(up_T01_05)**. ⚠️폭탄·표시창(프레임 패널)은 **그대로 띄워 둠**. 새 미션 시작 시 복원. */
  setTargetCleared(cleared: boolean): void {
    const vis = !cleared;
    this.nodes.timerText?.setVisible(vis); // 목표 시간(숫자)
    this.nodes.currentText?.setVisible(vis); // 현재/목표 카운트(숫자)
    this.nodes.targetText?.setVisible(vis); // (분리형 레이아웃의 목표 숫자)
    this.nodes.collectGem?.setVisible(vis); // ⭐타겟 퍼즐 아이콘 — 휴면 중 제거(요청 "타겟 퍼즐 남아있는것도 지워라")
  }

  /** 남은 제한시간 → **M:SS**(짧은 미션). 마지막 30초엔 **빨강 + 깜빡**으로 시간 압박(요청). */
  setTimer(ms: number): void {
    const t = this.nodes.timerText;
    if (!t) return;
    const s = Math.max(0, Math.floor(ms / 1000));
    t.setText(`${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`);
    const urgent = ms <= GAUGE_URGENT_MS;
    if (urgent === this.timerUrgent) return; // 상태 불변 시 트윈 재생성 안 함(매초 호출 안전)
    this.timerUrgent = urgent;
    this.timerPulse?.remove();
    this.timerPulse = undefined;
    if (urgent) {
      t.setColor('#ff4d4d');
      t.setStroke('#ff4d4d', TIMER_STROKE_PX); // 굵기 유지 — 스트로크도 빨강으로(요청 "굵은 폰트")
      this.timerPulse = this.scene.tweens.add({ targets: t, alpha: { from: 1, to: 0.4 }, duration: 340, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else {
      t.setColor(this.timerBaseColor).setStroke(this.timerBaseColor, TIMER_STROKE_PX).setAlpha(1);
    }
  }

  /** ⭐최종(유일) 보상 갱신 — 미션 플랜(스핀↔코인 번갈아)에 맞춰 **금액 문자열 + 배지 아이콘**을 전환(미션 전환 시 호출).
   *   text=표시 금액(스핀 풀숫자 / 코인 축약), iconKey=보상 배지 텍스처(스핀 번개 / 코인). 배지는 표시 크기 보존. */
  setFinalReward(text: string, iconKey?: string): void {
    this.nodes.finalText?.setText(text);
    const badge = this.nodes.finalBadge;
    if (badge && iconKey && this.scene.textures.exists(iconKey) && badge.texture?.key !== iconKey) {
      const w = badge.displayWidth;
      const h = badge.displayHeight;
      badge.setTexture(iconKey);
      badge.setDisplaySize(w, h); // 텍스처 교체 시 원본 표시 크기 유지
    }
  }

  /** 보상 도달 연출 — 해당 배지 팝. index < milestones.length = 중간단계, 아니면 최종. */
  popReward(index: number): void {
    const badge = index < this.config.milestones.length ? this.nodes.milestoneBadge : this.nodes.finalBadge;
    if (!badge) return;
    const sx = badge.scaleX;
    const sy = badge.scaleY;
    this.scene.tweens.add({ targets: badge, scaleX: sx * 1.35, scaleY: sy * 1.35, duration: 170, yoyo: true, repeat: 1, ease: 'Sine.easeInOut' });
  }
}
