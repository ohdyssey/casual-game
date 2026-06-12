/**
 * 로스터 — 유닛/적/특수기 정적 스펙 테이블과 1스테이지 샘플 정의.
 *   밸런싱은 전부 여기서 조정한다(매직넘버 코드 산재 금지). 값은 P0 자리표시자.
 */
import {
  type AbilityKind,
  type AbilitySpec,
  type EnemySpec,
  type StageDef,
  type UnitKind,
  type UnitSpec,
} from './types.js';

/** 아군 유닛 4종 — 참조 이미지 카드(코스트 일치). */
export const UNIT_SPECS: Readonly<Record<UnitKind, UnitSpec>> = {
  pusher: { kind: 'pusher', name: '밀치기', cost: 2, maxHp: 120, attack: 18, attackMs: 700, range: 90, speed: 0, art: 'unit_pusher' },
  tank: { kind: 'tank', name: '벽', cost: 3, maxHp: 320, attack: 10, attackMs: 1000, range: 70, speed: 0, art: 'unit_tank' },
  sprinter: { kind: 'sprinter', name: '돌격', cost: 2, maxHp: 90, attack: 22, attackMs: 600, range: 80, speed: 60, art: 'unit_sprinter' },
  healer: { kind: 'healer', name: '치유', cost: 3, maxHp: 100, attack: 0, attackMs: 1200, range: 140, speed: 0, heal: 24, art: 'unit_healer' },
};

/** 적(스모) 종류. */
export const ENEMY_SPECS: Readonly<Record<string, EnemySpec>> = {
  rikishi: { id: 'rikishi', name: '하급 역사', maxHp: 110, attack: 14, attackMs: 800, speed: 28, art: 'enemy_rikishi', bounty: 1 },
  ozeki: { id: 'ozeki', name: '오제키', maxHp: 260, attack: 20, attackMs: 900, speed: 20, art: 'enemy_ozeki', bounty: 2 },
  yokozuna: { id: 'yokozuna', name: '요코즈나', maxHp: 520, attack: 32, attackMs: 1000, speed: 16, art: 'enemy_yokozuna', bounty: 4 },
};

/** 특수기 4종 — 참조 이미지 하단 버튼(코스트 일치). */
export const ABILITY_SPECS: Readonly<Record<AbilityKind, AbilitySpec>> = {
  rally: { kind: 'rally', name: '집결', cost: 3, cooldownMs: 12000 },
  healWave: { kind: 'healWave', name: '치유의 물결', cost: 4, cooldownMs: 15000 },
  attackBoost: { kind: 'attackBoost', name: '공격 강화', cost: 3, cooldownMs: 14000 },
  sumoSpirit: { kind: 'sumoSpirit', name: '스모의 혼', cost: 5, cooldownMs: 25000 },
};

/** 카드 UI 순서(좌측 덱). */
export const DECK_ORDER: ReadonlyArray<UnitKind> = ['pusher', 'tank', 'sprinter', 'healer'];

/** 특수기 버튼 순서(하단 바). */
export const ABILITY_ORDER: ReadonlyArray<AbilityKind> = ['rally', 'healWave', 'attackBoost', 'sumoSpirit'];

/** 샘플 스테이지 — 3웨이브. 실제 밸런싱은 추후 levels 모듈로 확장. */
export const STAGE_1: StageDef = {
  id: 'stage_1',
  name: '도장 입구',
  allyBaseHp: 100,
  enemyBaseHp: 100,
  manaRegenPerSec: 1,
  startMana: 6,
  waves: [
    {
      index: 0,
      spawns: [
        { atMs: 1000, lane: 2, enemyId: 'rikishi' },
        { atMs: 3500, lane: 0, enemyId: 'rikishi' },
        { atMs: 5000, lane: 4, enemyId: 'rikishi' },
      ],
    },
    {
      index: 1,
      spawns: [
        { atMs: 9000, lane: 1, enemyId: 'rikishi' },
        { atMs: 10000, lane: 3, enemyId: 'rikishi' },
        { atMs: 12000, lane: 2, enemyId: 'ozeki' },
      ],
    },
    {
      index: 2,
      spawns: [
        { atMs: 16000, lane: 0, enemyId: 'ozeki' },
        { atMs: 17000, lane: 4, enemyId: 'ozeki' },
        { atMs: 20000, lane: 2, enemyId: 'yokozuna' },
      ],
    },
  ],
};
