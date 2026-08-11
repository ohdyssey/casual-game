/**
 * 특수기 4종 효과 — 순수 로직. 코스트/쿨다운 검증 후 새 상태를 반환한다.
 *   수치는 전부 이 파일 상단 상수에서 조정(매직넘버 산재 금지).
 *   TODO(디자이너 확인): 효과 수치는 P3 자리표시자 — 밸런싱 미확정.
 */
import { LANE_LENGTH, type AbilityKind, type BattleState, type UnitKind } from './types.js';
import { ABILITY_SPECS, KILL_BOUNTY } from './roster.js';

/** Rally — 모든 적을 위로 밀어내는 거리(좌표 단위). */
export const RALLY_KNOCKBACK = 140;
/** Heal Wave — 아군 전원 기력 회복량. */
export const HEAL_WAVE_AMOUNT = 40;
/** Attack Boost(힘 강화) — 지속시간(ms)과 밀어내기 힘 배수(스크럼·장애물·돌파 피해 공통). */
export const ATTACK_BOOST_DURATION_MS = 6_000;
export const ATTACK_BOOST_MULTIPLIER = 1.6;
/** Sumo Spirit — 전장 전체 적의 기력에 주는 피해. */
export const SUMO_SPIRIT_DAMAGE = 60;

/** 특수기 사용 가능 여부(마나·쿨다운·진행 상태). */
export function canCastAbility(state: BattleState, kind: AbilityKind): boolean {
  const spec = ABILITY_SPECS[kind];
  if (!spec || state.status !== 'playing') return false;
  return state.mana >= spec.cost && state.timeMs >= state.abilityReadyAtMs[kind];
}

/** 특수기 시전 — 불가하면 null. */
export function castAbility(state: BattleState, kind: AbilityKind): BattleState | null {
  if (!canCastAbility(state, kind)) return null;
  const spec = ABILITY_SPECS[kind];

  const base: BattleState = {
    ...state,
    mana: state.mana - spec.cost,
    abilityReadyAtMs: { ...state.abilityReadyAtMs, [kind]: state.timeMs + spec.cooldownMs },
  };

  switch (kind) {
    case 'rally':
      // 집결 — 아군의 함성으로 적 전열을 위로 밀어낸다.
      return {
        ...base,
        combatants: base.combatants.map((c) =>
          c.side === 'enemy' ? { ...c, pos: Math.min(LANE_LENGTH, c.pos + RALLY_KNOCKBACK) } : c,
        ),
      };
    case 'healWave':
      // 치유의 물결 — 아군 전원 회복.
      return {
        ...base,
        combatants: base.combatants.map((c) =>
          c.side === 'ally' ? { ...c, hp: Math.min(c.maxHp, c.hp + HEAL_WAVE_AMOUNT) } : c,
        ),
      };
    case 'attackBoost':
      // 힘 강화 — 일정 시간 아군 밀어내기 힘 배수(battle.tick 이 소비).
      return { ...base, attackBoostUntilMs: state.timeMs + ATTACK_BOOST_DURATION_MS };
    case 'sumoSpirit': {
      // 스모의 혼 — 전장 전체 피해. 처치 바운티는 즉시 마나로.
      let bounty = 0;
      const combatants = base.combatants.flatMap((c) => {
        if (c.side !== 'enemy') return [c];
        const hp = c.hp - SUMO_SPIRIT_DAMAGE;
        if (hp <= 0) {
          bounty += KILL_BOUNTY[c.specId as UnitKind] ?? 1;
          return [];
        }
        return [{ ...c, hp }];
      });
      return { ...base, combatants, mana: Math.min(base.manaMax, base.mana + bounty) };
    }
  }
}
