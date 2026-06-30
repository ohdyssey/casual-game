/**
 * attackBanner — 공격/약탈(ATTACK!/RAID!) 발동 텍스트 묶음의 **단일 출처**.
 *
 * 보드에서 PlayScene 이 띄우는 떠 있는 배너와, 슬롯결정 후 망치 연출 오버레이(HammerFxScene)가
 * 망치 **앞에** 다시 그리는 텍스트가 완전히 동일하도록 한 곳에서 만든다(룩 일치 = 끊김 없는 핸드오프).
 *
 * 반환 컨테이너는 원점(0,0) 기준 — 위치/깊이/스케일/알파는 호출자가 설정한다.
 */
import Phaser from 'phaser';
import { ATTACK_FX_KEY, RAID_FX_KEY } from '../assets.js';

export type AttackKind = 'attack' | 'raid';

/** 발동 배너 폰트(굵은 이텔릭). 미로드 시 시스템 폴백. */
const BANNER_FONT = '"Kanit", "Do Hyeon", sans-serif';

/** 종류별 색(폴백 텍스트 / 스트로크). */
const COLORS: Record<AttackKind, { color: string; stroke: string }> = {
  attack: { color: '#ff5252', stroke: '#4a0808' },
  raid: { color: '#ffc23d', stroke: '#4a3000' },
};

/** 워드아트 이미지 표시 폭(px) — 캔버스(1080) 대비 큼직하게. 높이는 종횡비 보존. */
const WORD_WIDTH = 780;

/**
 * 공격/약탈 발동 배너 — **디자이너 이미지 워드아트("ATTACK!/RAID!" 버스트, 타입 01)** + "×N" 배수 텍스트를
 *   한 컨테이너로 묶어 반환(2026-06-29: 기존 텍스트 이펙트를 이미지로 교체). 반투명은 호출자가 컨테이너 알파로 적용.
 *   이미지 미로드(레이스/폴백) 시 기존 텍스트로 폴백 — 룩이 끊기지 않게.
 */
export function buildAttackBanner(scene: Phaser.Scene, type: AttackKind, mult: number): Phaser.GameObjects.Container {
  const { color, stroke } = COLORS[type];
  const fxKey = type === 'attack' ? ATTACK_FX_KEY : RAID_FX_KEY;

  let word: Phaser.GameObjects.GameObject;
  let wordBottom = 110; // 워드 하단 y(×N 위치 산정용)
  if (scene.textures.exists(fxKey)) {
    const src = scene.textures.get(fxKey).getSourceImage() as { width: number; height: number };
    const ar = src.width > 0 ? src.height / src.width : 0.33;
    const h = WORD_WIDTH * ar;
    word = scene.add.image(0, -10, fxKey).setOrigin(0.5).setDisplaySize(WORD_WIDTH, h);
    wordBottom = -10 + h / 2;
  } else {
    // 폴백: 기존 텍스트 워드(이텔릭 + 두꺼운 스트로크는 우상단 잘림 방지 padding).
    word = scene.add
      .text(0, -50, type === 'attack' ? 'ATTACK!' : 'RAID!', {
        fontFamily: BANNER_FONT,
        fontStyle: 'italic 800',
        fontSize: '210px',
        color,
        stroke,
        strokeThickness: 18,
        padding: { left: 12, right: 48, top: 36, bottom: 12 },
      })
      .setOrigin(0.5);
    wordBottom = 60;
  }

  const sub = scene.add
    .text(0, wordBottom + 42, `×${mult}`, {
      // ⭐요청 2026-06-29: 약간 확대(128→146) + 흰색 폰트 + 위로 올림(+70→+42, 워드와 더 가깝게).
      fontFamily: BANNER_FONT,
      fontStyle: 'italic 800',
      fontSize: '146px',
      color: '#ffffff',
      stroke,
      strokeThickness: 15,
      padding: { left: 10, right: 36, top: 26, bottom: 10 },
    })
    .setOrigin(0.5);
  return scene.add.container(0, 0, [word, sub]);
}
