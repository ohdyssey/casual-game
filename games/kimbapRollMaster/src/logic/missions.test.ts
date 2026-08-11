import { describe, expect, it } from 'vitest';
import {
  MISSION_COUNT,
  allMissionsDone,
  applyServe,
  missionColumn,
  missionsForLevel,
  missionLabel,
  missionProgressText,
  rollMissions,
  startMissions,
  type Mission,
  type MissionState,
  type ServeEvent,
} from './missions.js';
import { MENU_IDS } from './menu.js';
import { stageMenus } from './stageTray.js';
import { stageOrders } from './stage.js';

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const serve = (over: Partial<ServeEvent> = {}): ServeEvent => ({
  menu: 'tuna',
  stars: 3,
  failed: false,
  revenue: 10,
  perfectCombo: 1,
  rolls: 1,
  rollsDone: 1,
  rush: false,
  seasonedBoth: true,
  ...over,
});

const only = (mission: Mission): MissionState => startMissions([mission]);

describe('미션 뽑기', () => {
  it('판마다 세 가지가, 서로 다른 종류로 걸린다', () => {
    const rand = seeded(11);
    for (let stage = 0; stage < 12; stage++) {
      const list = rollMissions(stage, stageMenus(stage), stageOrders(stage), rand);
      expect(list).toHaveLength(MISSION_COUNT);
      expect(new Set(list.map((m) => m.kind)).size).toBe(MISSION_COUNT);
      for (const m of list) {
        expect(m.goal).toBeGreaterThan(0);
        expect(m.reward).toBeGreaterThan(0);
      }
    }
  });

  it('⚠️⚠️ 종류마다 **자리가 고정**이다 — 미션이 판마다 칸을 옮겨 다니면 매번 다시 읽어야 한다', () => {
    const rand = seeded(101);
    for (let stage = 0; stage < 30; stage++) {
      const list = rollMissions(stage, stageMenus(stage), stageOrders(stage), rand);
      // 결과 순서가 곧 화면 순서다 — i번째 미션은 i번 칸의 것이어야 한다.
      list.forEach((m, i) => expect(missionColumn(m.kind), `${stage}판 ${i}칸 ${m.kind}`).toBe(i));
    }
  });

  it('0칸은 언제나 「무슨 김밥」이다 — 왼쪽에 눈이 갈 곳이 정해진다', () => {
    const rand = seeded(103);
    for (let stage = 0; stage < 30; stage++) {
      const list = rollMissions(stage, stageMenus(stage), stageOrders(stage), rand);
      expect(list[0]?.kind).toBe('menu');
    }
  });

  it('⚠️⚠️ 첫 판에는 **뽑기에 기대는 미션이 안 나온다** — 배우기도 전에 못 깨는 목표가 된다', () => {
    const rand = seeded(23);
    for (let i = 0; i < 200; i++) {
      const kinds = rollMissions(0, stageMenus(0), stageOrders(0), rand).map((m) => m.kind);
      expect(kinds).not.toContain('rush');
      expect(kinds).not.toContain('rolls');
      expect(kinds).not.toContain('combo');
    }
  });

  it('⚠️⚠️ 메뉴 미션은 **그 판에 실제로 나오는 김밥**에서만 뽑는다 — 아니면 영영 못 깬다', () => {
    const rand = seeded(37);
    for (let stage = 0; stage < 14; stage++) {
      const menus = stageMenus(stage);
      for (let i = 0; i < 40; i++) {
        for (const m of rollMissions(stage, menus, stageOrders(stage), rand)) {
          if (m.kind !== 'menu') continue;
          expect(m.menu).toBeDefined();
          expect(menus).toContain(m.menu!);
          // 야채는 어느 판에나 있고 제일 싸서 「야채만 계속」이 정답이 되어 버린다.
          expect(m.menu).not.toBe('veggie');
        }
      }
    }
  });

  it('뽑기에 기대는 미션은 목표치가 낮다 — 급행은 10%, 여러 줄은 20% 확률이다', () => {
    const rand = seeded(53);
    for (let stage = 4; stage < 20; stage++) {
      for (let i = 0; i < 40; i++) {
        for (const m of rollMissions(stage, stageMenus(stage), stageOrders(stage), rand)) {
          if (m.kind === 'rush' || m.kind === 'rolls') expect(m.goal).toBeLessThanOrEqual(2);
        }
      }
    }
  });
});

