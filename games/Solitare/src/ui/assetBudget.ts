/**
 * assetBudget.ts — **화면 단위 에셋 그룹의 상주 예산 관리자**.
 *
 * 풀려는 문제: `loadGameAssets` 는 매니페스트를 통째로 부팅에 올린다. 그러면 텍스처 메모리가
 *   "화면에 보이는 것"이 아니라 **"존재하는 것"에 비례**한다 — 그림을 추가하면 한 번도 안 보여줘도
 *   부팅 메모리가 늘고(실측 장당 평균 607KB), iOS 웹콘텐츠 프로세스 한도를 넘기면 프로세스째 죽는다
 *   (2026-08-27 아이폰 크래시). 해상도를 줄이는 건 절편만 낮출 뿐 **증가율은 그대로**라, 카탈로그가
 *   커지면 반드시 다시 터진다.
 *
 * 그래서: 부팅은 항상 보이는 것만 올리고, 화면별 아트는 **그룹 단위로 상주**시킨다.
 *   상주 총량에 예산(BUDGET_BYTES)을 두고, 넘으면 **가장 오래 안 쓴 그룹부터 내린다**.
 *
 * ## 지연이 문제가 되지 않는 이유(실측 2026-08-27)
 *   · 파일 21장 로드 = 53ms · GPU 업로드 = 2ms · Phaser 로더 = **파일 수와 무관하게 4~6프레임**.
 *     60fps 기준 약 85ms 다. (헤드리스는 5fps 라 같은 것이 1.8초로 보인다 — **그 값으로 판단하지 말 것**.
 *     실제로 그 함정에 빠져 이 설계를 한 번 철회했었다.)
 *   · 게다가 `prefetch()` 로 **미리** 받아 두면 열 때 비용이 0 이다. 로딩 표시는 못 맞췄을 때의 안전망.
 *
 * ## 쓰는 법
 *   부팅 후 한가할 때  : `prefetch(scene, 'event')` — 우선순위대로 미리.
 *   화면을 열 때       : `openWithGroup(scene, 'event', () => …)` — 준비됐으면 즉시, 아니면 표시 후.
 *   화면을 닫을 때     : 아무것도 안 해도 된다(예산이 알아서 내린다). 급하면 `release()`.
 */
import type Phaser from 'phaser';
import { ASSET_GROUPS, type AssetGroup } from './generated/assetGroups.js';
import { UI_MANIFEST_KEY, uploadPath, loadUpload } from '../assets.js';

export type { AssetGroup };

/**
 * **상주 예산**(텍스처 바이트). 부팅 상주분(코어)과 별개로, 그룹이 차지할 수 있는 총량이다.
 *
 * ⚠️ 이 숫자는 "안전한 값"이 아니라 **지켜야 할 약속**이다. iOS 웹콘텐츠 프로세스의 실제 한도는
 *   기기·인앱브라우저마다 다르고 공개돼 있지 않다 — 그래서 "얼마까지 되나"를 추측하는 대신
 *   **넘지 않기로 정한 선**을 두고 CI 가 검사한다(scripts/check-texture-budget.mjs).
 */
export const BUDGET_BYTES = 48 * 1024 * 1024;

/**
 * **화면에 서 있는 것**(부지 아트)은 **절대 내리지 않는다.**
 *
 * 부지 그룹은 그 부지가 세워져 있는 동안 계속 그려진다. 예산을 맞추겠다고 내리면 그 텍스처를 쓰던
 * 오브젝트가 남아 렌더러가 **`glTexture` 가 null 인 것을 그리려다 예외**를 던진다 — 그 프레임에서
 * 게임 루프가 끊기고 열던 팝업이 통째로 안 그려진다(실측 2026-08-29: 이벤트·리그가 로딩만 돌고
 * 화면이 안 뜬 원인이 바로 이것이었다).
 *
 * ⚠️ 예전엔 "축출 순서만 뒤로" 였는데 그것으로는 부족했다 — 예산이 모자라면 결국 내려갔다.
 *   **예산보다 화면이 우선이다.** 모자라면 팝업 그룹만 내리고, 그래도 모자라면 그냥 넘긴다
 *   (예산은 약속이지 하드 실패가 아니고, 이 상태는 그룹 나누기가 부족하다는 신호 →
 *    `npm run check:budget` 이 빌드에서 잡는다).
 */
const STANDING_GROUPS: ReadonlySet<string> = new Set(['office', 'bank', 'lot2', 'lot3']);

