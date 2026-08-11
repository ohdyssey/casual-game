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
import { isDerivedMotion, sliceSpriteDoc, type CharacterMotionFiles } from './spriteRegistry.js';

export type RigRole = 'ready' | 'action' | 'after';

/** 팔로스루 정지 유지 시간(ms) — 이 뒤 준비자세로 복귀(스윙 종료 기준 0.5초 이내, 사용자 요청). */
const READY_RETURN_MS = 400;

/** 동작별 클립 지정(없으면 생략) — 파일 경로이거나 다른 클립 구간에서 파생. */
export type RigMotionFiles = CharacterMotionFiles;

/**
 * 벤더 런타임은 ref 로 "파싱된 문서 객체"도 그대로 받는다(spriteClipRuntime.js 의 resolveSpriteDoc:
 * `else if (ref && typeof ref === 'object') raw = ref;`). 다만 @casual/core 의 TS 시그니처는 string
 * 으로만 좁혀져 있어, 12개 게임 공용 사본을 건드리지 않고 이 호출부에서만 실제 계약대로 넓힌다.
 */
const loadClipRef = loadSpriteClip as unknown as (
  scene: Phaser.Scene,
  ref: string | object,
  opts: { container: Phaser.GameObjects.Container; autoPlay?: boolean; anchor?: { x: number; y: number } },
) => Promise<SpriteClipHandle>;

/** 벤더 클립 핸들 최소 형상 — 무타입 JS 를 안전하게 다루기 위한 부분 타입. */
export interface SpriteClipHandle {
  readonly doc?: unknown;
  /** elapsed = 클립 재생 경과(네이티브 클립 단위 ms) — ClipPlayer 의 공개 프로퍼티, 매 틱 갱신. */
  readonly player?: { clip?: { length?: number; loop?: string; timeScale?: number }; elapsed?: number };
  play?: () => void;
  pause?: () => void;
  seek?: (ms: number) => void;
}

export class CharacterRig {
  private readonly motions: Partial<Record<RigRole, { container: Phaser.GameObjects.Container; handle?: SpriteClipHandle }>> = {};
  private readonly containers: Phaser.GameObjects.Container[] = [];
  /**
   * 후동작이 **액션 클립의 뒷부분**에서 파생됐는지(여성 타자). 이 경우 후동작으로 넘어가는 시점이
   * 다르다 — 별도 문서로 저작된 후동작(남성·투수)은 컨택 순간부터 시작하도록 그려져 있어 컨택에서
   * 바로 전환하지만, 뒤 n프레임 파생은 **팔로스루가 끝난 자리**라 스윙을 끝까지 튼 뒤 이어야 한다.
   * 컨택에서 전환하면 팔로스루(f31~f35)가 통째로 잘려 배트가 순간이동한 것처럼 보인다.
   */
  private readonly afterIsActionTail: boolean;
  private role: RigRole = 'ready';
  /** 액션 클립이 아직 로드 안 됐는데 triggerAction 이 호출된 경우 — 로드 완료 시 즉시 발동하기 위한 보류 플래그. */
  private pendingAction = false;
  /** 액션 종료 처리(후동작 전환 또는 마지막 프레임 정지) 타이머 — 재생 속도를 바꿀 때 재스케줄한다. */
  private actionEndTimer?: Phaser.Time.TimerEvent;
  /** 팔로스루 정지 → 준비자세 복귀 타이머(후동작 클립이 없는 캐릭터 전용). */
  private readyReturnTimer?: Phaser.Time.TimerEvent;
  /** 컨택 이후 늘린 배속을 평소 속도로 되돌리는 예약(swingOnTap 참조). */
  private tailRestoreTimer?: Phaser.Time.TimerEvent;

