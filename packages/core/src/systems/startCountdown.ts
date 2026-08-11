/**
 * startCountdown — 타임어택 게임 공용 '3·2·1 → START!' 시작 카운트다운 오버레이.
 *
 * 왜: 제한시간이 있는 게임이 예고 없이 시작되면 플레이어가 첫 1~2초를 그냥 잃는다.
 * 사용: 플레이 씬에서 `startCountdown(this).then(() => { ...타이머/입력 시작... })`
 *   — resolve 는 'START!' 문구가 뜨는 순간(입력 차단 해제와 동시)이므로 거기서 타이머를 켠다.
 *
 *  - 카운트 동안 전면 투명 히트존이 포인터 입력을 흡수 → 게임별 상태 플래그 불필요
 *  - 카메라 크기 비례 폰트 → 720 폭·1080 HD 세로 등 어떤 해상도에도 자연 스케일
 *  - scrollFactor 0 + 초고 depth — 카메라가 움직이는 씬에서도 화면 고정 오버레이
 */
import type Phaser from 'phaser';
import { FONT } from '../tokens.js';

export interface StartCountdownOptions {
  /** 시작 숫자(기본 3). */
  from?: number;
  /** 숫자 간 간격 ms(기본 720). */
  stepMs?: number;
  /** 마지막 문구(기본 'START!'). */
  go?: string;
  /** 배경 딤 알파(기본 0.42, 0=딤 없음 — 입력 흡수는 유지). */
  dimAlpha?: number;
  /** 오버레이 depth(기본 900000). */
  depth?: number;
  /** 폰트(기본 코어 FONT.family). */
  fontFamily?: string;
  /** 숫자가 바뀔 때마다(3·2·1) 호출 — 카운트다운 효과음을 화면과 맞춰 울리는 용도. */
  onStep?: (n: number) => void;
}

/** 3·2·1 카운트다운을 표시하고 'START!' 시점에 resolve 한다(중복 호출 시 각자 독립 동작). */
export function startCountdown(scene: Phaser.Scene, opts: StartCountdownOptions = {}): Promise<void> {
  const {
    from = 3,
    stepMs = 720,
    go = 'START!',
    dimAlpha = 0.42,
    depth = 900000,
    fontFamily = FONT.family,
    onStep,
  } = opts;
  return new Promise((resolve) => {
    const cam = scene.cameras.main;
    const cx = cam.width / 2;
    const cy = cam.height / 2;
    const numSize = Math.round(cam.width * 0.3);
    const goSize = Math.round(cam.width * 0.17);

    // 딤 + 입력 흡수(카운트 동안 보드/버튼 오조작 방지)
    const dim = scene.add
      .rectangle(cx, cy, cam.width, cam.height, 0x000000, dimAlpha)
      .setScrollFactor(0)
      .setDepth(depth)
      .setInteractive();
    const label = scene.add
      .text(cx, cy, '', {
        fontFamily,
        fontSize: `${numSize}px`,
        fontStyle: 'bold',
        color: '#FFFFFF',
        stroke: '#152036',
        strokeThickness: Math.max(8, Math.round(numSize * 0.08)),
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(depth + 1);

    const pop = (): void => {
      label.setScale(1.55).setAlpha(0);
      scene.tweens.add({ targets: label, scale: 1, alpha: 1, duration: 190, ease: 'Back.easeOut' });
    };

    let n = from;
    const tick = (): void => {
      // 카운트 도중 씬이 종료·재시작되면 그대로 끝낸다(리스너 누수 방지).
      if (!label.scene || !label.active) {
        resolve();
        return;
      }
      if (n > 0) {
        label.setFontSize(numSize).setText(String(n));
        pop();
        onStep?.(n);
        n -= 1;
        scene.time.delayedCall(stepMs, tick);
        return;
      }
      // START! — 입력 차단은 즉시 해제, 문구는 잠깐 남았다가 사라진다(타이머는 지금부터).
      dim.destroy();
      label.setFontSize(goSize).setText(go);
      pop();
      resolve();
      scene.tweens.add({
        targets: label,
        alpha: 0,
        scale: 1.25,
        delay: 380,
        duration: 260,
        onComplete: () => label.destroy(),
      });
    };
    tick();
  });
}
