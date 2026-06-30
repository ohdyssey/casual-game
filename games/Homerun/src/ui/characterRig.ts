/**
 * CharacterRig — 에디터에 등록된 캐릭터 3동작(준비/액션/후)을 게임 상태에 맞춰 구동.
 *   타자(준비→스윙→후)·투수(준비→투구→후) 공용. 각 동작은 별도 스프라이트 클립으로 로드해
 *   한 번에 하나만 표시한다(발밑 앵커 정렬 + 노드 높이 기준 균일 스케일 → 포즈별 폭이 달라도 키 일치).
 *
 *   - playReady(): 준비 동작 반복(대기).
 *   - triggerAction(): 액션 1회 — 클립을 actionViewMs 로 압축 재생(키 프레임 타이밍 정밀화),
 *       끝나면 후 동작 반복. 액션 발동 시점은 호출자(PlayScene)가 키 프레임(컨택/릴리스)이
 *       기준 순간과 일치하도록 역산해 스케줄한다.
 */
import type Phaser from 'phaser';
import type { LayoutNode } from './layoutLoader.js';
// 에디터 클립 런타임은 @casual/core 단일 공용 사본에서.
import { loadSpriteClip, clipNativeSize } from '@casual/core';

export type RigRole = 'ready' | 'action' | 'after';

/** 동작별 클립 파일 경로(없으면 생략). */
export interface RigMotionFiles {
  readonly ready?: string;
  readonly action?: string;
  readonly after?: string;
}

/** 벤더 클립 핸들 최소 형상 — 무타입 JS 를 안전하게 다루기 위한 부분 타입. */
export interface SpriteClipHandle {
  readonly doc?: unknown;
  readonly player?: { clip?: { length?: number; loop?: string; timeScale?: number } };
  play?: () => void;
  pause?: () => void;
  seek?: (ms: number) => void;
}

export class CharacterRig {
  private readonly motions: Partial<Record<RigRole, { container: Phaser.GameObjects.Container; handle?: SpriteClipHandle }>> = {};
  private readonly containers: Phaser.GameObjects.Container[] = [];
  private role: RigRole = 'ready';
  /** 액션 클립이 아직 로드 안 됐는데 triggerAction 이 호출된 경우 — 로드 완료 시 즉시 발동하기 위한 보류 플래그. */
  private pendingAction = false;

  /**
   * @param actionViewMs 액션 1회 재생 시간(ms) — 클립을 이 길이로 압축(timeScale)해 키 프레임 타이밍을 맞춘다.
   */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Container,
    node: LayoutNode,
    files: RigMotionFiles,
    private readonly actionViewMs: number,
  ) {
    const targetH = node.h ?? 0;
    const depth = node.depth ?? 0;
    // ⚠️ 컨테이너는 생성자에서 동기적으로 layer 에 추가된다(z-order 결정적). 비동기 .then 에서
    //    bringToTop 하지 않는다 — 두 리그(타자/투수)가 동시 로드될 때 로드 완료 순서에 따라
    //    z-order 가 뒤집히는 경쟁을 피하기 위함. 캐릭터 간 순서는 호출자(buildHud)가 depth 순 생성으로 보장.
    (['ready', 'action', 'after'] as const).forEach((r) => {
      const file = files[r];
      if (!file) return;
      const c = scene.add.container(node.x, node.y).setVisible(r === 'ready').setDepth(depth);
      if (node.angle) c.setAngle(node.angle);
      layer.add(c);
      this.containers.push(c);
      loadSpriteClip(scene, file, { container: c, autoPlay: r === 'ready', anchor: node.anchor })
        .then((h: SpriteClipHandle) => {
          const ns = clipNativeSize(h.doc || {});
          if (ns.h > 0 && targetH > 0) c.setScale(targetH / ns.h); // 균일(키 일치, 왜곡 없음)
          // 액션 클립은 미리 1회·압축 설정(발동 전 로드 완료 시에도 올바른 속도/루프 보장).
          if (r === 'action' && h.player?.clip) {
            h.player.clip.timeScale = (h.player.clip.length || this.actionViewMs) / this.actionViewMs;
            h.player.clip.loop = 'once';
          }
          this.motions[r] = { container: c, handle: h };
          // 로드 시점의 현재 상태를 그대로 반영(발동 전/후 로드 모두 일관).
          const active = this.role === r;
          c.setVisible(active);
          if (active) { h.seek?.(0); h.play?.(); } else h.pause?.();
          // 액션이 로드 전에 요청됐었다면(느린 로드) 지금 즉시 발동 — 첫 투구 동작 누락 방지.
          if (r === 'action' && this.pendingAction && this.role === 'ready') this.startAction();
        })
        .catch(() => { /* 클립 로드 실패 — 해당 동작 생략 */ });
    });
  }

  private show(role: RigRole): void {
    if (!this.motions[role]) return; // 미로드 동작이면 현 상태 유지(폴백)
    this.role = role;
    (['ready', 'action', 'after'] as const).forEach((r) => {
      const m = this.motions[r];
      if (!m) return;
      const active = r === role;
      m.container.setVisible(active);
      if (active) { m.handle?.seek?.(0); m.handle?.play?.(); } else m.handle?.pause?.();
    });
  }

  private startAction(): void {
    this.pendingAction = false;
    this.show('action');
    this.scene.time.delayedCall(this.actionViewMs, () => { if (this.role === 'action') this.show('after'); });
  }

  /** 준비 동작 반복(대기). */
  playReady(): void { this.pendingAction = false; this.show('ready'); }

  /** 액션 1회(준비 상태에서만, 사이클당 1회) → actionViewMs 후 후동작 반복. 클립 미로드 시 로드 완료까지 보류. */
  triggerAction(): void {
    if (this.role !== 'ready') return;
    if (!this.motions['action']) { this.pendingAction = true; return; } // 로드 완료 시 .then 이 발동
    this.startAction();
  }

  /** 현재 표시 동작을 레이어 최상위로(임팩트/공 위로 캐릭터 보이게). */
  bringToTop(): void { for (const c of this.containers) if (c.visible) this.layer.bringToTop(c); }
}