describe('미션 채우기', () => {
  it('지정한 김밥을 낼 때만 오른다', () => {
    const state = only({ kind: 'menu', goal: 2, menu: 'tuna', reward: 8 });
    const a = applyServe(state, serve({ menu: 'spam' }));
    expect(a.state.progress[0]).toBe(0);
    const b = applyServe(a.state, serve({ menu: 'tuna' }));
    expect(b.state.progress[0]).toBe(1);
    expect(b.completed).toEqual([]);
    const c = applyServe(b.state, serve({ menu: 'tuna' }));
    expect(c.completed).toEqual([0]);
    expect(c.reward).toBe(8);
    expect(allMissionsDone(c.state)).toBe(true);
  });

  it('⚠️ 실패한 주문은 아무것도 채우지 않는다', () => {
    const state = only({ kind: 'perfect', goal: 1, reward: 5 });
    const out = applyServe(state, serve({ failed: true, stars: 0 }));
    expect(out.state.progress[0]).toBe(0);
  });

  it('⚠️⚠️ 손해 본 주문이 매출 진행을 **깎지는 않는다** — 게이지가 뒤로 가면 미션이 벌이 된다', () => {
    const state = only({ kind: 'revenue', goal: 30, reward: 6 });
    const a = applyServe(state, serve({ revenue: 20 }));
    expect(a.state.progress[0]).toBe(20);
    const b = applyServe(a.state, serve({ revenue: -9 }));
    expect(b.state.progress[0]).toBe(20);
  });

  it('연속 미션은 **최고 기록**이다 — 끊겼다 다시 쌓아도 그전 것이 남는다', () => {
    const state = only({ kind: 'combo', goal: 3, reward: 20 });
    const a = applyServe(state, serve({ perfectCombo: 2 }));
    expect(a.state.progress[0]).toBe(2);
    const b = applyServe(a.state, serve({ perfectCombo: 0, stars: 1 }));
    expect(b.state.progress[0]).toBe(2); // 끊겨도 안 깎인다
    const c = applyServe(b.state, serve({ perfectCombo: 3 }));
    expect(c.completed).toEqual([0]);
  });

  it('여러 줄 미션은 **다 채워 낸** 주문만 센다', () => {
    const state = only({ kind: 'rolls', goal: 1, reward: 9 });
    const partial = applyServe(state, serve({ rolls: 3, rollsDone: 2 }));
    expect(partial.state.progress[0]).toBe(0);
    const full = applyServe(state, serve({ rolls: 2, rollsDone: 2 }));
    expect(full.completed).toEqual([0]);
  });

  it('마무리 미션은 참기름·깨소금을 **둘 다** 쳐야 오른다', () => {
    const state = only({ kind: 'seasoned', goal: 1, reward: 4 });
    expect(applyServe(state, serve({ seasonedBoth: false })).state.progress[0]).toBe(0);
    expect(applyServe(state, serve({ seasonedBoth: true })).completed).toEqual([0]);
  });

  it('⚠️ 다 채운 미션은 더 오르지도, 보상을 두 번 주지도 않는다', () => {
    const state = only({ kind: 'menu', goal: 1, menu: 'tuna', reward: 8 });
    const first = applyServe(state, serve({ menu: 'tuna' }));
    expect(first.reward).toBe(8);
    const again = applyServe(first.state, serve({ menu: 'tuna' }));
    expect(again.completed).toEqual([]);
    expect(again.reward).toBe(0);
    expect(again.state.progress[0]).toBe(1);
  });

  it('한 주문이 여러 미션을 동시에 완수할 수 있다', () => {
    const state = startMissions([
      { kind: 'menu', goal: 1, menu: 'tuna', reward: 8 },
      { kind: 'perfect', goal: 1, reward: 5 },
    ]);
    const out = applyServe(state, serve({ menu: 'tuna', stars: 3 }));
    expect(out.completed).toEqual([0, 1]);
    expect(out.reward).toBe(13);
    expect(allMissionsDone(out.state)).toBe(true);
  });
});

