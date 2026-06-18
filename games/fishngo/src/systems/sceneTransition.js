/**
 * sceneTransition.js — 전환 틈(청색화면) 원천방지용 씬 전환 헬퍼.
 *
 * 문제: `scene.start(next)` 는 현재 씬을 즉시 정지하고 다음 씬을 시작한다. 다음 씬이 preload(자산 로드)
 *   하거나 create 가 한 프레임 늦으면, 그 사이 어떤 씬도 안 그려져 캔버스 배경색(청색)이 노출된다.
 *
 * 해법(smoothStart): 다음 씬을 **launch(병렬 시작)** 해서 현재 씬을 유지한 채 다음 씬을 로드·생성하고,
 *   다음 씬이 **CREATE + 1프레임 렌더**된 뒤에야 현재 씬을 stop 한다 → 항상 무언가 그려져 청색 틈이 없다.
 *   (config 의 scene 배열 순서대로 렌더되므로, 다음 씬이 위/아래 어디에 와도 전환 중 빈 화면이 안 생김)
 */
import Phaser from 'phaser';

/**
 * 다음 씬이 완전히 준비될 때까지 현재 씬을 유지한 뒤 전환한다.
 * @param {Phaser.Scene} scene   현재(호출) 씬
 * @param {string}       nextKey 다음 씬 키
 * @param {object}      [data]   다음 씬에 전달할 데이터
 */
export function smoothStart(scene, nextKey, data) {
  const plugin = scene.scene;
  const fromKey = plugin.key;
  // 이미 다음 씬이 떠 있으면(중복 호출/재진입) 안전하게 기존 start 로 폴백.
  if (!nextKey || nextKey === fromKey || plugin.isActive(nextKey)) {
    plugin.start(nextKey, data);
    return;
  }
  try {
    if (scene.input) scene.input.enabled = false;   // 전환 중 사라질 현재 씬 입력 차단(겹침 오클릭 방지)
    plugin.launch(nextKey, data);                   // 다음 씬을 현재 위에 시작(현재 유지)
    const next = plugin.get(nextKey);
    const stopPrev = () => { try { if (plugin.isActive(fromKey)) plugin.stop(fromKey); } catch (_) {} };
    // CREATE 후 1프레임 더 기다려 첫 렌더를 보장한 뒤 현재 정지(틈 없음). 안전망: 8초 후 강제 정지.
    next.events.once(Phaser.Scenes.Events.CREATE, () => { next.time.delayedCall(16, stopPrev); });
    scene.time.delayedCall(8000, stopPrev);
  } catch (_) {
    plugin.start(nextKey, data);                    // 예외 시 기존 동작으로 폴백
  }
}
