/**
 * Item Popup Config — 4 슬롯 (line/bait/lure/rod/reel) 의 컨텐츠 매핑.
 *
 * 같은 ItemPopupScene 컴포넌트를 사용하되, 표시할 데이터만 슬롯별로 다름.
 *   - title         : 헤더 타이틀
 *   - heroIconKey   : hero card 의 아이콘 자산 키 (icon_item_line 등)
 *   - catalog       : items.config.js 의 카탈로그 (ITEM_LINES 등)
 *   - ownedSlotKey  : Equipment 의 ownedItems[slot] key
 *   - equippedKey   : Equipment 의 equipped*Id key
 *   - statRows      : 표시할 능력치 행 정의 (label, key, format, enhanceDelta)
 *   - enhanceCost   : 강화 비용 + 재료 (Phase 추가 작업에서 본격 사용)
 *
 * 4 슬롯 추가는 이 파일 한 곳에 객체 1개 더 넣으면 됨.
 */

import {
  ITEM_LINES, ITEM_RODS, ITEM_REELS, ITEM_BAITS, ITEM_LURES,
} from './items.config.js';

/**
 * @typedef {Object} StatRowDef
 * @property {string} icon       이모지 또는 1글자 마커
 * @property {string} label      한글 라벨
 * @property {string} key        spec 의 필드명 (item[key])
 * @property {(v: any) => string} format  값 표기 함수
 * @property {(v: any) => number | null} [enhanceNext]  강화 후 값 (null = 강화 영향 없음)
 * @property {string} [hint]     하단 작은 힌트 ("낮을수록↑" 등)
 */

/**
 * @typedef {Object} PopupConfig
 * @property {string} slot
 * @property {string} title
 * @property {string} heroIconKey
 * @property {Object} catalog
 * @property {string} equippedKey
 * @property {StatRowDef[]} statRows
 * @property {{ gold: number, materials: { id: string, count: number, name: string }[] }} enhanceCost
 */

// ─── 강화 단계별 +% 증가율 (mock — Phase 추가 작업에서 정식화) ───
//   ★ 4/6 단계라면 다음 단계 (5/6) 의 +값을 미리보기.
const ENHANCE_BONUS = {
  strength:   0.10,   // +10% per step
  power:      0.10,
  drag:       0.05,
  reelSpeed:  0.05,
  stability:  0.05,
  action:     0.05,
  visibility: -0.10,  // 낮을수록 좋음 → -10% (개선)
  durability: 0.50,   // +50% per step
  biteBonus:  0.05,
};

const fmtKg = (v) => `${v} kg`;
const fmtM  = (v) => `${v} m`;
const fmtPct = (v) => `${Math.round(v * 100)} %`;