/** 그룹 상주 상태. */
interface Resident {
  group: AssetGroup;
  bytes: number;
  /** 마지막으로 필요해진 시각(LRU 기준) — 게임 루프 시간(ms). */
  touched: number;
  /** 지금 화면이 쓰는 중이면 내리지 않는다. */
  pinned: number;
}

const resident = new Map<AssetGroup, Resident>();
const inflight = new Map<AssetGroup, Promise<void>>();
let clock = 0; // 단조 증가 카운터 — Date.now() 를 쓰지 않는다(테스트·리플레이 안정).

/** 지금 상주 중인 그룹이 차지한 바이트 합. */
export function residentBytes(): number {
  let n = 0;
  for (const r of resident.values()) n += r.bytes;
  return n;
}

/**
 * **받는 중인 그룹의 예약 바이트** — 아직 상주로 잡히지 않았지만 곧 잡힐 몫.
 *
 * ⚠️ 이걸 빼먹으면 같은 틱에 시작한 미리받기들이 **서로의 용량을 못 보고** 전부 통과해 예산을 넘긴다
 *   (실측: 예산 48MB 에 82MB 가 올라왔다 — 회귀 하네스가 잡았다). 입장 판정은 반드시 상주+예약으로.
 */
function pendingBytes(): number {
  let n = 0;
  for (const g of inflight.keys()) n += ASSET_GROUPS[g].maxBytes;
  return n;
}

/** 지금 이 그룹을 더 올려도 예산 안인가(상주 + 받는 중 + 이번 것). */
function fits(group: AssetGroup): boolean {
  // **서 있는 그룹(부지)은 예산 판정을 면제** — 어차피 화면에 들어서면 ensure 가 강제로 올린다. 조립본은 ASTC 라
  //   실제 GPU 크기가 표기(RGBA 기준 maxBytes)의 1/4~1/9 이기도 하다. 막아 봐야 순차 로딩만 늦어진다(2026-08-31).
  if (STANDING_GROUPS.has(group)) return true;
  return residentBytes() + pendingBytes() + ASSET_GROUPS[group].maxBytes <= BUDGET_BYTES;
}

/** 진단용 스냅샷(콘솔·회귀 하네스). */
export function budgetSnapshot(): { bytes: number; budget: number; groups: string[] } {
  return { bytes: residentBytes(), budget: BUDGET_BYTES, groups: [...resident.keys()] };
}

/*
 * **dev 진단 손잡이** — 회귀 하네스가 앱의 **실제** 상주 상태를 읽게 한다.
 *   ⚠️ 하네스가 `import('/src/ui/assetBudget.ts')` 로 직접 부르면 **다른 모듈 인스턴스**를 잡아
 *   늘 빈 상태가 보인다(실측: 26장이 멀쩡히 올라와 있는데 "상주 0MB · 미로드 26장"으로 오탐).
 *   전역 손잡이 하나로 그 함정을 없앤다. 배포 빌드에서는 제거된다.
 */
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  (window as unknown as { __assetBudget?: unknown }).__assetBudget = budgetSnapshot;
}

/** 실제로 올라온 텍스처의 바이트를 센다 — 배포본은 다이어트로 작아지므로 상한(maxBytes)보다 정확하다. */
function measure(scene: Phaser.Scene, group: AssetGroup): number {
  let n = 0;
  for (const k of ASSET_GROUPS[group].keys) {
    const t = scene.textures.exists(k) ? scene.textures.get(k) : null;
    const s = t?.source?.[0];
    if (s) n += s.width * s.height * 4;
  }
  return n;
}

/**
 * 예산을 맞출 때까지 **가장 오래 안 쓴 그룹부터** 내린다.
 * ⚠️ `pinned` 인 그룹(지금 화면이 쓰는 중)은 건드리지 않는다 — 내리면 그 화면이 빈 사각형이 된다.
 */
function evictUntil(scene: Phaser.Scene, need: number): void {
  const over = (): boolean => residentBytes() + pendingBytes() + need > BUDGET_BYTES;
  if (!over()) return;
  const victims = [...resident.values()]
    // 서 있는 것(부지)과 지금 쓰는 것(pinned)은 **후보에서 아예 뺀다** — 내리면 화면이 깨진다.
    .filter((r) => r.pinned === 0 && !STANDING_GROUPS.has(r.group))
    .sort((a, b) => a.touched - b.touched); // 오래 안 쓴 것부터.
  for (const v of victims) {
    if (!over()) return;
    release(scene, v.group);
  }
  // 여기까지 와서도 넘으면 **내릴 수 없는 것만 남은 것**이다(서 있는 부지 · 지금 쓰는 팝업).
  //   그래도 요청은 처리한다 — 안 그리면 화면이 빈다. 예산 초과는 빌드 게이트가 잡는 문제이고,
  //   런타임에서 화면을 깨뜨려 가며 지킬 값이 아니다.
}

