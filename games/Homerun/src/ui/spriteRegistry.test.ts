/**
 * 타자 캐릭터 프리셋 + 클립 구간 자르기 테스트.
 *
 * 여성 타자는 에디터에 "여성 타격1" 문서 하나뿐이라 준비/후 동작을 같은 클립의 앞/뒤 구간
 * 반복으로 대체한다(사용자 요청: "준비동작과 타격후 동작이 없으면 앞부분을 반복하거나 뒷부분을
 * 반복하는 식으로 없는 동영상을 대체하세요"). 그 파생이 원본을 훼손하지 않고 프레임 구간·길이·
 * 반복을 정확히 잡는지, 그리고 프리셋 해석이 남성/여성을 제대로 갈라내는지 검증한다.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  activeBatterAnchor,
  activeBatterReadySlow,
  activeBatterSwing,
  batterMotionFilesFor,
  bootBatterPresetKeys,
  deferredBatterPresetKeys,
  getBatterPreset,
  setBatterPreset,
  BATTER_PRESETS,
  BOOT_BATTER_PRELOAD_COUNT,
  DEFAULT_BATTER_PRESET,
  isDerivedMotion,
  isPitcherNode,
  resolveBatterMotions,
  resolveBatterMotionsFor,
  resolveCharacterMotions,
  resolvePlayNodeMotions,
  sliceSpriteDoc,
  type BatterPresetKey,
  type SpriteIndex,
  DEFAULT_BATTER_PLACEMENT,
  hasBatterNode,
} from './spriteRegistry.js';

// 선택된 타자는 모듈 전역 상태라 테스트 간에 새어 나간다 — 매 테스트 전에 기본값으로 되돌린다.
beforeEach(() => setBatterPreset(DEFAULT_BATTER_PRESET));

/** 실제 main.json/_index.json 과 같은 형태의 최소 레지스트리. */
const INDEX: SpriteIndex = {
  docs: [
    // 타자1 "타격1"(2026-08-04 저작, 31프레임) — 남성 프리셋의 유일한 문서.
    // 이전 3문서(char 준비/후 + `1` 폴더 스윙)는 에디터에서 삭제됐다.
    { id: '1_1_msee37tytdre', name: '타격1', file: 'ui/sprites/1/bat1.json', characterId: '1' },
    { id: 'char_msancr2rw0p1_2_msd4ft1zy0ns', name: '여성타격2', file: 'ui/sprites/f/bat.json', characterId: 'char_msancr2rw0p1' },
    { id: 'p_ready', name: '투수_준비동작', file: 'ui/sprites/p/ready.json', characterId: 'p' },
    { id: 'p_action', name: '투수_투구동작', file: 'ui/sprites/p/throw.json', characterId: 'p' },
    { id: 'p_after', name: '투수_투구후 동작', file: 'ui/sprites/p/after.json', characterId: 'p' },
  ],
  characters: [
    { id: '1', name: '타자1' },
    { id: 'char', name: '타자1' },
    { id: 'char_msancr2rw0p1', name: '여성 타격' },
    { id: 'p', name: '투수1' },
  ],
};

/** 여성타격2 문서와 같은 형태 — 41프레임 단일 클립(2026-08-03 저작본, 3417ms @12fps). */
const FEMALE_CLIP_FRAMES = 41;
const FEMALE_CLIP_MS = 3417;

function femaleDoc() {
  return {
    id: 'char_msancr2rw0p1_2_msd4ft1zy0ns',
    source: { textureKey: 'tex', path: 'ui/sprites/sheets/f.png' },
    clips: [
      {
        id: 'main',
        length: FEMALE_CLIP_MS,
        loop: 'loop',
        timeScale: 1, // 실제 문서와 같은 형태 — 감속(slow)은 이 값을 나눠 넣는다.

        frameTracks: [
          { partId: 'main', frames: Array.from({ length: FEMALE_CLIP_FRAMES }, (_, i) => i), fps: 12, loop: 'loop' },
        ],
      },
    ],
  };
}

