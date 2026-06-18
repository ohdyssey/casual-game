/**
 * FishSpawner — 깊이대 별로 물고기를 주기적으로 생성.
 *
 * 사용법:
 *   const spawner = new FishSpawner(scene, screenWidth);
 *   spawner.start();
 *   // ...
 *   spawner.update(dt, hookDepth);  // hookDepth 주변에 더 자주 스폰
 *   const fishList = spawner.getFishes();  // 충돌 체크용
 */

import { Fish } from './Fish.js';
import { FISH_SPECIES, pickFishForDepth, getFishCombatProfile } from '../config/fish.config.js';
import { baitAttractsFish } from '../config/items.config.js';

export class FishSpawner {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} screenWidth
   * @param {string[]} [locationFishSpecies] 선택. 해당 낚시터에서 등장 가능한 어종 id 목록.
   *                                          omit / null 이면 필터링 없음 (HomeScene ambient 등).
   * @param {object} [baitSpec] 선택. 활성 미끼/루어 spec — 어종이 입질할지(_hookInterest) 결정.
   *                            omit / null 이면 legacy 80% 확률 fallback (HomeScene ambient).
   */
  constructor(scene, screenWidth, locationFishSpecies, baitSpec) {
    this.scene = scene;
    this.screenWidth = screenWidth;
    this.fishes = [];
    this.spawnTimerMs = 0;
    // 사용자 요청: 전체 15마리까지 확대, 작은 어종 다수 + 대형 소량.
    // 시작 시 빈 화면에서 15마리를 ~7.5초 안에 채우려면 500ms 간격.
    this.spawnIntervalMs = 500;
    this.maxFish = 15;
    this._running = false;

    // ─── 낚시터별 어종 필터 (per-location lazy load 연동) ───
    //   Set 로 보관 → has() O(1). null = 필터링 없음 (backward compat).
    this._allowedFish =
      (Array.isArray(locationFishSpecies) && locationFishSpecies.length > 0)
        ? new Set(locationFishSpecies)
        : null;

    // ─── 활성 미끼/루어 spec (Phase 2) ───
    //   null = 미끼 없음 → legacy fallback. spec 있으면 매칭 어종만 _hookInterest=true.
    //   FishingScene 이 catch 성공 시 consumeBait → setBait(getActiveBaitOrLure()) 로 갱신.
    this._baitSpec = baitSpec || null;

    // 상어 정기 보충 — 사용자 요청: 자주 등장하도록 단축.
    //   첫 등장 1.5s, 이후 12~20s 마다 재출현 (이전 4s / 18~30s).
    this._sharkRespawnTimerMs = 1500;
    this._sharkRespawnIntervalMs = 12000 + Math.random() * 8000;
  }

  /**
   * 어종 def 가 현 낚시터에서 허용되는지 — 필터 없으면 항상 true.
   * @param {object} def
   * @returns {boolean}
   */
  _isAllowed(def) {
    if (!this._allowedFish) return true;
    return !!def && this._allowedFish.has(def.id);
  }

  /**
   * 활성 미끼/루어 spec 갱신 — FishingScene 이 catch 성공 후 호출.
   *   stock=0 으로 미끼가 소진되면 null 전달 → 이후 새 spawn 은 입질 없음.
   * @param {object | null} baitSpec
   */
  setBait(baitSpec) {
    this._baitSpec = baitSpec || null;
  }

  /**
   * 어종 def 가 현재 미끼/루어로 입질할지 판정.
   *   _baitSpec=null → legacy 80% 확률 (HomeScene ambient / 미끼 미장착 호환).
   *   _baitSpec 있고 매칭 → true. 미매칭 → false (이 어종은 이 미끼에 안 물림).
   * @param {object} def
   * @returns {boolean}
   */
  _resolveHookInterest(def) {
    if (!this._baitSpec) return Math.random() < 0.80;
    const combat = getFishCombatProfile(def.id);
    return baitAttractsFish(this._baitSpec, def.id, combat.baitCategory);
  }

  /**
   * 스프라이트 시트가 로드돼 있는지 — 미로드 종은 spawn 하지 않음.
   *   투명 fish(시트 미로드 → Fish 가 빈 컨테이너로 생성) 방지. 모든 진입 경로(직접 #fishing,
   *   로더 미경유, 캐시 edge) 에서 안전. 정상 흐름에선 낚시터 어종 시트가 로드돼 있어 영향 없음.
   * @param {object} def
   * @returns {boolean}
   */
  _spriteReady(def) {
    if (!def?.sprite) return true;   // sprite 키 없는 정의는 통과 (레거시 안전).
    return !!this.scene?.textures?.exists(def.sprite);
  }

  /**
   * 검증 모드 — 종을 가중치 랜덤이 아닌 교대(round-robin)로 선택. 필터 해제(전 어종 허용).
   *   15마리 cap·timed spawn 은 그대로 유지(start/warmup). 미로드 종(예: 시트 파일 없음)은 자동 skip.
   * @param {string[]} ids 등장시킬 어종 id 순서
   */
  enableVerifyMode(ids) {
    this._verifyMode = true;
    this._allowedFish = null;   // 전 어종 허용
    this._verifyIds = (Array.isArray(ids) && ids.length) ? ids.slice() : FISH_SPECIES.map((f) => f.id);
    this._verifyCursor = 0;
  }

  start() {
    this._running = true;
  }
  stop() {
    this._running = false;
  }

  /**
   * 게임 시작 직후 화면을 빨리 채우기 위한 가속 모드.
   * - spawnTimerMs 를 interval 끝에 맞춰서 첫 update tick 에 즉시 spawn.
   * - 이후 update() 가 호출되면서 spawnIntervalMs 마다 1마리씩 입장.
   */
  warmup() {
    this.spawnTimerMs = this.spawnIntervalMs;
  }

  /**
   * @param {number} dtSec
   * @param {object} hook — Hook 인스턴스 (peck/dash 메카닉용)
   */
  update(dtSec, hook) {
    const hookDepth = hook?.y ?? 400;

    // fish 이동 + dead 시 hook 점유 해제 (single-pass, 코드 리뷰 5-3)
    const sw = this.screenWidth;
    for (const f of this.fishes) {
      f.update(dtSec, sw, hook, this.fishes);
      if (f.dead && hook?.targetedBy === f) hook.targetedBy = null;
    }
    // dead fish 정리 — 화면에 보이는 sprite 는 fade-out 후 destroy (사용자 요청: 갑작스러운 사라짐 제거)
    const sh = this.scene?.scale?.height ?? 1280;
    this.fishes = this.fishes.filter((f) => {
      if (!f.dead) return true;
      const s = f.sprite;
      if (s && s.active && this.scene) {
        // 화면 내인 경우만 fade-out, 화면 밖이면 즉시 destroy
        const onScreen =
          f.x > -50 && f.x < sw + 50 && f.y > -50 && f.y < sh + 50;
        if (onScreen) {
          this.scene.tweens.add({
            targets: s, alpha: 0, duration: 280,
            onComplete: () => s?.destroy(),
          });
        } else {
          s.destroy();
        }
      }
      return false;
    });

    if (!this._running) return;

    // ── 상어 정기 보충 ──
    //   사용자 요청: 상어가 잘 안 나타나는 문제 해결.
    //     1) maxFish 무관하게 spawn (상어는 priority).
    //     2) sharkCount === 0 이면 항상 spawn.
    //     3) spawn 시 가까이 화면 안 (off-screen pad 줄임 — _spawnOne 에서 처리).
    this._sharkRespawnTimerMs -= dtSec * 1000;
    if (this._sharkRespawnTimerMs <= 0) {
      // 낚시터별 필터에 shark 가 없으면 forced respawn 자체를 skip (future-proof).
      const sharkAllowed = !this._allowedFish || this._allowedFish.has('shark');
      if (sharkAllowed) {
        const sharkCount = this.fishes.filter((f) => f.def.id === 'shark').length;
        if (sharkCount < 1) {
          this._spawnOne(hookDepth, {
            speciesId: 'shark',
            depth: 240 + Math.random() * 420,
          });
        }
      }
      this._sharkRespawnTimerMs = this._sharkRespawnIntervalMs;
    }

    if (this.fishes.length >= this.maxFish) {
      this.spawnTimerMs = 0;
      return;
    }

    this.spawnTimerMs += dtSec * 1000;
    if (this.spawnTimerMs >= this.spawnIntervalMs) {
      this.spawnTimerMs = 0;
      this._spawnOne(hookDepth);
    }
  }

  /**
   * 한 마리 스폰. opts 로 특정 위치 / 어종 지정 가능.
   *   opts.atX      : 화면 좌표 x. 미지정 시 좌/우 화면 밖에서 시작 (자연스러운 입장).
   *   opts.depth    : y 좌표 (어종 범위와 매칭되어야 함). 미지정 시 자동 분포.
   *   opts.speciesId: 어종 강제 지정 (없으면 pickFishForDepth).
   * 어종 정의에 maxConcurrent / spawnFromCenter 가 있으면 자동 반영.
   */
  _spawnOne(hookDepth, opts = {}) {
    // ── 단일 패스 집계 (코드 리뷰 perf-06) ──
    //   기존엔 band-count / species-count / anti-cluster 가 각각 this.fishes 를
    //   풀스캔(3회) 했음. 동일 결과를 한 번의 루프로 모음.
    //     cnts       : 깊이 5 band 별 마릿수 (depth 자동 분포용)
    //     counts     : 종별 마릿수 (maxConcurrent cap 체크용)
    //     speciesSumX: 종별 x 합 (anti-cluster 평균 진입방향 결정용)
    //   band0 = HUD-overlap : y <  200   (HUD UI 뒤로 swim)
    //   band1 = upper       : 200 ≤ y < 380
    //   band2 = middle      : 380 ≤ y < 560
    //   band3 = lower       : 560 ≤ y < 740   (데크 위 visible 영역)
    //   band4 = below-deck  : 740 ≤ y < 1140  (데크/패널/탭 뒤 — 플립 모드시 노출)
    const cnts = [0, 0, 0, 0, 0];
    const counts = {};
    const speciesSumX = {};
    for (const f of this.fishes) {
      const fy = f.y;
      if (fy < 200)       cnts[0]++;
      else if (fy < 380)  cnts[1]++;
      else if (fy < 560)  cnts[2]++;
      else if (fy < 740)  cnts[3]++;
      else                cnts[4]++;

      const id = f.def.id;
      counts[id] = (counts[id] || 0) + 1;
      speciesSumX[id] = (speciesSumX[id] || 0) + f.x;
    }

    // ── 깊이 결정 — 5 band 로 세분화 ──
    // 사용자 요청: HUD 영역 + 데크 아래 영역도 fish 활동 공간으로 인식.
    // 가장 적은 band 에 spawn → 15마리 / 5 band = 평균 3마리씩.
    let depth = opts.depth;
    if (depth == null) {
      let band = 0;
      for (let i = 1; i < 5; i++) if (cnts[i] < cnts[band]) band = i;

      if (band === 0)      depth =  60 + Math.random() * 130;   //  60-190 (HUD)
      else if (band === 1) depth = 210 + Math.random() * 160;   // 210-370 (상단)
      else if (band === 2) depth = 400 + Math.random() * 140;   // 400-540 (중간)
      else if (band === 3) depth = 580 + Math.random() * 140;   // 580-720 (하단 visible)
      else                 depth = 760 + Math.random() * 360;   // 760-1120 (데크 아래)
    }

    // ── 종별 cap 체크 (counts 는 위 단일 패스에서 집계됨) ──
    const isCapped = (def) =>
      def.maxConcurrent && (counts[def.id] || 0) >= def.maxConcurrent;

    // ── 어종 결정 (cap 도달 시 다른 종으로 재시도) ──
    let def;
    if (opts.speciesId) {
      def = FISH_SPECIES.find((f) => f.id === opts.speciesId);
      if (!def || isCapped(def)) return;
      // 낚시터별 필터 — 허용되지 않는 어종이면 skip (spawnById 도 동일 가드).
      if (!this._isAllowed(def)) return;
      if (!this._spriteReady(def)) return;   // 스프라이트 미로드 시 skip (투명 fish 방지)
    } else if (this._verifyMode) {
      // 검증: 종을 교대(round-robin)로 선택 — 모든 종이 순서대로 등장. cap/미로드는 다음 종으로.
      for (let attempt = 0; attempt < this._verifyIds.length && !def; attempt++) {
        const id = this._verifyIds[this._verifyCursor % this._verifyIds.length];
        this._verifyCursor++;
        const cand = FISH_SPECIES.find((f) => f.id === id);
        if (!cand || isCapped(cand) || !this._spriteReady(cand)) continue;
        def = cand;
      }
      if (!def) return;
    } else {
      for (let attempt = 0; attempt < 6 && !def; attempt++) {
        const cand = pickFishForDepth(depth);
        if (!cand) break;
        if (isCapped(cand)) continue;
        if (!this._isAllowed(cand)) continue;   // 낚시터별 어종 필터
        if (!this._spriteReady(cand)) continue; // 스프라이트 미로드 종 제외 (투명 fish 방지)
        def = cand;
      }
      if (!def) return;   // 모든 종이 cap 도달 / 필터링 — 이번 spawn skip
    }

    // ── 방향 결정 — 같은 종이 이미 있으면 반대편에서 입장 (anti-cluster) ──
    //   counts / speciesSumX 는 위 단일 패스에서 집계됨 (perf-06) — 재스캔 없이 평균 산출.
    let dir;
    if (opts.dir != null) {
      dir = opts.dir;
    } else {
      const sameSpecCount = counts[def.id] || 0;
      if (sameSpecCount > 0) {
        const avgX = (speciesSumX[def.id] || 0) / sameSpecCount;
        dir = avgX < this.screenWidth / 2 ? -1 : 1;     // 평균이 좌→우측 진입
      } else {
        dir = Math.random() < 0.5 ? 1 : -1;
      }
    }

    // ── 입장 방향 (4 사면) — opts.atX 가 명시되면 그대로 사용 ──
    //   좌/우 80% (각 40%) — 기존 수평 입장
    //   상단    10% — y=-50 에서 내려옴 (entryFromTop)
    //   하단    10% — y=820 에서 올라옴 (entryFromBottom)
    // shark 는 대형이라 수직 입장이 어색 → 수평만.
    //
    // 사용자 요청: fish 가 화면 밖에서부터 자연스럽게 입장 (걸쳐서 갑자기 X).
    //   sprite halfWidth + 20px 만큼 더 떨어진 곳에서 시작해 sprite 가 완전히
    //   화면 밖에 있을 때 spawn 되도록.
    const halfW = (def.size ?? 60) * 0.5;
    const OFFSCREEN_PAD = halfW + 30;

    let startX;
    const fishOpts = {
      // Phase 2: 활성 미끼로 입질할지 결정. Fish 가 이 값을 받으면 random fallback 대신 사용.
      hookInterest: this._resolveHookInterest(def),
    };
    if (opts.atX != null) {
      startX = opts.atX;
    } else {
      const sideRoll = Math.random();
      if (def.ignoresHook || sideRoll < 0.80) {
        // 좌/우 측면 입장 — sprite 가 완전히 화면 밖에 있도록 halfW 만큼 더 멀리
        startX = dir === 1 ? -OFFSCREEN_PAD : this.screenWidth + OFFSCREEN_PAD;
      } else if (sideRoll < 0.90) {
        // 상단 입장
        startX = 80 + Math.random() * (this.screenWidth - 160);
        fishOpts.entryFromTop = true;
      } else {
        // 하단 입장
        startX = 80 + Math.random() * (this.screenWidth - 160);
        fishOpts.entryFromBottom = true;
      }
    }

    const fish = new Fish(this.scene, def, startX, depth, dir, fishOpts);
    this.fishes.push(fish);
  }

  /**
   * 특정 어종 id 를 강제로 스폰. 깊이는 해당 어종 범위 중앙.
   * spawnFromCenter / maxConcurrent 같은 def 속성은 _spawnOne 이 반영.
   */
  spawnById(id) {
    const def = FISH_SPECIES.find((f) => f.id === id);
    if (!def) return;
    if (!this._isAllowed(def)) {
      // 낚시터별 필터로 거부된 spawn 요청 — 개발 시 진단용 경고.
      // eslint-disable-next-line no-console
      if (typeof console !== 'undefined') console.warn(`[FishSpawner] spawnById('${id}') blocked — not allowed at this location`);
      return;
    }
    const depth = (def.depthMin + def.depthMax) / 2;
    this._spawnOne(0, { speciesId: id, depth });
  }

  getFishes() {
    return this.fishes;
  }

  removeFish(fish) {
    fish.dead = true;
    fish.sprite?.destroy();
    this.fishes = this.fishes.filter((f) => f !== fish);
  }

  destroyAll() {
    for (const f of this.fishes) f.destroy();
    this.fishes = [];
  }
}