/** 그룹 텍스처를 내린다(멱등). 화면이 쓰는 중이면 아무것도 하지 않는다. */
export function release(scene: Phaser.Scene, group: AssetGroup): void {
  const r = resident.get(group);
  if (!r || r.pinned > 0) return;
  // ⚠️ 서 있는 그룹은 직접 불러도 안 내린다 — 화면에 그 텍스처를 쓰는 오브젝트가 살아 있다.
  if (STANDING_GROUPS.has(group)) return;
  for (const k of ASSET_GROUPS[group].keys) {
    if (scene.textures.exists(k)) scene.textures.remove(k);
  }
  resident.delete(group);
}

/** 로더를 건드리는 것은 항상 한 곳뿐 — 그룹 로드를 줄 세우는 꼬리. */
let loadQueue: Promise<unknown> = Promise.resolve();

/**
 * 어떤 이유로도 **영원히 기다리지 않는다**(ms). 넘으면 그냥 진행한다 — 텍스처가 몇 장 비는 것이
 * 화면이 안 뜨는 것보다 낫다(빠진 그림은 각 화면의 폴백이 받는다).
 * 60fps 에서 그룹 로드는 4~6프레임(~85ms)이라 정상 경로는 여기 근처도 안 온다.
 */
const LOAD_TIMEOUT_MS = 8_000;

/** 키 묶음을 실제로 로더에 태운다. **항상 settle 한다**(완료·타임아웃 어느 쪽이든). */
function loadKeys(scene: Phaser.Scene, keys: readonly string[], pathOf: (k: string) => string): Promise<void> {
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      resolve();
    };
    const run = (): void => {
      if (!scene.scene.isActive()) return finish(); // 씬이 바뀌었다 — 더 받을 이유가 없다.
      for (const k of keys) loadUpload(scene, k, pathOf(k)); // ASTC(KTX) 가 있으면 그쪽으로.
      scene.load.once('complete', finish);
      scene.load.start();
    };
    // ⚠️ 로더가 도는 중이면 **완료 이벤트 안에서 바로 start 하지 않는다** — 그 시점 로더 상태에서는
    //   start 가 씹힌다. 한 틱 뒤로 미뤄 로더가 완전히 쉬는 상태에서 시작한다.
    if (scene.load.isLoading()) scene.load.once('complete', () => setTimeout(run, 0));
    else run();
    setTimeout(finish, LOAD_TIMEOUT_MS); // 마지막 안전망.
  });
}

/**
 * 그룹을 올린다(멱등·동시호출 안전). 이미 올라와 있으면 즉시 resolve.
 *
 * ⚠️ 경로는 **부팅에 받아 둔 매니페스트**에서 읽는다(PROD 는 `.webp` 로 재작성돼 있다) — 확장자를
 *   추측하면 배포본에서 404 난다.
 * ⚠️ 로더가 이미 돌고 있으면 끝난 뒤에 시작한다 — 진행 중 `start()` 는 진행 이벤트를 꼬이게 한다.
 */
