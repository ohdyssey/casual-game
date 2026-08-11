/** gameRegistry 단위 테스트 — 슬러그 정규화·존재 판정(카탈로그 games.config 실데이터 기준). */
import { describe, expect, it } from 'vitest';
import { DEFAULT_HERO_GAME_ID, hasGame, resolveGameId } from './gameRegistry.js';

describe('gameRegistry', () => {
  it('내부 id 는 그대로 통과한다', () => {
    expect(resolveGameId('tictactoe')).toBe('tictactoe');
    expect(resolveGameId('solitaire')).toBe('solitaire');
  });

  it('캠페인 별칭 슬러그를 내부 id 로 정규화한다', () => {
    expect(resolveGameId('tictactoe_neon')).toBe('tictactoe');
    expect(resolveGameId('homerun_pop')).toBe('homerunpop');
    expect(resolveGameId('archery_stars')).toBe('archerystars');
  });

  it('모르는 슬러그는 null', () => {
    expect(resolveGameId('no_such_game')).toBeNull();
    expect(hasGame('no_such_game')).toBe(false);
  });

  it('live 게임만 진입 가능으로 판정한다', () => {
    expect(hasGame('tictactoe')).toBe(true);
    // pickmeup 은 카탈로그에 있지만 준비중(live=false) — 딥링크로도 진입 불가.
    expect(resolveGameId('pickmeup')).toBe('pickmeup');
    expect(hasGame('pickmeup')).toBe(false);
  });

  it('기본 히어로 게임은 카탈로그에 존재하고 live 다', () => {
    expect(hasGame(DEFAULT_HERO_GAME_ID)).toBe(true);
  });
});
