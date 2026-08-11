/**
 * Portal bridge — 게임 측 핸드오프 (Phaser 의존).
 *
 * 게임이 허브에서 `?portal=<hubOrigin>` 으로 열리면:
 *   1) reportLoading(scene) — Phaser 로더 진행률을 opener(허브)로 중계.
 *   2) portalStartGate(scene, onStart) — 로딩 완료 후 공용 START 버튼 노출.
 *      누르면 오디오 잠금 해제(제스처 컨텍스트) + 허브로 started 전송 + onStart() 실행.
 *
 * 비-포털(독립 실행)이면 메시지는 보내지 않고 START 버튼만 그려 onStart 로 잇는다.
 * 이동 경로(설치형 PWA)는 opener 가 없어 중계가 자동으로 no-op 이 된다(게임 자체 로더 표시).
 */
import Phaser from 'phaser';
import { msg, parseHubOrigin } from './protocol.js';

/** 포털 런치 컨텍스트(1회 계산 후 캐시). */
export interface PortalContext {
  /** ?portal 파라미터로 열렸는지(포털 런치). */
  readonly embedded: boolean;
  /** 메시지를 보낼 허브 origin(없으면 null). */
  readonly hubOrigin: string | null;
}

let cached: PortalContext | null = null;

/** 현재 게임의 포털 런치 컨텍스트. */
export function portalContext(): PortalContext {
  if (cached) return cached;
  const hubOrigin = typeof location !== 'undefined' ? parseHubOrigin(location.search) : null;
  cached = { embedded: !!hubOrigin, hubOrigin };
  return cached;
}

/** ?portal 로 열렸는지(편의 헬퍼). */
export function isPortalLaunch(): boolean {
  return portalContext().embedded;
}

/**
 * 허브(opener)로 전송 — opener 없거나(이동 경로) 차단되면 조용히 무시.
 * 로딩바는 게임 페이지가 담당하므로 진행률은 보내지 않는다. ready/started 만 통지해
 * 허브가 향후 게임 상태(예: 시작/점수)를 소비할 여지를 남긴다.
 */
function postToHub(payload: object, hubOrigin: string): void {
  try {
    const target = typeof window !== 'undefined' ? window.opener : null;
    if (target && !(target as Window).closed) (target as Window).postMessage(payload, hubOrigin);
  } catch {
    /* cross-window 접근 차단 시 무시 */
  }
}

/**
 * START 확정 — 오디오 자동재생 잠금 해제 + (포털 런치면) 허브에 started 통지.
 * 커스텀 START 버튼(예: 게임별 로딩 화면)에서 버튼 클릭 시 호출하면 된다.
 * unlock 은 BaseSoundManager 에서 protected 라 최소 형태로 캐스팅해 호출.
 */
export function portalConfirmStart(scene: Phaser.Scene): void {
  try {
    const sm = scene.sound as unknown as { unlock?: () => void; context?: AudioContext };
    sm.unlock?.();
    if (sm.context?.state === 'suspended') void sm.context.resume();
  } catch {
    /* 오디오 실패는 치명적이지 않음 */
  }
  const ctx = portalContext();
  if (ctx.embedded && ctx.hubOrigin) postToHub(msg.started(), ctx.hubOrigin);
}

export interface StartGateOpts {
  /** 버튼 텍스트(기본 '▶  START'). */
  label?: string;
  /** 버튼 채움색(기본 브랜드 그린 0x3cb54a). */
  color?: number;
  /** 버튼 y 좌표(기본 화면 세로 중앙 + 210). */
  y?: number;
}

/**
 * 공용 START 게이트 — 로딩 완료(LoadScene.create) 후 호출.
 *  · 포털 런치: 허브로 ready 전송 → START 버튼 → 누르면 오디오 unlock + started 전송 → onStart.
 *  · 단독 실행: START 버튼만(메시지 없음) → onStart.
 * 버튼은 Phaser 컨테이너로 그려 모든 게임이 동일한 모양을 갖는다(인게임 START).
 */
