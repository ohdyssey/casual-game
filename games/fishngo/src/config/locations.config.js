/**
 * Location Manifest — 낚시터별 lazy-load 매니페스트 (per-location 자산 매핑).
 *
 * 이 파일이 "낚시터 → 자산" 매핑의 single source of truth 다.
 *   - bgKey / bgPath  : Phaser 텍스처 키 + 파일 경로 (LocationLoaderScene 가 lazy load).
 *   - fishSpecies     : 해당 낚시터에 등장할 어종 id 배열 (FISH_SPECIES.id 와 1:1).
 *                       FishSpawner 가 location-allowed 필터로 사용.
 *
 * Note:
 *   - 어종 id 'shark' 는 sprite_whiteshark 시트를 사용 (내부 id=shark, sprite=whiteshark).
 *   - blue_tang + blue_damselfish 는 sprite_bluetang 시트를 공유 (단일 시트 비용).
 *   - LOCATIONS (assets.config.js) 의 id / name / bgKey 와 1:1 대응.
 */

/**
 * @typedef {Object} LocationManifest
 * @property {string}   id            낚시터 식별자 (HomeScene 캐러셀 / FishingScene 진입 시 사용)
 * @property {string}   name          한글 이름
 * @property {string}   bgKey         Phaser 텍스처 키
 * @property {string}   bgPath        public/ 기준 상대 경로 (vite base './')
 * @property {string[]} fishSpecies   해당 낚시터 등장 어종 id 목록 (FISH_SPECIES.id)
 */

// ─── LOCATIONS_MANIFEST 자동 derive (LOCATIONS = single source of truth) ───
//   assets.config.js 의 v2 스테이지 매핑을 그대로 사용.
//   기본 fishSpecies 는 빈 배열 → FishSpawner 가 전 19종 fallback.
//   특정 스테이지에 어종 한정이 필요하면 _MANIFEST_OVERRIDES 에 추가.
import { LOCATIONS as _LOCATIONS_V2 } from './assets.config.js';

const _MANIFEST_OVERRIDES = {
  // 스테이지 14 (= 일본 홋카이도 냉수 해역, 기존 glacier ID 사용 안 함):
  //   사용자 요청 별도 매핑이 있으면 여기에 추가.
};

/**
 * @type {Object.<string, LocationManifest>}
 */
export const LOCATIONS_MANIFEST = {};
for (const loc of _LOCATIONS_V2) {
  LOCATIONS_MANIFEST[loc.id] = {
    id: loc.id,
    name: loc.name,
    bgKey: loc.bgKey,
    bgPath: loc.bgPath,
    fishSpecies: _MANIFEST_OVERRIDES[loc.id]?.fishSpecies || [],
  };
}

/**
 * 낚시터 매니페스트 조회 — 알 수 없는 id 면 undefined 반환.
 *   호출 측에서 fallback 처리 (보통 beach 로 fallback).
 *
 * @param {string} id 낚시터 id
 * @returns {LocationManifest | undefined}
 */
export function getLocationManifest(id) {
  if (!id) return undefined;
  return LOCATIONS_MANIFEST[id];
}