/** @type {Record<string, PopupConfig>} */
export const POPUP_CONFIGS = {

  // ─── 1번: 낚시줄 (와이어프레임 #1) ───
  line: {
    slot: 'line',
    title: '🧵 낚시줄',
    heroIconKey: 'icon_item_line',   // UI_40 (fallback: panel_slot)
    catalog: ITEM_LINES,
    equippedKey: 'equippedLineId',
    statRows: [
      {
        icon: '⚔',
        label: 'Strength',
        key: 'strength',
        format: fmtKg,
        enhanceNext: (v) => Math.round(v * (1 + ENHANCE_BONUS.strength) * 10) / 10,
      },
      {
        icon: '⇣',
        label: 'Depth',
        key: 'depthLimit',
        format: fmtM,
        enhanceNext: null,
      },
      {
        icon: '👁',
        label: 'Visibility',
        key: 'visibility',
        format: fmtPct,
        enhanceNext: (v) => Math.round(v * (1 + ENHANCE_BONUS.visibility) * 100) / 100,
        hint: '낮을수록 입질↑',
      },
      {
        icon: '↻',
        label: 'Stretch',
        key: 'stretch',
        format: fmtPct,
        enhanceNext: null,
      },
      {
        icon: '❤',
        label: 'Durability',
        key: 'durability',
        format: (v) => (v === Infinity ? '∞' : `${v} / ${v}`),   // mock 현재 = 최대
        enhanceNext: (v) => (v === Infinity ? Infinity
          : Math.round(v * (1 + ENHANCE_BONUS.durability))),
      },
    ],
    enhanceCost: {
      gold: 1500,
      materials: [
        { id: 'item_synth_fiber', count: 3, name: '합성섬유' },
      ],
    },
  },

  // ─── 2번~4번 (구조는 동일, 컨텐츠만 변경 — 다음 단계에서 채움) ───
  bait: {
    slot: 'bait',
    title: '🦐 미끼',
    heroIconKey: 'icon_item_bait',
    catalog: ITEM_BAITS,
    equippedKey: 'equippedBaitId',
    statRows: [
      { icon: '🎯', label: 'Target',     key: 'targetSpecies',
        format: (v) => Array.isArray(v) ? v.slice(0, 2).join('/') + (v.length > 2 ? `+${v.length - 2}` : '')
                       : (v === '__all__' ? '전 어종' : v),
        enhanceNext: null },
      { icon: '✦', label: 'Bite Bonus', key: 'biteBonus',
        format: (v) => `+${Math.round((v || 0) * 100)}%`,
        enhanceNext: (v) => Math.round((v + ENHANCE_BONUS.biteBonus) * 100) / 100 },
      { icon: '⏱', label: 'Duration',   key: 'duration', format: (v) => `${v}s`, enhanceNext: null },
      { icon: '📦', label: 'Stock',      key: 'defaultStock', format: (v) => `${v}`, enhanceNext: null },
    ],
    enhanceCost: { gold: 500, materials: [{ id: 'item_shrimp', count: 2, name: '새우' }] },
  },

  lure: {
    slot: 'lure',
    title: '🎣 루어',
    heroIconKey: 'icon_item_bait',
    catalog: ITEM_LURES,
    equippedKey: 'equippedLureId',
    statRows: [
      { icon: '🎯', label: 'Target',    key: 'targetSpecies',
        format: (v) => Array.isArray(v) ? v.slice(0, 2).join('/') + (v.length > 2 ? `+${v.length - 2}` : '')
                       : (v === '__all__' ? '전 어종' : v === '__random__' ? '랜덤' : v),
        enhanceNext: null },
      { icon: '✦', label: 'Bite Bonus', key: 'biteBonus',
        format: (v) => `+${Math.round((v || 0) * 100)}%`,
        enhanceNext: (v) => Math.round((v + ENHANCE_BONUS.biteBonus) * 100) / 100 },
      { icon: '🐟', label: 'Big Fish',   key: 'bigFishBonus',
        format: (v) => `+${Math.round((v || 0) * 100)}%`,
        enhanceNext: null },
    ],
    enhanceCost: { gold: 1000, materials: [{ id: 'item_gem', count: 1, name: '보석' }] },
  },

  rod: {
    slot: 'rod',
    title: '🎣 낚시대',
    heroIconKey: 'icon_item_rod',
    catalog: ITEM_RODS,
    equippedKey: 'equippedRodId',
    statRows: [
      { icon: '⚔', label: 'Power',      key: 'power',  format: fmtKg,
        enhanceNext: (v) => Math.round(v * (1 + ENHANCE_BONUS.power) * 10) / 10 },
      { icon: '⚡', label: 'Action',     key: 'action', format: (v) => v.toFixed(2),
        enhanceNext: (v) => Math.round(v * (1 + ENHANCE_BONUS.action) * 100) / 100 },
      { icon: '📏', label: 'Length',     key: 'length', format: fmtM, enhanceNext: null },
      { icon: '🛡', label: 'Rigidity',   key: 'rigidity', format: fmtPct, enhanceNext: null },
      { icon: '❤', label: 'Durability', key: 'durability',
        format: (v) => (v === Infinity ? '∞' : `${v} / ${v}`),
        enhanceNext: (v) => (v === Infinity ? Infinity : Math.round(v * (1 + ENHANCE_BONUS.durability))) },
    ],
    enhanceCost: { gold: 2000, materials: [{ id: 'item_enhance_stone', count: 3, name: '강화석' }] },
  },

  reel: {
    slot: 'reel',
    title: '🎰 릴',
    heroIconKey: 'icon_item_reel',
    catalog: ITEM_REELS,
    equippedKey: 'equippedReelId',
    statRows: [
      { icon: '🛑', label: 'Drag',       key: 'drag',      format: fmtPct,
        enhanceNext: (v) => Math.round((v + ENHANCE_BONUS.drag) * 100) / 100 },
      { icon: '⚡', label: 'Speed',      key: 'reelSpeed', format: (v) => `${v}`,
        enhanceNext: (v) => Math.round(v * (1 + ENHANCE_BONUS.reelSpeed)) },
      { icon: '⚖', label: 'Stability',  key: 'stability', format: fmtPct,
        enhanceNext: (v) => Math.round((v + ENHANCE_BONUS.stability) * 100) / 100 },
      { icon: '↻', label: 'Gear Ratio', key: 'gearRatio', format: (v) => `1:${v.toFixed(1)}`,
        enhanceNext: null },
      { icon: '❤', label: 'Durability', key: 'durability',
        format: (v) => (v === Infinity ? '∞' : `${v} / ${v}`),
        enhanceNext: (v) => (v === Infinity ? Infinity : Math.round(v * (1 + ENHANCE_BONUS.durability))) },
    ],
    enhanceCost: { gold: 1800, materials: [{ id: 'item_precision_part', count: 2, name: '정밀부품' }] },
  },
};

/**
 * 슬롯 id 로 config 조회.
 * @param {string} slot
 * @returns {PopupConfig | undefined}
 */
export function getPopupConfig(slot) {
  return POPUP_CONFIGS[slot];
}