  /**
   * @param actionViewMs 액션 1회 재생 시간(ms) — 클립을 이 길이로 압축(timeScale)해 키 프레임 타이밍을 맞춘다.
   * @param anchorFallback 클립 문서에 `meta.anchor` 가 없을 때 대신 쓸 정렬 앵커(0..1). 노드에
   *   `anchor` 가 저작돼 있으면 언제나 그쪽이 우선한다. 앵커가 없으면 프레임 **중심**이 노드
   *   위치에 맞춰져 캐릭터가 발밑 기준으로 서지 못한다(여성 타자 사례 — spriteRegistry 참조).
   * @param readySlow 준비 동작 반복 재생 감속 배수(1=원본, 2=절반 속도). **준비 동작이 별도 문서인
   *   캐릭터 전용** — 에디터 저작 문서를 고치지 않고 로드한 클립에만 건다. 파생 준비 동작(같은
   *   스윙 클립을 잘라 쓰는 캐릭터)은 감속이 이미 문서에 들어 있어 여기서 또 걸지 않는다.
   */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Container,
    node: LayoutNode,
    files: RigMotionFiles,
    private readonly actionViewMs: number,
    anchorFallback?: { readonly x: number; readonly y: number },
    readySlow?: number,
  ) {
    const targetH = node.h ?? 0;
    const depth = node.depth ?? 0;
    this.afterIsActionTail = isDerivedMotion(files.after) && files.after.part === 'tail';
    // ⚠️ 컨테이너는 생성자에서 동기적으로 layer 에 추가된다(z-order 결정적). 비동기 .then 에서
    //    bringToTop 하지 않는다 — 두 리그(타자/투수)가 동시 로드될 때 로드 완료 순서에 따라
    //    z-order 가 뒤집히는 경쟁을 피하기 위함. 캐릭터 간 순서는 호출자(buildHud)가 depth 순 생성으로 보장.
    const anchor = node.anchor ?? anchorFallback; // 노드 저작값 > 프리셋 폴백 > (undefined 면) 문서의 meta.anchor.

    const wireUp = (r: RigRole, c: Phaser.GameObjects.Container, h: SpriteClipHandle): void => {
      const ns = clipNativeSize(h.doc || {});
      if (ns.h > 0 && targetH > 0) c.setScale(targetH / ns.h); // 균일(키 일치, 왜곡 없음)
      // 액션 클립은 미리 1회·압축 설정(발동 전 로드 완료 시에도 올바른 속도/루프 보장).
      if (r === 'action' && h.player?.clip) {
        h.player.clip.timeScale = (h.player.clip.length || this.actionViewMs) / this.actionViewMs;
        h.player.clip.loop = 'once';
      }
      // 준비 클립 감속 — 문서(파생이면 이미 감속됨)의 timeScale 에 배수를 더 건다.
      if (r === 'ready' && h.player?.clip && readySlow && readySlow > 1 && !isDerivedMotion(files.ready)) {
        h.player.clip.timeScale = (h.player.clip.timeScale || 1) / readySlow;
      }
      this.motions[r] = { container: c, handle: h };
      // 로드 시점의 현재 상태를 그대로 반영(발동 전/후 로드 모두 일관).
      const active = this.role === r;
      c.setVisible(active);
      if (active) { h.seek?.(0); h.play?.(); } else h.pause?.();
      // 액션이 로드 전에 요청됐었다면(느린 로드) 지금 즉시 발동 — 첫 투구 동작 누락 방지.
      if (r === 'action' && this.pendingAction && this.role === 'ready') this.startAction();
    };
    const warn = (r: RigRole, spec: unknown) => (e: unknown): void => {
      // 해당 동작만 생략(게임 진행 유지). 조용히 삼키면 "캐릭터가 안 보인다"류 증상을 추적할 수
      // 없으므로 DEV 에선 남긴다(사용자 보고: 여성 타자 미표시 — 원인 추적용).
      if (import.meta.env?.DEV) console.warn(`[rig] ${r} 클립 로드 실패:`, spec, e);
    };
    const makeContainer = (r: RigRole): Phaser.GameObjects.Container => {
      const c = scene.add.container(node.x, node.y).setVisible(r === 'ready').setDepth(depth);
      if (node.angle) c.setAngle(node.angle);
      layer.add(c);
      this.containers.push(c);
      return c;
    };

    // ① 파일 경로 동작(액션 + 남성/투수의 준비·후) — 각자 독립 로드.
    let actionLoad: Promise<SpriteClipHandle> | undefined;
    (['ready', 'action', 'after'] as const).forEach((r) => {
      const spec = files[r];
      if (!spec || isDerivedMotion(spec)) return;
      const c = makeContainer(r);
      const p = loadClipRef(scene, spec, { container: c, autoPlay: r === 'ready', anchor });
      p.then((h) => wireUp(r, c, h)).catch(warn(r, spec));
      if (r === 'action') actionLoad = p;
    });

    // ② 파생 동작(여성 준비: 같은 클립 앞부분 반복) — **액션이 로드한 문서를 메모리에서 잘라**
    //    쓴다. 예전엔 같은 문서를 별도로 fetch → 정규화 → 객체 로드했는데, 그 여분 경로가 환경에
    //    따라 조용히 실패해 "여성 타자가 스윙 전엔 안 보이는"(준비동작만 없는) 증상을 만들 수
    //    있었다(사용자 보고 — 액션은 뜨는데 준비만 안 뜨는 형태와 정확히 일치). 액션 핸들의 doc 은
    //    이미 정규화됐고 텍스처도 보장돼 있어 이 경로는 네트워크·스키마 변수 없이 결정적이다.
    (['ready', 'after'] as const).forEach((r) => {
      const spec = files[r];
      if (!spec || !isDerivedMotion(spec)) return;
      const c = makeContainer(r);
      if (!actionLoad) {
        warn(r, spec)(new Error('파생 원본(액션) 지정 없음'));
        return;
      }
      actionLoad
        .then((actionHandle) => {
          const doc = actionHandle.doc;
          if (!doc || typeof doc !== 'object') throw new Error('액션 doc 없음');
          const sliced = sliceSpriteDoc(doc as Parameters<typeof sliceSpriteDoc>[0], spec.part, spec.frames, spec.slow);
          return loadClipRef(scene, sliced, { container: c, autoPlay: r === 'ready', anchor });
        })
        .then((h) => wireUp(r, c, h))
        .catch(warn(r, spec));
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
    this.scheduleActionEnd(this.actionViewMs); // 압축 재생이라 클립 종료 = actionViewMs.
  }

  /**
   * 액션이 끝나는 시점의 처리를 예약한다.
   *  - 후동작 클립이 있으면 그 클립으로 전환해 반복한다 — 다음 투구의 playReady() 까지 유지된다
   *    (여성 타자는 스윙 뒤 5프레임 느린 루프, 사용자 요청: "타격후 프레임은 최종프레임의 5번째
   *    프레임 부터 마지막 프레임까지 느리게 반복하여 재생").
   *  - 없으면 마지막 프레임(팔로스루)에 잠깐 멈췄다가 READY_RETURN_MS 뒤 **준비 자세로 복귀**한다
   *    (예전 여성 타자 경로 — 정지 상태로 굳어 보이는 걸 막기 위한 것: "타격 후 타격준비자세로
   *    돌아오지 않습니다").
   */
  private scheduleActionEnd(delayMs: number): void {
    this.actionEndTimer?.remove();
    this.actionEndTimer = this.scene.time.delayedCall(delayMs, () => {
      if (this.role !== 'action') return;
      if (this.motions.after) {
        this.show('after');
        return;
      }
      this.holdActionLastFrame();
      this.readyReturnTimer?.remove();
      this.readyReturnTimer = this.scene.time.delayedCall(READY_RETURN_MS, () => {
        if (this.role === 'action') this.show('ready');
      });
    });
  }

  /**
   * 액션 클립을 마지막 프레임에서 정지시킨다(후동작 클립이 없는 캐릭터의 마무리 자세).
   *
   * ⚠️ 그냥 클립 끝(elapsed = clip.length)으로 보내면 안 된다 — 프레임 트랙은 클립 길이가 아니라
   * **자기 총길이로 따로 순환**한다(sampleFrame 의 `t % total`). 에디터가 저장한 clip.length 는
   * 반올림값이라 트랙 총길이(frames × 1000/fps)보다 0.x ms 길어질 수 있고, 그 경우 나머지가 0 이
   * 되어 마지막 프레임 대신 **첫 프레임(대기 자세)**이 튀어나온다. 1ms 앞으로 물려 그 경계를
   * 피한다 — 12fps 면 한 프레임이 83ms 라 보이는 포즈는 마지막 프레임 그대로다.
   */
  private holdActionLastFrame(): void {
    const m = this.motions.action;
    const len = m?.handle?.player?.clip?.length;
    if (!m || !len) return;
    m.handle?.seek?.(Math.max(0, len - 1));
    m.handle?.pause?.();
  }

  /**
   * 액션 클립을 fromViewMs 지점부터 재생하며, 컨택 키프레임(toViewMs, 둘 다 정상 재생 기준)이
   * 정확히 targetMs(실시간) 후에 오도록 재생 속도를 계산한다. "탭했을 때만 스윙"(자동 스윙
   * 폐지, 사용자 요청) 설계용 — 매 호출이 항상 새 스윙 시도이므로 이전 재생 위치를 이어받지
   * 않고 매번 지정한 시작 지점에서 다시 시작한다(이전 시도 slowActiveActionTo/swingIntoContactSlow
   * 는 "이미 자동으로 재생 중이던 스윙"을 전제로 한 것이라 이 용도엔 안 맞음 — 이력은 git 로그).
   *
   * ⚠️ fromViewMs 는 0 이 아닐 수 있다. 여성 타자처럼 스윙 클립 앞부분이 대기 자세인 경우 그
   * 구간을 건너뛰고 배트가 움직이기 시작하는 프레임부터 틀어야 한다 — 안 그러면 targetMs 의
   * 대부분을 이미 보고 있던 대기 자세를 되감는 데 써서 스윙이 스킵된 것처럼 보인다(실측).
   */
  swingOnTap(fromViewMs: number, toViewMs: number, targetMs: number): void {
    const m = this.motions.action;
    const clip = m?.handle?.player?.clip;
    if (!m || !clip || !clip.length || targetMs <= 0) return;
    this.role = 'action';
    (['ready', 'action', 'after'] as const).forEach((r) => {
      const other = this.motions[r];
      if (!other) return;
      const active = other === m;
      other.container.setVisible(active);
      if (!active) other.handle?.pause?.();
    });
    // 네이티브 클립 단위로 환산 — 시작 지점과 컨택 지점 사이를 targetMs 에 맞춰 재생한다.
    // ⚠️ Phaser 는 이 파일에서 타입으로만 import 한다(런타임 값 사용 불가) — 산술로 클램프.
    const startElapsed = Math.min(clip.length, Math.max(0, clip.length * (fromViewMs / this.actionViewMs)));
    const keyframeElapsed = clip.length * (toViewMs / this.actionViewMs);
    /** 평소(압축) 재생 배속 — 클립 전체를 actionViewMs 에 담는 속도. 로드 시 걸어 둔 값과 같다. */
    const naturalScale = (clip.length || this.actionViewMs) / this.actionViewMs;
    clip.timeScale = Math.max(1, keyframeElapsed - startElapsed) / targetMs;
    m.handle?.seek?.(startElapsed);
    m.handle?.play?.();

    if (this.motions.after && !this.afterIsActionTail) {
      // 별도 문서로 저작된 후동작(투수 등)은 컨택 순간에 그쪽으로 넘긴다(기존 동작).
      this.scheduleActionEnd(targetMs);
      return;
    }
    /**
     * 액션 클립의 **꼬리를 후동작으로 쓰는 캐릭터**(현행 타자 전원): 컨택에서 끊으면 팔로스루가
     * 통째로 잘리므로 끝까지 재생한다. 단 **늘린 배속을 그대로 물려주면 안 된다** —
     * `timeScale` 은 "시작~컨택 구간을 targetMs 에 맞추기" 위한 값이라, 컨택까지의 프레임 수가
     * 적은 클립일수록 작아진다(타자1: 3프레임 → 0.47배). 그 배속으로 팔로스루 20프레임을 마저
     * 틀면 5초 넘게 슬로우모션으로 흐른다. 컨택을 지나는 순간 평소 배속으로 되돌려
     * **동기화는 컨택까지만, 그 뒤는 저작 속도로** 재생한다.
     */
    this.tailRestoreTimer?.remove();
    this.tailRestoreTimer = this.scene.time.delayedCall(targetMs, () => {
      clip.timeScale = naturalScale;
    });
    const tailMs = Math.max(0, clip.length - keyframeElapsed) / naturalScale;
    this.scheduleActionEnd(targetMs + tailMs);
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

  /**
   * 현재 표시 중인 동작 컨테이너를 레이어 안에서 target 바로 위로 옮긴다(공보다 배트가 항상
   * 앞에 보이도록). bringToTop() 과 달리 "레이어 절대 최상단"이 아니라 target 기준 상대 위치라,
   * 컨택 임팩트 이펙트(공보다 나중에 add 돼 이미 최상단인 burst/ring)를 다시 덮어버리지 않는다.
   * 이미 target 위에 있으면 아무 것도 안 바뀐다(Phaser 내장 동작) — 매 프레임 호출해도 저렴하다.
   * ⚠️ Phaser 의 Container.moveAbove() 는 둘 중 하나라도 그 컨테이너의 자식이 아니면 예외를 던진다
   * (예: HMR 로 컨테이너 참조가 갱신되는 순간 등 드문 경합). 이 메서드는 매 프레임 무조건 호출되므로,
   * 여기서 한 번이라도 예외가 새면 씬의 update() 전체가 멈춰 게임이 완전히 먹통이 된다 — 그래서
   * try/catch 로 흡수한다(순수 렌더 순서 보정용이라 실패해도 게임플레이에 지장 없음).
   */
  moveAboveInLayer(target: Phaser.GameObjects.GameObject): void {
    for (const c of this.containers) {
      if (c.visible) {
        try {
          this.layer.moveAbove(c, target);
        } catch {
          /* 렌더 순서 보정 실패 — 무시(다음 프레임에 재시도됨). */
        }
        return;
      }
    }
  }
}