describe('표기', () => {
  it('⚠️ 세 칸이 가로 한 줄에 서므로 이름이 짧다', () => {
    const rand = seeded(71);
    for (let stage = 0; stage < 10; stage++) {
      for (const m of rollMissions(stage, stageMenus(stage), stageOrders(stage), rand)) {
        expect(missionLabel(m).length).toBeLessThanOrEqual(7);
      }
    }
  });

  it('매출만 달러로 적는다', () => {
    expect(missionProgressText({ kind: 'revenue', goal: 40, reward: 8 }, 12)).toBe('$12 / $40');
    expect(missionProgressText({ kind: 'perfect', goal: 3, reward: 8 }, 1)).toBe('1 / 3');
    // 목표를 넘겨도 표기는 목표에서 멈춘다.
    expect(missionProgressText({ kind: 'perfect', goal: 3, reward: 8 }, 9)).toBe('3 / 3');
  });

  it('메뉴 이름은 16종 어느 것이든 짧게 나온다', () => {
    for (const menu of MENU_IDS) {
      const label = missionLabel({ kind: 'menu', goal: 1, menu, reward: 1 });
      expect(label).not.toContain('김밥');
      expect(label.length).toBeGreaterThan(0);
    }
  });
});


describe('레벨 미션 — 판마다 바뀌지 않는다', () => {
  it('⚠️⚠️ **같은 레벨은 언제나 같은 미션**이다 — 목표가 매번 갈리면 그건 목표가 아니라 날씨다', () => {
    for (let level = 0; level < 100; level++) {
      const a = missionsForLevel(level, stageMenus(level), stageOrders(level));
      const b = missionsForLevel(level, stageMenus(level), stageOrders(level));
      expect(b, `${level}레벨`).toEqual(a);
    }
  });

  it('레벨이 오르면 미션이 갈린다 — 100레벨을 훑어 한 종류로 굳지 않는다', () => {
    const seen = new Set<string>();
    for (let level = 0; level < 100; level++) {
      const list = missionsForLevel(level, stageMenus(level), stageOrders(level));
      seen.add(list.map((m) => `${m.kind}:${m.menu ?? ''}:${m.goal}`).join('|'));
    }
    expect(seen.size).toBeGreaterThan(20);
  });

  it('⚠️ 난이도가 레벨을 따라 **조금씩** 오른다 — 다만 상한을 넘지 않는다', () => {
    const goalOf = (level: number, kind: string): number =>
      missionsForLevel(level, stageMenus(level), stageOrders(level)).find((m) => m.kind === kind)?.goal ?? 0;
    // 0칸은 언제나 메뉴다 — 그 목표치로 곡선을 본다.
    const early = goalOf(0, 'menu');
    const late = goalOf(60, 'menu');
    expect(late).toBeGreaterThanOrEqual(early);
    // 상한(4)을 넘지 않는다 — 미션이 클리어 조건이라 못 깨는 목표가 되면 게임이 막힌다.
    for (let level = 0; level < 100; level++) expect(goalOf(level, 'menu')).toBeLessThanOrEqual(4);
  });

  it('⚠️⚠️ 뽑기에 막히는 미션(급행·여러 줄)은 **안 나온다** — 클리어 조건이라 못 깨면 갇힌다', () => {
    for (let level = 0; level < 100; level++) {
      const kinds = missionsForLevel(level, stageMenus(level), stageOrders(level)).map((m) => m.kind);
      expect(kinds, `${level}레벨`).not.toContain('rush');
      expect(kinds, `${level}레벨`).not.toContain('rolls');
    }
  });

  it('100레벨 어디서도 세 칸이 다 서고, 메뉴는 그 판에 나오는 것이다', () => {
    for (let level = 0; level < 100; level++) {
      const list = missionsForLevel(level, stageMenus(level), stageOrders(level));
      expect(list, `${level}레벨`).toHaveLength(MISSION_COUNT);
      list.forEach((m, i) => expect(missionColumn(m.kind)).toBe(i));
      const menu = list[0];
      expect(menu?.kind).toBe('menu');
      expect(stageMenus(level)).toContain(menu!.menu!);
      expect(menu!.menu).not.toBe('veggie');
    }
  });
});
