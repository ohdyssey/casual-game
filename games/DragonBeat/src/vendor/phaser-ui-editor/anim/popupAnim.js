/**
 * popupAnim — 팝업 씬 공용 UI 애니메이션 컨트롤러.
 *
 * 레이아웃 구동(혹은 레이아웃-크롬 하이브리드) 팝업이 에디터에서 저작한
 * 애니메이션을 HomeScene 카드와 동일한 생명주기로 재생하도록 캡슐화한다.
 *   idle 루프 + enter/tap/exit 1회 트리거 + 스프링 tick + pause/resume + teardown.
 *
 * 설계: HomeScene 의 _playCenterIdle/_fireCardTrigger 패턴을 카드 비의존적으로 일반화.
 *   - idle 핸들 1개(선택/문서 단위 교체, 매 프레임 tick).
 *   - fx 핸들 배열(enter/tap/exit 1회성, ttl 후 자동 정리).
 *   - 성능 게이트(reduced-motion/티어/캡)는 playLayoutAnims 내부에 이미 내장 → 여기선 위임만.
 *
 * 사용:
 *   const anim = attachPopupAnims(scene, { nodeMap, layout, container });
 *   anim.fireEnter();                       // 등장 + idle 시작
 *   // 버튼 핸들러:  anim.fireTap();
 *   // scene.update(t, dt):  anim.update(dt / 1000);
 *   // sleep/pause:  anim.pause();  wake/resume:  anim.resume();
 *   // shutdown:  anim.shutdown();
 */
import { playLayoutAnims, stopLayoutAnims } from './index.js';

/**
 * 씬 생명주기 ↔ 팝업 애니메이션 컨트롤러 바인딩(인스턴스당 1회).
 *
 * ⚠ Phaser Systems.shutdown 은 사용자 이벤트 리스너를 제거하지 않는다(destroy 만 removeAllListeners).
 *   팝업은 열고닫기를 반복하므로 create 마다 on() 을 달면 누적된다 → 인스턴스 플래그로 1회만 바인딩.
 *   컨트롤러는 매 오픈마다 새로 생성되어 `scene._popupAnim` 에 재할당되므로 클로저가 항상 현재값을 읽는다.
 *
 * 규약: 씬은 컨트롤러를 `this._popupAnim` 에 저장하고, update 에서 `this._popupAnim?.update(dt)` 를 호출한다.
 */
export function bindPopupAnimLifecycle(scene) {
  if (scene._popupAnimBound) return;
  scene._popupAnimBound = true;
  const pause = () => scene._popupAnim?.pause();
  const resume = () => scene._popupAnim?.resume();
  const teardown = () => scene._popupAnim?.shutdown();
  scene.events.on('shutdown', teardown);
  scene.events.on('destroy', teardown);
  scene.events.on('sleep', pause);
  scene.events.on('pause', pause);
  scene.events.on('wake', resume);
  scene.events.on('resume', resume);
}

const FX_TTL_MS = 2600;        // enter/tap 1회성 핸들 안전 정리 시간(HomeScene 동일).
const EXIT_TTL_MS = 1200;      // exit 는 더 짧게(곧 씬 종료).

/**
 * @param {Phaser.Scene} scene
 * @param {{ nodeMap: Map, layout: object, container?: Phaser.GameObjects.Container }} cfg
 * @returns {object} 컨트롤러
 */
export function attachPopupAnims(scene, { nodeMap, layout, container = null }) {
  let idle = null;          // AnimHandle | null — 상시 루프(스프링/맥동).
  let fx = [];              // AnimHandle[] — 1회성 트리거.
  let dead = false;
  let paused = false;

  const playOnly = (trigger) => playLayoutAnims(scene, nodeMap, layout, { only: trigger, container });

  // 1회성 핸들 등록 + ttl 자동 정리. 빈 핸들은 즉시 폐기.
  const pushFx = (h, ttl) => {
    if (!h) return;
    if (h.empty) { h.stop(); return; }
    if (paused) h.pause();
    fx.push(h);
    scene.time.delayedCall(ttl, () => {
      try { h.stop(); } catch { /* */ }
      fx = fx.filter((x) => x !== h);
    });
  };

  const ctrl = {
    /** idle 루프 (재)시작 — 기존 idle 교체. */
    startIdle() {
      if (dead) return;
      stopLayoutAnims(idle);
      idle = playOnly('idle');
      if (paused) idle.pause();
    },
    /** 등장: enter 1회 발화 + idle 시작. */
    fireEnter() {
      if (dead) return;
      ctrl.startIdle();
      pushFx(playOnly('enter'), FX_TTL_MS);
    },
    /** 탭: 레이아웃의 tap 트리거 노드 1회 발화. */
    fireTap() {
      if (dead) return;
      pushFx(playOnly('tap'), FX_TTL_MS);
    },
    /** 값변경: 라이브 데이터(골드/레벨 등) 갱신 시 dataChange 트리거 노드 1회 발화. */
    fireDataChange() {
      if (dead) return;
      pushFx(playOnly('dataChange'), FX_TTL_MS);
    },
    /** 퇴장: idle 정지 + exit 1회 발화. */
    fireExit() {
      if (dead) return;
      stopLayoutAnims(idle);
      idle = null;
      pushFx(playOnly('exit'), EXIT_TTL_MS);
    },
    /** scene.update 에서 호출 — 스프링 적분(초 단위 dt). */
    update(dtSeconds) {
      if (dead) return;
      if (idle) idle.tick(dtSeconds);
      for (const h of fx) h.tick(dtSeconds);
    },
    /** 일시정지(씬 sleep/오버레이). */
    pause() {
      if (dead || paused) return;
      paused = true;
      idle?.pause();
      fx.forEach((h) => h.pause());
    },
    /** 재개(씬 wake). */
    resume() {
      if (dead || !paused) return;
      paused = false;
      idle?.resume();
      fx.forEach((h) => h.resume());
    },
    /** 완전 해체(씬 shutdown/destroy) — 누수 가드. */
    shutdown() {
      if (dead) return;
      dead = true;
      stopLayoutAnims(idle);
      idle = null;
      fx.forEach((h) => { try { h.stop(); } catch { /* */ } });
      fx = [];
    },
    /** 재생 중 핸들 존재 여부(디버그/테스트). */
    get active() { return !!idle || fx.length > 0; },
  };
  return ctrl;
}