export function ensure(scene: Phaser.Scene, group: AssetGroup): Promise<void> {
  const already = inflight.get(group);
  if (already) return already;

  const manifest = (scene.cache.json.get(UI_MANIFEST_KEY) ?? {}) as Record<string, string>;
  // ⚠️ 매니페스트 밖 수동 이식 키(부지 아트 BG_02/03/04·점원)는 `uploadPath` 로 푼다 — 배포본은 확장자가 바뀌므로(UPLOAD_EXT)
  //   확장자를 직접 적지 말 것.
  const pathOf = (k: string): string => manifest[k] ?? uploadPath(k);
  const pending = ASSET_GROUPS[group].keys.filter((k) => !scene.textures.exists(k));
  const touch = (): void => {
    const r = resident.get(group);
    if (r) r.touched = ++clock;
  };
  if (pending.length === 0) {
    if (!resident.has(group)) resident.set(group, { group, bytes: measure(scene, group), touched: ++clock, pinned: 0 });
    else touch();
    return Promise.resolve();
  }

  evictUntil(scene, ASSET_GROUPS[group].maxBytes);

  /*
   * **한 번에 하나씩 줄 세워 받는다**(loadQueue).
   *
   * ⚠️ 예전엔 그룹마다 곧장 로더를 건드렸다. 여러 그룹을 동시에 요청하면(부팅 직후 미리받기 3개가
   *   그렇다) 두 번째부터는 `load.once('complete', run)` 으로 **앞 배치의 완료 이벤트 안에서** 다시
   *   `load.start()` 를 불렀고, 그 시점 로더 상태에 따라 시작이 씹혀 **완료 이벤트가 영영 안 왔다**.
   *   → 프로미스가 안 끝나 `openWithGroup` 이 열기를 못 하고 **딤만 남았다**(실측 2026-08-29:
   *   이벤트·리그가 "로딩만 걸리고 화면이 안 뜬다"는 신고의 정체).
   *   줄을 세우면 로더를 건드리는 것은 항상 한 곳뿐이라 이 경합이 원천적으로 없다.
   */
  const p = loadQueue
    .then(() => loadKeys(scene, pending, pathOf))
    .then(() => {
      resident.set(group, { group, bytes: measure(scene, group), touched: ++clock, pinned: 0 });
    })
    .finally(() => {
      inflight.delete(group);
    });
  loadQueue = p.catch(() => undefined); // 한 그룹이 실패해도 뒤 줄은 계속 돈다.
  inflight.set(group, p);
  return p;
}

/**
 * **미리 받아 두기** — 화면이 한가할 때 부른다. 열 때 비용을 0 으로 만드는 것이 목적이라
 * 실패해도 조용히 넘어간다(열 때 ensure 가 다시 받는다).
 *
 * ⚠️ 예산이 모자라면 **받지 않는다**(내리고 받으면 방금 내린 것을 또 받는 왕복이 생긴다).
 *   예산은 "지금 필요한 것"이 우선이다.
 */
export function prefetch(scene: Phaser.Scene, group: AssetGroup): void {
  if (resident.has(group) || inflight.has(group)) return;
  if (!fits(group)) return; // 상주 + 받는 중까지 보고 판단(같은 틱 동시 요청 방지).
  void ensure(scene, group).catch(() => undefined);
}

/** 지금 화면이 쓰는 중 — 예산이 빠듯해도 내리지 않는다. */
export function pin(group: AssetGroup): void {
  const r = resident.get(group);
  if (r) r.pinned++;
}

/** 화면이 끝났다 — 다시 내릴 수 있게 한다. */
export function unpin(group: AssetGroup): void {
  const r = resident.get(group);
  if (r && r.pinned > 0) r.pinned--;
}

/** 준비되기까지 이 시간을 넘기면 로딩 표시를 띄운다(ms). 60fps 에서 그룹 로드는 ~85ms 라 대개 안 뜬다. */
const SPINNER_AFTER_MS = 180;

/**
 * 그룹을 확보한 **뒤에** 화면을 연다 — 호출부는 동기 그대로 두고 여기서만 기다린다.
 *
 * ⚠️ 예전에 이 대기 구간에 **아무 표시가 없어** "팝업이 안 열린다"는 신고를 받았다(2026-08-27).
 *   느려질 수 있는 경로에는 반드시 표시가 있어야 한다 — 그게 이 함수가 존재하는 이유다.
 * ⚠️ 기다리는 사이 씬이 바뀔 수 있으므로(뒤로가기·레벨 전환) 열기 직전에 씬이 살아 있는지 본다.
 *   안 보면 파괴된 씬에 오브젝트를 붙여 다음 프레임에 게임 루프가 멈춘다.
 */
export function openWithGroup(
  scene: Phaser.Scene,
  group: AssetGroup,
  open: () => void,
  opts: { spinner?: (scene: Phaser.Scene) => () => void } = {},
): void {
  let hide: (() => void) | null = null;
  const timer = setTimeout(() => {
    if (scene.scene.isActive() && opts.spinner) hide = opts.spinner(scene);
  }, SPINNER_AFTER_MS);

  void ensure(scene, group)
    .catch(() => undefined)
    .then(() => {
      clearTimeout(timer);
      hide?.();
      if (!scene.scene.isActive()) return;
      pin(group);
      open();
    });
}