describe('sliceSpriteDoc', () => {
  it('head 는 앞 n프레임만 남긴다', () => {
    const out = sliceSpriteDoc(femaleDoc(), 'head', 10);
    expect(out.clips![0].frameTracks![0].frames).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('tail 은 뒤 n프레임만 남긴다', () => {
    expect(sliceSpriteDoc(femaleDoc(), 'tail', 1).clips![0].frameTracks![0].frames).toEqual([40]);
    expect(sliceSpriteDoc(femaleDoc(), 'tail', 3).clips![0].frameTracks![0].frames).toEqual([38, 39, 40]);
  });

  it('length 를 프레임 비율로 줄여 원본 재생 속도(fps)를 유지한다', () => {
    // 41프레임 3417ms → 10프레임이면 3417*10/41 = 833ms, 1프레임이면 83ms(원본 12fps 유지).
    expect(sliceSpriteDoc(femaleDoc(), 'head', 10).clips![0].length).toBe(833);
    expect(sliceSpriteDoc(femaleDoc(), 'tail', 1).clips![0].length).toBe(83);
  });

  it('slow 배수만큼 timeScale 을 낮춰 같은 구간을 느리게 돌린다', () => {
    // 벤더 ClipPlayer 는 elapsed += dt × timeScale — 클립 길이와 프레임 트랙이 함께 느려진다.
    expect(sliceSpriteDoc(femaleDoc(), 'head', 10, 3).clips![0].timeScale).toBeCloseTo(1 / 3, 6);
    expect(sliceSpriteDoc(femaleDoc(), 'tail', 5, 2).clips![0].timeScale).toBe(0.5);
  });

  it('slow 를 안 주면 원본 속도 그대로다', () => {
    expect(sliceSpriteDoc(femaleDoc(), 'head', 10).clips![0].timeScale).toBe(1);
  });

  it('구간을 안 자르는 경우(요청 프레임 ≥ 원본)에도 감속은 적용된다', () => {
    expect(sliceSpriteDoc(femaleDoc(), 'head', 999, 3).clips![0].timeScale).toBeCloseTo(1 / 3, 6);
  });

  it('파생 클립은 대기 동작이므로 반복 재생으로 바꾼다', () => {
    const out = sliceSpriteDoc(femaleDoc(), 'tail', 1);
    expect(out.clips![0].loop).toBe('loop');
    expect(out.clips![0].frameTracks![0].loop).toBe('loop');
  });

  it('원본 문서를 변형하지 않는다(불변)', () => {
    const doc = femaleDoc();
    sliceSpriteDoc(doc, 'head', 4);
    expect(doc.clips[0].frameTracks[0].frames).toHaveLength(FEMALE_CLIP_FRAMES);
    expect(doc.clips[0].length).toBe(FEMALE_CLIP_MS);
  });

  it('시트·앵커 정보(source)는 그대로 둔다 — 원본과 픽셀 정렬이 유지돼야 동작 전환 시 안 튄다', () => {
    const out = sliceSpriteDoc(femaleDoc(), 'head', 10);
    expect(out.source).toEqual(femaleDoc().source);
  });

  it('요청 프레임 수가 원본 이상이면 프레임을 그대로 둔다', () => {
    const out = sliceSpriteDoc(femaleDoc(), 'head', 999);
    expect(out.clips![0].frameTracks![0].frames).toHaveLength(FEMALE_CLIP_FRAMES);
  });

  it('클립이 없거나 frames<=0 이면 원본을 그대로 반환한다(방어)', () => {
    expect(sliceSpriteDoc({ clips: [] }, 'head', 4)).toEqual({ clips: [] });
    expect(sliceSpriteDoc(femaleDoc(), 'head', 0).clips![0].frameTracks![0].frames).toHaveLength(FEMALE_CLIP_FRAMES);
  });
});

describe('resolveBatterMotions', () => {
  const node = { characterId: '1', spriteDocFile: 'ui/sprites/f/bat.json' };

  it('기본 타자는 남성이다 — 로비 기본 선택(LobbyScene.DEFAULT_LOBBY_CHARACTER)과 같아야 한다', () => {
    // 사용자 요청: "남성 캐릭터를 기본 캐릭터로 선택되어 있도록". 로비를 건너뛴 경로에도 같은 값이 쓰인다.
    expect(DEFAULT_BATTER_PRESET).toBe('male');
    expect(getBatterPreset()).toBe('male');
  });

  it('남성 프리셋: 준비는 앞 7프레임, 타격 후는 뒤 9프레임 파생(사용자 지정 구간)', () => {
    // 사용자 지정: "프레임 1~7 프레임은 타격전 동작 22~30프레임은 타격후 동작" (31프레임 클립).
    // 세 동작이 **같은 문서**에서 나와야 스윙 때 다른 캐릭터가 튀어나오지 않는다.
    const m = resolveBatterMotionsFor(INDEX, node, 'male');
    expect(m.action).toBe('ui/sprites/1/bat1.json');
    expect(m.ready).toEqual({ from: 'ui/sprites/1/bat1.json', part: 'head', frames: 7, slow: 6 });
    expect(m.after).toEqual({ from: 'ui/sprites/1/bat1.json', part: 'tail', frames: 9, slow: 3 });
  });

  it('두 캐릭터 모두 3동작이 한 문서에서 나온다 — 스윙 때 캐릭터가 바뀌지 않는다', () => {
    // 회귀 방어(2026-08-04 사용자 보고: "타격시 다른 캐릭터가 스윙시 보입니다").
    for (const key of Object.keys(BATTER_PRESETS) as BatterPresetKey[]) {
      const m = resolveBatterMotionsFor(INDEX, node, key);
      for (const spec of [m.ready, m.after]) {
        expect(isDerivedMotion(spec)).toBe(true);
        if (isDerivedMotion(spec)) expect(spec.from).toBe(m.action);
      }
    }
  });

  it('여성 프리셋: 준비는 앞 10프레임, 타격 후는 뒤 5프레임 파생(사용자 요청)', () => {
    // "타격전 애니메이션은 1~10프레임을 느리게 반복재생"(f0~f9) ·
    // "타격후 프레임은 f36~40을 느리게 반복재생"(= 41프레임 클립의 뒤 5프레임)
    const m = resolveBatterMotionsFor(INDEX, node, 'female');
    expect(m.action).toBe('ui/sprites/f/bat.json');
    expect(m.ready).toEqual({ from: 'ui/sprites/f/bat.json', part: 'head', frames: 10, slow: 6 });
    expect(m.after).toEqual({ from: 'ui/sprites/f/bat.json', part: 'tail', frames: 5, slow: 3 });
  });

  it('준비 루프가 타격 후 루프보다 더 느리다(사용자 요청: 타격전만 다시 절반으로)', () => {
    const m = resolveBatterMotionsFor(INDEX, node, 'female');
    if (isDerivedMotion(m.ready) && isDerivedMotion(m.after)) {
      expect(m.ready.slow ?? 1).toBe((m.after.slow ?? 1) * 2);
    }
  });

  it('준비·타격 후 루프는 원본보다 느리게 돈다(감속 배수 > 1)', () => {
    const m = resolveBatterMotionsFor(INDEX, node, 'female');
    for (const spec of [m.ready, m.after]) {
      expect(isDerivedMotion(spec)).toBe(true);
      if (isDerivedMotion(spec)) expect(spec.slow ?? 1).toBeGreaterThan(1);
    }
  });

  it('파생 동작은 원본 액션과 같은 문서를 가리킨다(시트 공유 → 추가 다운로드 없음)', () => {
    const m = resolveBatterMotionsFor(INDEX, node, 'female');
    for (const spec of [m.ready, m.after]) {
      expect(isDerivedMotion(spec)).toBe(true);
      if (isDerivedMotion(spec)) expect(spec.from).toBe(m.action);
    }
  });

  it('선택한 캐릭터가 해석 결과에 반영된다(로비 선택 → 플레이 화면)', () => {
    setBatterPreset('female');
    expect(isDerivedMotion(resolveBatterMotions(INDEX, node).ready)).toBe(true);
    setBatterPreset('male');
    expect(isDerivedMotion(resolveBatterMotions(INDEX, node).ready)).toBe(true);
  });

  it('알 수 없는 키는 무시한다 — 선택이 조용히 깨지지 않게', () => {
    setBatterPreset('male');
    setBatterPreset('nobody');
    expect(getBatterPreset()).toBe('male');
  });

  it('남성 타자 프리셋 = 타자1 "타격1" 한 문서에서 파생(사용자 지정 구간)', () => {
    expect(BATTER_PRESETS.male).toEqual({
      action: '1_1_msee37tytdre',
      readyFromAction: { part: 'head', frames: 7, slow: 6 }, // 타격전 1~7프레임
      afterFromAction: { part: 'tail', frames: 9, slow: 3 }, // 타격후 22~30프레임
      swing: { frames: 31, startFrame: 7, contactFrame: 10 }, // f10 = 배트 전방 최대 신장(시트 실측)
    });
  });

  it('프리셋 문서가 레지스트리에 없으면 이름 기반 해석으로 폴백한다', () => {
    const empty: SpriteIndex = { docs: [], characters: [] };
    const m = resolveBatterMotions(empty, node);
    expect(m.action).toBe('ui/sprites/f/bat.json'); // 노드가 직접 가리키는 문서
  });
});

/**
 * 프리셋 안에서 "준비 구간 / 컨택 프레임 / 팔로스루 구간"이 서로 모순되지 않는지 지킨다.
 * 이 세 값은 같은 클립 하나를 세 조각으로 나눈 것이라 따로 고치면 조용히 어긋난다 — 실제로
 * 타자 교체 시 컨택 프레임만 남성 것으로 남아 스윙이 통째로 밀렸던 적이 있다(2026-08-02).
 */
describe('타자 프리셋 정합성', () => {
  // 활성 프리셋만 보면 다른 캐릭터가 깨진 걸 못 잡는다 — 고를 수 있는 캐릭터를 전부 검사한다.
  const presets = Object.entries(BATTER_PRESETS) as Array<[string, (typeof BATTER_PRESETS)[BatterPresetKey]]>;

  it.each(presets)('%s: 컨택 프레임이 클립 범위 안에 있다', (_key, preset) => {
    expect(preset.swing.contactFrame).toBeGreaterThan(0);
    expect(preset.swing.contactFrame).toBeLessThan(preset.swing.frames);
  });

  it.each(presets)('%s: 스윙 시작은 컨택보다 앞이고, 뒤에 팔로스루가 남는다', (_key, preset) => {
    expect(preset.swing.startFrame).toBeLessThan(preset.swing.contactFrame);
    expect(preset.swing.frames - 1).toBeGreaterThan(preset.swing.contactFrame);
  });

  it.each(presets)('%s: 준비 구간과 스윙 시작 프레임이 맞물린다', (_key, preset) => {
    // 되감으면 targetMs 대부분을 대기 자세에 써서 스윙이 스킵된 것처럼 보인다(사용자 보고).
    const ready = preset.readyFromAction;
    if (!ready) return; // 별도 준비 문서를 쓰는 구성(②)은 해당 없음
    expect(ready.frames).toBeLessThanOrEqual(preset.swing.contactFrame);
    expect(preset.swing.startFrame).toBe(ready.frames);
  });

  it.each(presets)('%s: 타격 후 루프는 컨택 뒤 구간에서만 뽑는다', (_key, preset) => {
    // 뒤 n프레임이 컨택보다 앞까지 걸치면 "타격 후"에 스윙 도중 포즈가 섞여 되돌아가 보인다.
    const after = preset.afterFromAction;
    if (!after) return; // 별도 후동작 문서를 쓰는 구성(②)은 해당 없음
    expect(preset.swing.frames - after.frames).toBeGreaterThan(preset.swing.contactFrame);
  });

  it('활성 프리셋의 스윙 값은 선택을 따라간다', () => {
    setBatterPreset('female');
    expect(activeBatterSwing()).toEqual(BATTER_PRESETS.female.swing);
    setBatterPreset('male');
    expect(activeBatterSwing()).toEqual(BATTER_PRESETS.male.swing);
  });

  it('파생형 프리셋에는 readySlow 를 두지 않는다 — 감속이 두 번 걸리면 정지에 가까워진다', () => {
    // 감속은 잘라낸 파생 문서(clip.timeScale)에 이미 들어 있다. readySlow 는 준비 동작이
    // **별도 문서**인 구성(②)에서만 의미가 있는데, 현재 두 캐릭터 모두 파생형이다.
    for (const key of Object.keys(BATTER_PRESETS) as BatterPresetKey[]) {
      setBatterPreset(key);
      expect(activeBatterReadySlow()).toBeUndefined();
    }
    setBatterPreset(DEFAULT_BATTER_PRESET);
  });

  it('앵커는 남성 접지점에 맞춰야 하는 여성에게만 준다', () => {
    // 남성은 문서 저작값이 기준이라 코드 값이 없어야 하고(있으면 저작값을 덮어써 위치가 어긋난다),
    // 여성은 문서 앵커를 그대로 쓰면 남성과 다른 자리에 서므로 코드가 역산값을 채운다.
    setBatterPreset('male');
    expect(activeBatterAnchor()).toBeUndefined();
    setBatterPreset('female');
    expect(activeBatterAnchor()).toEqual({ x: 0.5099, y: 0.9312 });
    setBatterPreset(DEFAULT_BATTER_PRESET);
  });
});

describe('resolvePlayNodeMotions', () => {
  /**
   * 로비 아이들 캐릭터처럼 역할 키워드('준비'/'후'/'스윙')가 이름에 없는 문서는, 그룹에 문서가
   * 하나뿐이면 **레지스트리의 그 문서**를 써야 한다. 노드의 spriteDocFile 은 처음 배치할 때 박힌
   * 값이라 캐릭터를 다시 내보내면 옛 문서를 가리킨 채 남기 때문이다(2026-08-05 실제 사고).
   */
  it('키워드가 없고 문서가 하나뿐이면 레지스트리 문서를 쓴다 — 노드의 낡은 경로를 덮는다', () => {
    const index: SpriteIndex = {
      docs: [{ id: 'new', name: '여성타자 1', file: 'ui/sprites/new.json', characterId: 'c1' }],
      characters: [{ id: 'c1', name: '여성캐릭터 아이들' }],
    };
    // 노드는 재저장 전의 옛 문서를 가리키고 있다.
    expect(resolveCharacterMotions(index, 'c1', 'ui/sprites/old.json').action).toBe('ui/sprites/new.json');
  });

  it('레지스트리에 그 캐릭터가 없으면 노드 경로로 폴백한다', () => {
    const empty: SpriteIndex = { docs: [], characters: [] };
    expect(resolveCharacterMotions(empty, 'c1', 'ui/sprites/old.json').action).toBe('ui/sprites/old.json');
  });

  it('문서가 여러 개면 추측하지 않는다 — 키워드로만 고르고 나머지는 노드 경로', () => {
    // 어느 쪽이 주동작인지 이름으로 알 수 없으면 임의로 고르는 게 더 위험하다.
    const index: SpriteIndex = {
      docs: [
        { id: 'a', name: '동작 A', file: 'ui/sprites/a.json', characterId: 'c1' },
        { id: 'b', name: '동작 B', file: 'ui/sprites/b.json', characterId: 'c1' },
      ],
      characters: [{ id: 'c1', name: '아무개' }],
    };
    expect(resolveCharacterMotions(index, 'c1', 'ui/sprites/old.json').action).toBe('ui/sprites/old.json');
  });

  it('준비/후가 이미 잡힌 캐릭터에서는 그 문서를 주동작으로 가로채지 않는다', () => {
    const index: SpriteIndex = {
      docs: [{ id: 'r', name: '투수_준비동작', file: 'ui/sprites/p/ready.json', characterId: 'p' }],
      characters: [{ id: 'p', name: '투수1' }],
    };
    const m = resolveCharacterMotions(index, 'p', 'ui/sprites/fallback.json');
    expect(m.ready).toBe('ui/sprites/p/ready.json');
    expect(m.action).toBe('ui/sprites/fallback.json'); // 준비 문서를 스윙으로 재사용하면 안 된다
  });

  it('투수 노드는 프리셋이 아니라 이름 기반 해석을 쓴다', () => {
    const m = resolvePlayNodeMotions(INDEX, { name: '캐릭터: 투수1', characterId: 'p' });
    expect(m).toEqual({
      ready: 'ui/sprites/p/ready.json',
      action: 'ui/sprites/p/throw.json',
      after: 'ui/sprites/p/after.json',
    });
  });

  it('타자 노드는 선택된 프리셋을 쓴다', () => {
    const node = { name: '캐릭터: 타자1', characterId: '1', spriteDocFile: 'ui/sprites/f/bat.json' };
    setBatterPreset('female');
    expect(isDerivedMotion(resolvePlayNodeMotions(INDEX, node).ready)).toBe(true); // 여성 = 앞 구간 파생
    setBatterPreset('male');
    expect(isDerivedMotion(resolvePlayNodeMotions(INDEX, node).ready)).toBe(true); // 남성도 파생
    setBatterPreset(DEFAULT_BATTER_PRESET);
  });

  it('isPitcherNode 는 이름으로 투수를 가른다', () => {
    expect(isPitcherNode({ name: '캐릭터: 투수1' })).toBe(true);
    expect(isPitcherNode({ name: '캐릭터: 타자1' })).toBe(false);
    expect(isPitcherNode({})).toBe(false);
  });
});

/**
 * 부팅 프리로드 분할 — 로딩 화면이 캐릭터 수에 비례해 길어지지 않게 앞 2명만 먼저 받는다
 * (사용자 결정: "캐릭터를 2마리를 먼저 로딩"). 앱인토스 "10초 이내 최초 화면" 요건 대비.
 */
describe('타자 프리로드 분할', () => {
  const node = { characterId: '1', spriteDocFile: 'ui/sprites/f/bat.json' };
  const allKeys = Object.keys(BATTER_PRESETS) as BatterPresetKey[];

  it('부팅에는 타자 1명만 올린다 — 아틀라스가 30MB 대라 피크 메모리가 구형 기기를 죽인다', () => {
    // 부팅 직후 화면은 로비이고 로비는 타자 플레이 클립을 쓰지 않는다. 나머지는 로비에서
    // 캐릭터를 고르는 순간 받는다(assets.preloadSelectedBatterClips).
    expect(BOOT_BATTER_PRELOAD_COUNT).toBe(1);
    expect(bootBatterPresetKeys()).toHaveLength(1);
  });

  it('기본 타자가 부팅 대상에 포함된다 — 첫 게임이 지연 없이 떠야 한다', () => {
    expect(bootBatterPresetKeys()).toContain(DEFAULT_BATTER_PRESET);
  });

  it('부팅분과 지연분은 겹치지 않고 합치면 전체가 된다', () => {
    const boot = bootBatterPresetKeys();
    const deferred = deferredBatterPresetKeys();
    expect(boot.filter((k) => deferred.includes(k))).toEqual([]);
    expect([...boot, ...deferred].sort()).toEqual([...allKeys].sort());
  });

  it('부팅에 안 올린 타자는 전부 지연분이다 — 고르는 순간 받는다', () => {
    expect(deferredBatterPresetKeys()).toHaveLength(allKeys.length - BOOT_BATTER_PRELOAD_COUNT);
  });

  it('batterMotionFilesFor 는 넘겨준 프리셋의 파일만 모은다', () => {
    const maleOnly = batterMotionFilesFor(INDEX, node, ['male']);
    expect(maleOnly).toContain('ui/sprites/1/bat1.json');
    // 여성 프리셋의 원본(파생 동작의 from)은 남성만 요청했을 때 섞이지 않아야 한다.
    expect(maleOnly).not.toContain('ui/sprites/f/bat.json');
  });

  it('빈 프리셋 목록이면 받을 파일도 없다 — 지연분 0명일 때 헛돌지 않는다', () => {
    expect(batterMotionFilesFor(INDEX, node, [])).toEqual([]);
  });

  it('중복 파일은 한 번만 모은다 — 프리셋끼리 시트를 공유해도 두 번 받지 않는다', () => {
    const files = batterMotionFilesFor(INDEX, node, allKeys);
    expect(new Set(files).size).toBe(files.length);
  });
});

describe('hasBatterNode — 에디터 타자 노드 유무 판별', () => {
  const pitcher = { type: 'spriteDocClip', name: '캐릭터: 투수1' };
  const batter = { type: 'spriteDocClip', name: '캐릭터: 타자' };
  const image = { type: 'image', name: '배경' };

  it('타자 노드가 있으면 true', () => {
    expect(hasBatterNode([pitcher, batter, image])).toBe(true);
  });

  it('투수만 있으면 false — 투수는 타자가 아니다', () => {
    expect(hasBatterNode([pitcher, image])).toBe(false);
  });

  it('빈 레이아웃은 false', () => {
    expect(hasBatterNode([])).toBe(false);
  });

  it('이름 없는 spriteDocClip 은 타자로 본다(투수는 이름으로만 구분된다)', () => {
    expect(hasBatterNode([{ type: 'spriteDocClip' }])).toBe(true);
  });

  it('spriteDocClip 이 아닌 노드는 이름이 타자여도 세지 않는다', () => {
    expect(hasBatterNode([{ type: 'image', name: '캐릭터: 타자' }])).toBe(false);
  });
});

describe('DEFAULT_BATTER_PLACEMENT — 삭제된 에디터 노드의 실측 배치 채택', () => {
  it('2026-08-04 까지 적용돼 있던 main.json layer_4 실측치와 일치한다', () => {
    expect(DEFAULT_BATTER_PLACEMENT).toEqual({ x: 243, y: 1975, w: 883, h: 857, depth: 25 });
  });

  it('저작 프레임(1080×2400) 안에 들어간다', () => {
    const p = DEFAULT_BATTER_PLACEMENT;
    expect(p.x).toBeGreaterThan(0);
    expect(p.x).toBeLessThan(1080);
    expect(p.y).toBeGreaterThan(0);
    expect(p.y).toBeLessThan(2400);
  });

  it('CharacterRig 가 균일 스케일에 쓰는 h 가 양수다(0 이면 캐릭터가 안 보인다)', () => {
    expect(DEFAULT_BATTER_PLACEMENT.h).toBeGreaterThan(0);
  });
});
