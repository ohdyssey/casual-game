/**
 * attackEnvelope.ts — **"시설 공격받음" 편지봉투 라벨**(목업 연출, 2026-07-07).
 *
 * 다른 유저가 내 시설을 공격하면 그 시설의 **업그레이드 버튼(화살표) 자리에** 편지봉투 + 공격자 프로필 라벨이 뜬다.
 *   - 봉투를 클릭하면 업그레이드 버튼이 다시 나타난다(공격 확인).
 *   - 업그레이드하면 라벨이 사라진다(복구). 업그레이드 안 하면 재진입 때 다시 표시(HotelScene 이 상태 관리).
 *
 * ⚠️ **목업 단계** — 실제 공격 데이터(서버/상대 정보) 연동 전이라 **연출만** 구현. 프로필은 코드 드로잉(이니셜 배지).
 *   나중에 실제 공격자 아바타/닉네임/보상 규칙으로 교체 예정. 여기서는 자체완결형(에셋 의존 없음) 봉투를 그린다.
 *
 * Phaser 씬에 붙이는 순수 UI 빌더 — 상태/영속은 호출부(HotelScene)가 담당.
 */
import Phaser from 'phaser';

/** 공격 봉투 라벨 크기(디자인 px, 화살표 근처에 얹음). */
const ENVELOPE_W = 128;
const ENVELOPE_H = 92;
const AVATAR_R = 34; // 프로필 원 반지름(봉투 좌상단에 겹침)

export interface AttackEnvelope {
  readonly container: Phaser.GameObjects.Container;
  /** 등장 연출(공격이 막 도착 — 위에서 툭 떨어지며 흔들). */
  playArrival(): void;
  /** 라벨 제거(업그레이드/확인 후). */
  destroy(): void;
}

/** 문자열 → 안정적 색상 해시(공격자마다 다른 배지 색). */
function hashColor(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffff;
  return (h | 0x404040) & 0x99ccff; // 어둡지 않게 클램프
}

/**
 * 공격 봉투 라벨 생성 — (x, y) = 화살표 중심. 봉투 + 공격자 프로필 배지 + 이름 + "!" 뱃지.
 *   onClick = 봉투 클릭(공격 확인 → 호출부가 업그레이드 버튼 노출).
 */
export function createAttackEnvelope(
  scene: Phaser.Scene,
  x: number,
  y: number,
  attacker: string,
  onClick: () => void,
  depth = 70,
): AttackEnvelope {
  const c = scene.add.container(x, y).setDepth(depth);

  // ── 봉투 본체(둥근 크림색 사각 + 플랩 삼각형 + 글로우 테두리) ──
  const g = scene.add.graphics();
  const hw = ENVELOPE_W / 2;
  const hh = ENVELOPE_H / 2;
  // 그림자
  g.fillStyle(0x000000, 0.28).fillRoundedRect(-hw + 4, -hh + 8, ENVELOPE_W, ENVELOPE_H, 12);
  // 봉투 바닥
  g.fillStyle(0xfaf3e0, 1).fillRoundedRect(-hw, -hh, ENVELOPE_W, ENVELOPE_H, 12);
  g.lineStyle(3, 0xd9b25a, 1).strokeRoundedRect(-hw, -hh, ENVELOPE_W, ENVELOPE_H, 12);
  // 플랩(위에서 접힌 삼각형)
  g.fillStyle(0xf2e6c6, 1);
  g.beginPath();
  g.moveTo(-hw + 2, -hh + 4);
  g.lineTo(0, 6);
  g.lineTo(hw - 2, -hh + 4);
  g.closePath();
  g.fillPath();
  g.lineStyle(2.5, 0xd9b25a, 0.9);
  g.beginPath();
  g.moveTo(-hw + 2, -hh + 4);
  g.lineTo(0, 6);
  g.lineTo(hw - 2, -hh + 4);
  g.strokePath();
  c.add(g);

  // ── 공격자 프로필 배지(좌상단에 겹침) — 코드 드로잉 원 + 이니셜 ──
  const bx = -hw + 6;
  const by = -hh - 4;
  const badge = scene.add.circle(bx, by, AVATAR_R, hashColor(attacker), 1).setStrokeStyle(4, 0xffffff, 1);
  const initial = (attacker.trim()[0] ?? '?').toUpperCase();
  const initialText = scene.add
    .text(bx, by, initial, { fontFamily: '"Russo One", "Jua", sans-serif', fontSize: '36px', color: '#ffffff' })
    .setOrigin(0.5);
  c.add(badge);
  c.add(initialText);

  // ── 공격 알림 "!" 뱃지(우상단 빨강) ──
  const alertBg = scene.add.circle(hw - 4, -hh - 2, 18, 0xe23b3b, 1).setStrokeStyle(3, 0xffffff, 1);
  const alertText = scene.add.text(hw - 4, -hh - 2, '!', { fontFamily: '"Russo One", sans-serif', fontSize: '26px', color: '#ffffff' }).setOrigin(0.5);
  c.add(alertBg);
  c.add(alertText);

  // ── 공격자 이름(봉투 아래) ──
  const name = scene.add
    .text(0, hh + 18, attacker, {
      fontFamily: '"Russo One", "Jua", sans-serif',
      fontSize: '28px',
      color: '#ffffff',
      stroke: '#3a2456',
      strokeThickness: 5,
    })
    .setOrigin(0.5);
  c.add(name);

  // 클릭(봉투 전체 히트존).
  const hit = scene.add.rectangle(0, 0, ENVELOPE_W + AVATAR_R, ENVELOPE_H + AVATAR_R, 0x000000, 0).setInteractive({ useHandCursor: true });
  hit.on('pointerdown', () => onClick());
  c.add(hit);

  // 은은한 상하 부유(주목 유도).
  const floatTween = scene.tweens.add({ targets: c, y: y - 6, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

  return {
    container: c,
    playArrival() {
      c.setScale(0.2).setAlpha(0);
      const startY = y - 90;
      c.y = startY;
      scene.tweens.add({ targets: c, alpha: 1, scale: 1, duration: 240, ease: 'Back.easeOut' });
      scene.tweens.add({
        targets: c,
        y,
        duration: 340,
        ease: 'Bounce.easeOut',
        onComplete: () => {
          scene.tweens.add({ targets: c, angle: { from: -5, to: 5 }, duration: 90, yoyo: true, repeat: 3, onComplete: () => (c.angle = 0) });
        },
      });
    },
    destroy() {
      floatTween.remove();
      scene.tweens.add({ targets: c, alpha: 0, scale: 0.3, duration: 200, ease: 'Quad.easeIn', onComplete: () => c.destroy() });
    },
  };
}