export function portalStartGate(scene: Phaser.Scene, onStart: () => void, opts: StartGateOpts = {}): void {
  const ctx = portalContext();
  if (ctx.embedded && ctx.hubOrigin) postToHub(msg.ready(), ctx.hubOrigin);

  const cx = scene.scale.width / 2;
  const by = opts.y ?? scene.scale.height / 2 + 210;
  const label = opts.label ?? '▶  START';
  const color = opts.color ?? 0x3cb54a;

  const btn = scene.add.container(cx, by).setDepth(100000);
  const g = scene.add.graphics();
  g.fillStyle(color, 1);
  g.fillRoundedRect(-155, -48, 310, 96, 28);
  g.lineStyle(5, 0xffffff, 0.95);
  g.strokeRoundedRect(-155, -48, 310, 96, 28);
  const txt = scene.add
    .text(0, 0, label, {
      fontFamily: 'Jua, sans-serif',
      fontSize: '46px',
      color: '#ffffff',
      stroke: '#0a4020',
      strokeThickness: 6,
    })
    .setOrigin(0.5);
  btn.add([g, txt]);
  btn.setSize(310, 96);
  btn.setInteractive(new Phaser.Geom.Rectangle(-155, -48, 310, 96), Phaser.Geom.Rectangle.Contains);
  const pulse = scene.tweens.add({
    targets: btn,
    scale: 1.06,
    duration: 720,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  let started = false;
  btn.on('pointerdown', () => {
    if (started) return;
    started = true;
    pulse.remove();
    portalConfirmStart(scene); // 오디오 잠금 해제 + (포털) started 통지
    btn.destroy();
    onStart();
  });
}

/** 공용 로딩바 핸들. */
export interface LoadingBar {
  /** 로드 완료 + 최소 표시시간(minMs) 동안 채움이 끝나면 resolve. 이후에만 START 를 띄운다. */
  whenReady(): Promise<void>;
  /** 바 그래픽 제거. */
  destroy(): void;
}

export interface LoadingBarOpts {
  /** 0→100% 채움 최소 시간(ms). 즉시 로드돼도 이 시간 동안 보이게. 기본 900. */
  minMs?: number;
  /** 채움색(기본 브랜드 그린). */
  color?: number;
  /** 바 y 좌표(기본 화면 세로 중앙 + 150). */
  y?: number;
  /** 바 두께(세로, px). 기본 26. */
  height?: number;
  /** 바 길이(가로, px). 기본은 화면폭 비례 자동 계산(440~760). */
  width?: number;
  /** 진행률(%) 텍스트 위치 — 기본 바 아래('below'). 'above'=바 위, 'center'=바 중앙(겹쳐 표시). */
  pctPosition?: 'above' | 'below' | 'center';
  /** 진행률(%) 텍스트 폰트 크기(px). 기본 24. */
  pctFontSize?: number;
  /** 진행률(%) 텍스트 볼드체 여부. 기본 false. */
  pctBold?: boolean;
}

/**
 * 공용 로딩바 — LoadScene.preload 에서 호출. 게임 페이지에 진행률 바를 그린다.
 *
 * Phaser 로더 진행률을 따라 채우되, 즉시 로드(로컬/캐시)돼도 최소 minMs 동안 0→100%
 * 애니메이션으로 보이게 한다(로딩바가 깜빡이고 사라지는 것을 방지). `whenReady()` 는
 * 로드 완료 + 바가 100% 에 도달한 뒤에만 resolve 하므로, 호출부는 이때 비로소 START 를
 * 띄운다 — **로딩 끝나기 전엔 START 가 활성화되지 않는다.**
 */
export function portalLoadingBar(scene: Phaser.Scene, opts: LoadingBarOpts = {}): LoadingBar {
  const minMs = opts.minMs ?? 900;
  const color = opts.color ?? 0x3cb54a;
  const cx = scene.scale.width / 2;
  const by = opts.y ?? scene.scale.height / 2 + 150;
  // 바 길이 — 프레임 폭에 비례해 길게(좁은 720 프레임 ~446, HD 1080 프레임 ~670). 이전 고정 420 대비 확대.
  const barW = opts.width ?? Math.max(440, Math.min(760, Math.round(scene.scale.width * 0.62)));
  const barH = opts.height ?? 26;
  const bx = cx - barW / 2;
  // 양끝을 완전한 반원(캡슐/알약 모양)으로 — 반지름을 두께의 절반으로 둬 어떤 두께에서도
  // 끝이 각지지 않고 둥글게 떨어지게 한다(이전엔 고정 13/10 이라 두꺼운 바에선 각져 보였다).
  const frameRadius = barH / 2;
  const fillRadius = Math.max(0, barH / 2 - 3);

  const frame = scene.add.graphics().setDepth(99999);
  frame.lineStyle(4, 0xffffff, 0.9);
  frame.strokeRoundedRect(bx, by, barW, barH, frameRadius);
  const fill = scene.add.graphics().setDepth(99999);
  const pctFontSize = opts.pctFontSize ?? 24;
  const pctPos = opts.pctPosition ?? 'below';
  const pctY = pctPos === 'above' ? by - 20 : pctPos === 'center' ? by + barH / 2 : by + barH + 28;
  const pctOriginY = pctPos === 'above' ? 1 : 0.5;
  const pct = scene.add
    .text(cx, pctY, '0%', {
      fontFamily: 'Jua, sans-serif',
      fontSize: `${pctFontSize}px`,
      fontStyle: opts.pctBold ? 'bold' : undefined,
      color: '#ffffff',
      stroke: '#0a3018',
      strokeThickness: 5,
    })
    .setOrigin(0.5, pctOriginY)
    .setDepth(99999);

  let target = 0; // 실제 로더 진행률(0..1)
  let displayed = 0; // 화면 표시 — 목표를 향해 최소 minMs 동안 채움
  let loaded = false;
  let destroyed = false;
  const onProgress = (v: number): void => {
    target = Math.max(target, v);
  };
  const onComplete = (): void => {
    target = 1;
    loaded = true;
  };
  scene.load.on('progress', onProgress);
  scene.load.on('complete', onComplete);

  const render = (): void => {
    fill.clear();
    fill.fillStyle(color, 1);
    const w = (barW - 6) * displayed;
    if (w > 0) fill.fillRoundedRect(bx + 3, by + 3, w, barH - 6, Math.min(fillRadius, w / 2));
    pct.setText(`${Math.round(displayed * 100)}%`);
  };
  render();

  let resolveReady!: () => void;
  const ready = new Promise<void>((r) => {
    resolveReady = r;
  });

  // 씬 update 루프(create 이후 매 프레임)에서 displayed 를 target 으로 최소 minMs 속도로 채운다.
  const onUpdate = (_t: number, dt: number): void => {
    if (destroyed) return;
    displayed = Math.min(target, displayed + dt / minMs);
    render();
    if (loaded && displayed >= 1) {
      scene.events.off('update', onUpdate);
      resolveReady();
    }
  };
  scene.events.on('update', onUpdate);

  return {
    whenReady: () => ready,
    destroy: () => {
      destroyed = true;
      scene.events.off('update', onUpdate);
      scene.load.off('progress', onProgress);
      scene.load.off('complete', onComplete);
      frame.destroy();
      fill.destroy();
      pct.destroy();
    },
  };
}
