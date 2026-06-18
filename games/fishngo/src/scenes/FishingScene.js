/**
 * FishingScene — 핵심 게임플레이 (샘플 이미지 #2 기반 정밀 배치).
 *
 * 원칙:
 *   1. 모든 UI 이미지는 원본 가로:세로 비율을 절대 변형하지 않는다 (contain 또는 cover).
 *   2. 이미지 자체에 텍스트가 baked-in 된 자산은 overlay 텍스트를 추가하지 않는다
 *      (예: CAST 버튼의 "PRESS & HOLD", 게이지의 "GOOD CATCH! TOO EARLY! TOO LATE!",
 *       RANK/MENU/BAITS/LURES/ROD PARTS/REELS, 클립보드의 "6/10",
 *       craft body 의 "Combine ingredients to craft new bait!" 등).
 *   3. 동적으로 변하는 수치 (잡은 마릿수, 점수 등) 만 텍스트로 overlay 한다.
 *
 * 레이아웃은 LAYOUT 상수 참고 — 모든 y 좌표는 거기서 single source.
 */

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS, LAYOUT, FISHING, FONT } from '../config/game.config.js';
import { strokeText, centerInBox } from '../ui/components.js';
import { placeContained, placeByWidth, getDisplayBounds } from '../ui/scale.js';
import { buildChromeFromLayout, fillHeartsInto, resolveBind } from '../ui/sceneChrome.js';
import { BOTTOM_TABS, CRAFT_INGREDIENTS, LOCATIONS, REEL_SFX_KEYS, SUCCESS_SFX_KEYS, FAIL_SFX_KEYS, SPLASH_SFX_KEYS, ASSETS_SPRITESHEETS, ANIMATIONS } from '../config/assets.config.js';
import { getLocationManifest } from '../config/locations.config.js';
import { Hook, HOOK_STATE } from '../entities/Hook.js';
import { FISH_STATE } from '../entities/Fish.js';
import { FISH_SPECIES, getFishCombatProfile } from '../config/fish.config.js';
import { FishSpawner } from '../entities/FishSpawner.js';
import {
  getMaxDepth, getActiveBaitOrLure, consumeBait,
  getEquippedRod, getEquippedReel, getEquippedLine,
} from '../systems/Equipment.js';
import { recordCatch } from '../systems/FishInventory.js';
import { loadProfile, addGold, recordMatchEnd } from '../systems/UserProfile.js';
import { crossfadeMusic } from '../systems/Music.js';
import { FishingTutorial } from '../systems/FishingTutorial.js';
import { vibrate, stopVibration } from '../systems/haptics.js';
import { smoothStart } from '../systems/sceneTransition.js';

// 캐스팅 비용 — 레벨에 따라 동적 증가 (사용자 요청).
//   Level 1: 150, Level 2: 175, ... Level N: 150 + (N-1) × 25
//   상한 800 골드 (너무 가파른 증가 방지).
const CAST_COST_GOLD_BASE = 150;
const CAST_COST_PER_LEVEL = 25;
const CAST_COST_CAP = 800;
function castCostForLevel(level) {
  return Math.min(CAST_COST_CAP, CAST_COST_GOLD_BASE + Math.max(0, (level || 1) - 1) * CAST_COST_PER_LEVEL);
}

// ─── 타이틀바 데이터 — Google Doc "Fish & GO 배경 목록" (1~50) ───
//   사용자 요청: 배경명 매칭 표시. 영문 표기.
const BG_NAMES_EN = {
  0: 'Main',
  1: 'South Sea of Korea',
  2: 'Jeju Volcanic Coast',
  3: 'Hokkaido Cold Waters',
  4: 'Okinawa, Japan',
  5: 'Zhoushan Archipelago, China',
  6: 'Hong Kong / South China Sea',
  7: 'Penghu Islands, Taiwan',
  8: 'Ha Long Bay, Vietnam',
  9: 'Phuket / Andaman Sea',
  10: 'Palawan, Philippines',
  11: 'Bali / Lombok, Indonesia',
  12: 'Sabah Borneo, Malaysia',
  13: 'Maldives Atolls',
  14: 'Kerala Backwaters, India',
  15: 'Sri Lanka South Coast',
  16: 'Oman / Arabian Sea',
  17: 'Great Barrier Reef',
  18: 'Tasmania, Australia',
  19: 'Milford Sound, New Zealand',
  20: 'Fiji Lagoon',
  21: 'Coral Sea, Papua New Guinea',
  22: 'Tahiti / Bora Bora',
  23: 'Norwegian Fjords',
  24: 'Iceland Volcanic Coast',
  25: 'Scottish Lochs',
  26: 'Ireland Atlantic Cliffs',
  27: 'French Riviera',
  28: 'Amalfi / Capri, Italy',
  29: 'Santorini / Aegean Sea',
  30: 'Dalmatian Coast, Croatia',
  31: 'Azores, Portugal',
  32: 'Canary Islands, Spain',
  33: 'Dutch Canals',
  34: 'Alaska Glacier Bay',
  35: 'Vancouver Island, Canada',
  36: 'Great Lakes, USA',
  37: 'Florida Keys, USA',
  38: 'Louisiana Bayou, USA',
  39: 'Bahamas',
  40: 'Baja California, Mexico',
  41: 'Peru Humboldt Current',
  42: 'Amazon River, Brazil',
  43: 'Patagonia Rivers & Lakes',
  44: 'Galápagos Islands',
  45: 'Hawaii',
  46: 'Red Sea, Egypt',
  47: 'Seychelles',
  48: 'Madagascar',
  49: 'Cape Town, South Africa',
  50: 'Arctic Ice Fishing',
};

// 타이틀 색상 팔레트 — 흰색부터 시작, BG 번호별 결정적 색상 (사용자 요청).
const TITLE_COLOR_PALETTE = [
  '#ffffff',  // 0: 흰색 (시작)
  '#ffd750',  // 1: 골드
  '#9ee0ff',  // 2: 시안
  '#ff9ec7',  // 3: 핑크
  '#c4a8ff',  // 4: 라벤더
  '#a8ff90',  // 5: 라임
  '#ffae80',  // 6: 코랄
  '#9affe0',  // 7: 민트
  '#fff066',  // 8: 옐로우
  '#ffa8e0',  // 9: 마젠타
  '#80d8ff',  // 10: 하늘
  '#ffb070',  // 11: 오렌지
];

// 낚시터 id → 원본 BG 번호 (타이틀바 영문명 매핑용).
//   v2 시트 매핑: 각 LOCATIONS[*].bgNo 직접 lookup.
//   LOCATIONS 는 위에서 이미 import 됨.
function _idToBgNo(id) {
  for (const loc of LOCATIONS) if (loc.id === id) return loc.bgNo || 0;
  return 0;
}
const LOC_TO_BG_NO = new Proxy({}, { get: (_, key) => _idToBgNo(key) });

// 게임 배너 폰트 스택 — Google Fonts 우선, 시스템 condensed bold 폴백.
const TITLE_FONT_STACK = '"Bowlby One", "Black Ops One", "Russo One", Impact, "Haettenschweiler", "Arial Narrow Bold", sans-serif';

// z-depth 규약 (게임 엔티티: fish=10, hook=50/51)
// 사용자 요청: 물(water/waterFx) 을 fish 위 레이어로 → "물을 통해 바라보는" 시각.
//   bg < fish < water < waterFx < deck < hook < UI
const DEPTH = {
  bg:      0,
  jelly:   4,    // 해파리 부유 장식 — bg 위, fish 뒤 (감상용)
  fish:    7,    // 물고기 (Fish.js 가 6=shark, 7=일반)
  water:   8,    // 물결 레이어 — fish 위, deck 뒤 (사용자 요청)
  waterFx: 9,    // 반짝이/거품 sparkle — water 위
  deck:   11,    // 나무 데크 — 물 위에 보트 (boat above water)
  hook:   51,
  meter:   85,    // tension 게이지 (CAST 뒤로)
  castBtn: 90,    // CAST 버튼은 panel 아래 + meter 위
  panel:  100,    // CRAFT 패널 본체
  hud:    110,    // 상단 HUD
  panelHeader: 120,
  cast:   130,    // 사이드 LURES/RODS, RANK/MENU 등은 panel 위
  tabs:   140,
  toast: 1000,
};

// 카메라 셰이크(파이팅 setScroll ±3, 잡기/실패 camera.shake 최대 ~15px) 시
// 전체화면 오버레이·배경이 밀려도 외곽에 빈 틈(뒤 밝은 배경)이 드러나지 않도록,
// 화면보다 사방 이만큼(px) 더 크게 그린다. 64면 최대 셰이크의 4배 여유.
const SHAKE_OVERSCAN = 64;

// 어종 검증 모드 (QA 전용): 빙하 낚시터에서 전 어종을 15마리 cap·교대(round-robin)로 노출.
//   QA 도구이므로 개발 빌드(import.meta.env.DEV)에서만 활성 — 프로덕션은 항상 OFF.
//   glacier BG 프리뷰(◀▶) 도 동일 게이트 — 일반 플레이어에게 노출 금지.
const DEV_TOOLS_ENABLED = !!(import.meta.env && import.meta.env.DEV);
const VERIFY_ALL_SPECIES = DEV_TOOLS_ENABLED;

export class FishingScene extends Phaser.Scene {
  constructor() { super('FishingScene'); }

  init(data) {
    this.score = 0;
    this.catches = 0;
    this.timeLeftSec = FISHING.matchDurationSec;
    this.isTapping = false;
    this.gameOver = false;
    this._caughtList = [];
    this.profile = loadProfile();
    this._showcaseActive = false;
    this._showcaseTimer  = 0;
    // 게임 모드 — 'auto' | 'user' (CRAFT 제거+UI 하단) | 'user2' (CAST 버튼 발사)
    const m = data?.mode;
    this.mode = (m === 'user' || m === 'user2') ? m : 'auto';
    // 사용자 요청: HomeScene 캐러셀에서 선택된 낚시터 id (beach/glacier/hongkong) 수신.
    //   LocationLoaderScene 가 forward. 현재 consume:
    //     - _buildBackground(): bgKey 분기
    //     - create(): FishSpawner allowedFish 필터 (낚시터별 어종 한정)
    this.location = data?.location || 'beach';
    // 콤보 시스템 — 연속 catch 보너스
    this._combo = 0;
  }

  // 낚시 화면 전용 크롬을 에디터 레이아웃으로 구동 — 캐시버스트로 편집 즉시 반영.
  preload() {
    this.cache.json.remove('layout_fishing');
    this.load.json('layout_fishing', `ui/layouts/fishing.json?t=${Date.now()}`);
    this.cache.json.remove('layout_fishing_tabs');
    this.load.json('layout_fishing_tabs', `ui/layouts/fishing_tabs.json?t=${Date.now()}`);
    this.load.once('loaderror', () => { /* 파일 없음 → create 에서 폴백 */ });
  }

  create() {
    // 반응형: 실제 캔버스 폭/높이. 디자인 (720×1280) 은 references.
    const W = this.scale.width;

    this._hudContainer = null;          // 씬 재진입 대비 — 폴백 시 이전 run 의 파괴된 참조가 남지 않게 리셋
    this._tabsContainer = null;         // 하단 탭바 컨테이너 — 동일 리셋
    this._buildBackground(W);
    this._buildJellyfish(W);
    this._buildTopChrome(W);            // 상단 HUD = fishing.json or 폴백 (+ 사운드 토글)

    // ─── Phase 3: 장비 spec fetch + hook 에 주입 ───
    //   line.strength / rod.power / reel.drag 가 텐션·줄 끊김·게이지 흡수 계산에 사용.
    //   매치 중간 장비 변경은 다음 매치부터 반영 (현 매치 hook 인스턴스 캐시).
    this._equippedRod  = getEquippedRod();
    this._equippedReel = getEquippedReel();
    this._equippedLine = getEquippedLine();

    // 게임 엔티티
    this.hook = new Hook(this, W / 2);
    this.hook.setEquipment({
      rod:  this._equippedRod,
      reel: this._equippedReel,
      line: this._equippedLine,
    });
    // user2: CAST 버튼에서 발사 → 위에서 내려오는 cast tween 불필요.
    //   action layer 가 castBtn 생성 후 setUser2Mode 호출 (아래 _buildActionLayer 이후).
    if (this.mode !== 'user2') {
      // 첫 캐스팅 — 비용 차감. BUG-01: 잔액 부족이면 차감/캐스팅 없이 out-of-gold 종료.
      //   create() 도중 scene.start 회피 위해 _endMatch 를 한 틱 뒤로 미룸.
      if (this._payCastCost()) {
        this.hook.cast();
      } else {
        this.time.delayedCall(0, () => this._endMatch());
      }
    }
    // maxDepth: 실제 화면 높이에서 액션 레이어 위까지 (대략 -270)
    const sh = this.scale.height;
    const maxDepthFromBottom = (this.mode !== 'auto') ? 350 : 450;
    // Phase 3: line.depthLimit (m) → 화면 깊이 비례 매핑. T1 50m = 50%, T6 500m = 100%.
    //   rod.length (m) → 2.0m 기준 초과분당 +20px 보너스 (T6 4.5m = +50px).
    const lineDepthRatio = Math.min(1.0, (this._equippedLine?.depthLimit ?? 500) / 500);
    const rodLengthBonus = Math.max(0, ((this._equippedRod?.length ?? 2.0) - 2.0) * 20);
    const baseMaxDepth = Math.min(getMaxDepth(FISHING.maxDepth), sh - maxDepthFromBottom);
    this.maxDepth = Math.round(baseMaxDepth * lineDepthRatio + rodLengthBonus);
    // ─── 낚시터별 어종 필터 (per-location lazy 자산 정책과 1:1 매칭) ───
    //   매니페스트 lookup 실패 시 undefined 전달 → 필터링 없음 (backward compat: 직접 FishingScene 진입 등).
    const locManifest = getLocationManifest(this.location);
    const allowedFish = locManifest?.fishSpecies;
    // ─── Phase 2: 활성 미끼/루어 → spawner 가 fish 입질 여부 필터링 ───
    //   미장착이거나 stock=0 이면 null → legacy 80% fallback (HomeScene/직접진입 호환).
    this._activeBait = getActiveBaitOrLure();
    this.spawner = new FishSpawner(this, W, allowedFish, this._activeBait);
    if (VERIFY_ALL_SPECIES && this.location === 'glacier') {
      // 검증 모드: 전 어종 시트 로드 → round-robin(교대) spawn, 15마리 cap 유지.
      this._startSpeciesVerification();
    } else {
      this.spawner.start();
      // 사용자 요청: 게임 시작 시 빈 화면 → 사방에서 fish 가 헤엄쳐 들어옴.
      // 사전 배치 없음. spawner 가 화면 밖에서부터 점진적으로 채움.
      // 시작 직후 빠르게 채우기 위해 spawner 가 warmup 모드로 동작.
      this.spawner.warmup();
    }

    this._buildWoodDeck(W);
    this._buildWaterSurface(W);
    this._buildActionLayer(W);
    // user 모드: CRAFT 패널 제거 — 데크가 자연스럽게 노출 (image 2 스타일)
    if (this.mode === 'auto') {
      this._buildCraftPanel(W);
    }
    this._buildBottomTabsChrome(W);     // 하단 탭바 = fishing_tabs.json or 폴백
    // 사용자 요청: 물고기 위 부유 게이지 (이미지 자산 사용) — PECKING/HOOKED 시 표시.
    //   depth 80 = fish(52) 보다 위, CAST 버튼(90)/HUD(110) 아래.
    this._buildFishGauges();
    this._wireInputs();

    // 타이머 — 사용자 요청: 임의 종료 X. 시간 카운트만 (자동 endMatch 호출 안 함).
    //   메뉴 버튼 클릭으로만 종료 (= _endMatch).
    this.timerEvent = this.time.addEvent({
      delay: 1000, loop: true,
      callback: () => {
        this.timeLeftSec -= 1;
        this._updateHUD();
        // (자동 종료 라인 제거 — 게임이 임의로 끝나지 않음)
      },
    });
    this.input.keyboard?.on('keydown-ESC', () => this._goHome());

    // 사용자 요청: Fish PECKING 1.5s 안에 챔질 없으면 도주 → 화면 알림.
    //   ⚠ Phaser shutdown 은 scene.events 리스너를 제거하지 않으므로(재진입 시 누적),
    //     named 메서드로 바인딩하고 _shutdown 에서 명시적으로 off (PH-01).
    this.events.on('fish_strike_timeout', this._onFishStrikeTimeout, this);

    // 사용자 요청: BGM — 평상시 music_01. HOOKED 상태 진입 시 update 에서 music_02 로 전환.
    crossfadeMusic(this, 'music_01');
    this._musicState = 'normal';

    // 릴 효과음 — HOOKED 1회당 1 모델 고정, isTapping 시만 play (낮은 볼륨).
    this._reelSfx = null;          // Sound 인스턴스 (HOOKED 진입 시 생성, 종료 시 destroy)
    this._reelSfxArmed = false;    // HOOKED 진입 후 1회 add 완료 여부

    // 씬 종료 시 리소스 정리 (메모리 누수 방지 — 코드 리뷰 2-2)
    this.events.once('shutdown', this._shutdown, this);
    this.events.once('destroy',  this._shutdown, this);

    // ─── 첫 플레이 튜토리얼 (user2 모드 한정, 1회만) ───
    //   캐스팅 자동 시연 → 챔질 → 파이팅을 단계적으로 안내.
    this.tutorial = null;
    if (this.mode === 'user2' && !this.profile?.tutorialDone) {
      this.tutorial = new FishingTutorial(this);
      this.tutorial.start();
    }
  }

  // 입질 타임아웃(미끼 도둑맞음) — named 핸들러 (PH-01: _shutdown 에서 off 가능하도록).
  _onFishStrikeTimeout() {
    this._spawnFlashText('FISH STOLE BAIT!', '#ff8040', 56);
    this.cameras.main.shake(150, 0.005);
    this._playFailSfx('escaped');
  }

  // ─── shutdown: 씬 전환/종료 시 모든 리소스 정리 ───
  //   - 모든 tween 중단
  //   - timer 제거
  //   - shimmer/bubble emitter destroy
  //   - showcase 오브젝트 destroy
  //   - 절차 생성 텍스처(water_caustics_w3/water_bubble)는 앱 세션 동안 유지(재생성 비용 회피)
  //   - camera 위치 복원
  _shutdown() {
    // scene.events 리스너 명시적 제거 — Phaser 는 shutdown 시 자동 제거하지 않아
    //   재진입(re-create) 마다 누적됨 (PH-01: fish_strike_timeout, BUG-08: splash sync).
    this.events.off('fish_strike_timeout', this._onFishStrikeTimeout, this);
    this._cleanupSplashListeners();
    // 튜토리얼 오버레이 정리
    this.tutorial?.destroy();
    this.tutorial = null;
    // tweens
    this.tweens?.killAll();
    // timer
    this.timerEvent?.remove();
    // shimmers (sparkle 입자)
    this.shimmers?.forEach((s) => s?.destroy());
    this.shimmers = [];
    // 해파리 부유 장식
    this.jellyfish?.forEach((j) => j?.destroy());
    this.jellyfish = [];
    // bubble emitters
    this.bubbleEmitters?.forEach((e) => e?.destroy());
    this.bubbleEmitters = [];
    // showcase 잔여 오브젝트
    this._showcaseEffect?.destroy(); this._showcaseEffect = null;
    this._showcaseName?.destroy();   this._showcaseName = null;
    this._showcaseInfo?.destroy();   this._showcaseInfo = null;
    this._showcaseOverlay?.destroy(); this._showcaseOverlay = null;
    this._hookedNameText?.destroy(); this._hookedNameText = null;
    this._fishGauges?.container?.destroy(); this._fishGauges = null;
    // 절차 생성 텍스처(water_caustics_w3 / water_bubble)는 제거하지 않고 앱 세션 동안 유지.
    //   (perf-02/perf-09/PH-05) 과거엔 잘못된 키 'water_caustics' 를 지우려다 no-op 이 되어
    //   실제 텍스처는 누수되고, 매 진입마다 65k 픽셀 생성이 재실행됐다. 이제 maker 가
    //   exists() 가드로 1회만 생성하므로 여기서 제거하면 안 됨 (제거하면 재생성 비용 부활).
    // camera scroll 복원 (HOOKED 시 흔들림 잔재 방지)
    this.cameras?.main?.setScroll(0, 0);
    // spawner 의 fish 일괄 정리
    this.spawner?.destroyAll();
    // 릴 효과음 정리
    this._disposeReelSfx();
    // 진행 중인 햅틱 진동 정지
    stopVibration();
  }

  // ─── 릴 효과음 헬퍼 ───
  //   HOOKED 진입 시 3개 모델 중 1개 add (랜덤). isTapping 시 play, 떼면 pause.
  //   HOOKED 종료(non-HOOKED 진입) 시 destroy.
  _updateReelSfx(inHooked) {
    if (inHooked) {
      // HOOKED 진입 — 1회만 add (랜덤 선택).
      if (!this._reelSfxArmed) {
        const keys = REEL_SFX_KEYS;
        const key = keys[Math.floor(Math.random() * keys.length)];
        if (this.cache?.audio?.exists?.(key)) {
          try {
            this._reelSfx = this.sound.add(key, { volume: 0.18, loop: true });
          } catch (e) {
            this._reelSfx = null;
          }
        }
        this._reelSfxArmed = true;
      }
      // isTapping (사용자 누름) 시만 재생 — 손 떼면 pause.
      if (this._reelSfx) {
        if (this.isTapping && !this._reelSfx.isPlaying) {
          try { this._reelSfx.play(); } catch (e) {}
        } else if (!this.isTapping && this._reelSfx.isPlaying) {
          try { this._reelSfx.pause(); } catch (e) {}
        }
      }
    } else {
      // HOOKED 종료 — 정리.
      this._disposeReelSfx();
    }
  }

  _disposeReelSfx() {
    if (this._reelSfx) {
      try { this._reelSfx.stop(); } catch (_) {}
      try { this._reelSfx.destroy(); } catch (_) {}
    }
    this._reelSfx = null;
    this._reelSfxArmed = false;
  }

  // ─── 파이팅 햅틱 (모바일 진동) ───
  //   HOOKED + 릴 감는 중(isTapping) 일 때 장력 비례로 진동 펄스 반복 → "줄 끌어당기는" 손맛.
  //   장력↑ → 펄스 더 자주·길게. navigator.vibrate 펄스는 짧아 자연히 멈추므로 별도 stop 불필요.
  //   매 프레임 호출 대신 interval 누적으로 throttle (vibrate 스팸 방지).
  _updateFightHaptics(dt) {
    if (!this.isTapping || this._showcaseActive) { this._hapticAccum = 0; return; }
    const t = Math.min(1, Math.abs(this.hook?._tensionLevel ?? 0));   // 0~1 장력 크기
    const interval = 0.16 - t * 0.07;    // 저장력 160ms → 고장력 90ms 간격
    const pulse    = Math.round(16 + t * 44);   // 16ms → 60ms
    this._hapticAccum = (this._hapticAccum ?? interval) + dt;
    if (this._hapticAccum >= interval) {
      this._hapticAccum = 0;
      vibrate(pulse);
    }
  }

  // ─── 성공/실패/물튀김 one-shot SFX (1회 재생, 1개 랜덤 선택) ───
  _playSuccessSfx() {
    this._playOneShot(SUCCESS_SFX_KEYS, 0.4);
  }

  // 사용자 요청: 잡기 성공 시 작게 표현 (낮은 볼륨).
  _playSplashSfx() {
    this._playOneShot(SPLASH_SFX_KEYS, 0.16);
  }

  // reason 별 실패 사운드 매핑:
  //   'overweight' / 'snap' → fail_line_snap (줄 끊김)
  //   'escaped'            → fail_soft_drop (도주 — 부드러운 실패)
  //   기타                  → fail_game_over (일반 실패)
  _playFailSfx(reason) {
    let key;
    if (reason === 'overweight' || reason === 'snap') key = 'fail_line_snap';
    else if (reason === 'escaped')                    key = 'fail_soft_drop';
    else                                              key = 'fail_game_over';
    if (!this.cache?.audio?.exists?.(key)) return;
    try { this.sound.play(key, { volume: 0.38 }); } catch (_) {}
  }

  _playOneShot(keys, volume) {
    if (!Array.isArray(keys) || keys.length === 0) return;
    const key = keys[Math.floor(Math.random() * keys.length)];
    if (!this.cache?.audio?.exists?.(key)) return;
    try { this.sound.play(key, { volume }); } catch (_) {}
  }

  // ─── 산호초 배경 (실제 스크린 cover) ───
  //   location 별 배경 분기 (사용자 요청: 홍콩 = Fishing_BG_02).
  //   LOCATIONS 의 bgKey 사용. 매칭 없으면 fallback 'bg_fishing'.
  _buildBackground(W) {
    const loc = LOCATIONS.find((l) => l.id === this.location);
    const bgKey = (loc?.bgKey && this.textures.exists(loc.bgKey)) ? loc.bgKey : 'bg_fishing';
    this._applyBgTexture(bgKey);
    this._currentBgKey = bgKey;

    // 상단 지역 라벨 (사용자 요청: 상단에 지역 표시).
    this._buildLocationLabel(W);
    // (제거됨) glacier 전용 ◀▶ BG 프리뷰 슬라이드 — 스테이지 실제 배경(loc.bgKey)을 덮어써
    //   3번 스테이지가 엉뚱한 배경으로 매칭되던 문제 → 슬라이드 기능 삭제, 스테이지 배경설정대로 표시.
  }

  // 텍스처 키 → 배경 이미지 생성/교체. _bgImage 참조 유지(프리뷰 swap 용).
  _applyBgTexture(bgKey) {
    const W = this.scale.width;
    const sh = this.scale.height;
    if (this._bgImage) { this._bgImage.destroy(); this._bgImage = null; }
    const bg = this.add.image(W / 2, sh / 2, bgKey);
    bg.setOrigin(0.5);
    const tex = bg.texture.getSourceImage();
    const s = Math.max(
      (W + SHAKE_OVERSCAN * 2) / tex.width,
      (sh + SHAKE_OVERSCAN * 2) / tex.height,
    );
    bg.setScale(s);
    bg.setDepth(DEPTH.bg);
    this._bgImage = bg;
  }

  // ─── 게임 타이틀 (배경명 표시) ───
  //   배경 패널 없음 — 텍스트만으로 게임 배너 스타일.
  //   화면 폭 자동 fit — 너무 길면 2행 분할 + 2행은 소형 폰트 (사용자 요청).
  //   위치: 화면 상단 30% 지점. 진입/BG 교체 시 2초 표시 후 페이드아웃.
  _buildLocationLabel(W) {
    if (this._locationLabel) { this._locationLabel.destroy(); this._locationLabel = null; }
    const bgNo = LOC_TO_BG_NO[this.location] ?? 0;
    const labelText = BG_NAMES_EN[bgNo] || this._locationDisplayNameEn(LOCATIONS.find((l) => l.id === this.location));
    const fillColor = TITLE_COLOR_PALETTE[bgNo % TITLE_COLOR_PALETTE.length];

    const sh = this.scale.height;
    const cy = Math.round(sh * 0.30);
    const container = this.add.container(W / 2, cy).setDepth(115);
    this._locationLabel = container;
    this._locationLabelW = W;
    this._renderLabelInto(container, labelText, fillColor);
    this._scheduleLocationLabelHide();
  }

  // 라벨 텍스트 갱신 + 색상 갱신(옵션) + 표시 2초 타이머 재시작.
  //   매 갱신마다 컨테이너 내용을 재구성 → 폭 fit / 분할 / 폰트 크기 자동 계산.
  _showLocationLabel(text, color) {
    if (!this._locationLabel) return;
    this._renderLabelInto(this._locationLabel, text, color);
    this._locationLabel.setAlpha(1);
    this._scheduleLocationLabelHide();
  }

  // perf-07: 텍스트 폭 측정 전용 2D 캔버스 컨텍스트 1개를 lazy 생성·캐시.
  //   매 측정마다 Text GameObject 를 만들지 않도록 재사용 (텍스처 업로드/해제 churn 제거).
  _getTextMeasureCtx() {
    if (this._textMeasureCtx !== undefined) return this._textMeasureCtx;
    let ctx = null;
    try {
      const canvas = (typeof document !== 'undefined')
        ? document.createElement('canvas')
        : null;
      ctx = canvas ? canvas.getContext('2d') : null;
    } catch (_) { ctx = null; }
    this._textMeasureCtx = ctx;   // null 도 캐시 → 재시도 방지
    return ctx;
  }

  // 컨테이너에 라벨 내용 렌더 — 화면 폭 절대 초과 금지.
  //   알고리즘: 1행 fit → 그대로 / 2행 분할 → 각 행을 MAX_W 에 맞게 폰트 자동 축소.
  //   라인 폰트는 최소 22px 까지 단계적 축소 (사용자 요청: 폭 초과 시 폰트 ↓).
  _renderLabelInto(container, text, color) {
    container.removeAll(true);
    const W = this._locationLabelW || this.scale.width;
    const MAX_W = Math.max(60, W * 0.94);   // 화면의 94% 절대 한계
    const FONT_MAIN = 64;
    const FONT_SUB  = 38;
    const STROKE_MAIN = 11;
    const STROKE_SUB  = 7;
    const FONT_MIN  = 22;
    const SHADOW_DY = 6;

    // 텍스트 폭 측정 — perf-07: GameObject(Text) 생성/파괴 대신 캐시된 2D 캔버스
    //   ctx.measureText 사용 (fit 루프당 최대 ~44회 텍스처 churn 제거).
    //   Phaser Text 는 width 에 strokeThickness 가 더해지므로 동일 보정(+strokePx) 적용.
    const measureCtx = this._getTextMeasureCtx();
    const measure = (txt, fontPx, strokePx) => {
      if (!measureCtx) return txt.length * fontPx * 0.5;   // 폴백(저빈도) — 대략적 폭
      measureCtx.font = `${fontPx}px ${TITLE_FONT_STACK}`;
      return measureCtx.measureText(txt).width + strokePx;
    };

    // 폰트를 2px 단계로 줄여 MAX_W 안에 fit 시키는 헬퍼.
    //   stroke 도 비율 유지하며 함께 축소 → 작은 폰트에 큰 stroke 가 글자를 먹는 현상 방지.
    const fitFont = (txt, basePx, baseStrokePx) => {
      const ratio = baseStrokePx / basePx;
      let px = basePx;
      let stroke = baseStrokePx;
      // 최대 22회 시도 (64→20)
      for (let i = 0; i < 22; i++) {
        if (measure(txt, px, stroke) <= MAX_W) return { px, stroke };
        if (px <= FONT_MIN) break;
        px -= 2;
        stroke = Math.max(3, Math.round(px * ratio));
      }
      return { px: Math.max(FONT_MIN, px), stroke };
    };

    // 1행에 그대로 들어가는지 검사
    if (measure(text, FONT_MAIN, STROKE_MAIN) <= MAX_W) {
      this._buildLineAt(container, text, color, FONT_MAIN, STROKE_MAIN, 0, SHADOW_DY);
      return;
    }

    // 2행 분할 시도
    const [line1, line2] = this._splitTitleText(text);

    // 분할 불가 (단어 1개 등) → 1행 폰트만 축소
    if (!line2) {
      const { px, stroke } = fitFont(text, FONT_MAIN, STROKE_MAIN);
      this._buildLineAt(container, text, color, px, stroke, 0, SHADOW_DY);
      return;
    }

    // 2행 렌더 — 메인(상)/서브(하). 각 라인 독립 fit.
    const main = fitFont(line1, FONT_MAIN, STROKE_MAIN);
    const sub  = fitFont(line2, FONT_SUB,  STROKE_SUB);
    // 행 간격 — 메인 높이 절반 + 서브 높이 절반 + gap
    const LINE_GAP = 2;
    const line1Y = -(sub.px / 2 + LINE_GAP);
    const line2Y =  (main.px / 2 - 4);
    this._buildLineAt(container, line1, color, main.px, main.stroke, line1Y, SHADOW_DY);
    this._buildLineAt(container, line2, color, sub.px,  sub.stroke,  line2Y, Math.max(3, SHADOW_DY - 2));
  }

  // 한 줄(shadow + main 레이어)을 컨테이너에 추가.
  _buildLineAt(container, text, color, fontPx, strokePx, y, shadowDy) {
    const shadow = this.add.text(0, y + shadowDy, text, {
      fontFamily: TITLE_FONT_STACK,
      fontSize: `${fontPx}px`,
      color: '#000000',
      stroke: '#000000',
      strokeThickness: strokePx + 2,
      align: 'center',
    }).setOrigin(0.5).setAlpha(0.55);
    container.add(shadow);

    const t = this.add.text(0, y, text, {
      fontFamily: TITLE_FONT_STACK,
      fontSize: `${fontPx}px`,
      color: color || '#ffffff',
      stroke: '#0a2855',
      strokeThickness: strokePx,
      align: 'center',
    }).setOrigin(0.5);
    t.setShadow(0, 4, '#000000', 12, true, true);
    container.add(t);
    return { shadow, main: t };
  }

  // 영문 BG 이름을 자연스러운 2행으로 분할 — 선호 순위: ' / ', ' — ', ', ', 가운데 공백.
  _splitTitleText(text) {
    const tryAt = (sep) => {
      const i = text.indexOf(sep);
      if (i > 0) return [text.slice(0, i).trim(), text.slice(i + sep.length).trim()];
      return null;
    };
    return (
      tryAt(' / ')
      || tryAt(' — ')
      || tryAt(' - ')
      || (() => {                                 // ", " 마지막 발생 위치 선호 ("xxx, yyy" 패턴)
        const i = text.lastIndexOf(', ');
        return i > 0 ? [text.slice(0, i).trim(), text.slice(i + 2).trim()] : null;
      })()
      || (() => {                                 // 중앙에 가장 가까운 공백
        const mid = Math.floor(text.length / 2);
        let best = -1, bestDist = Infinity;
        for (let i = 0; i < text.length; i++) {
          if (text[i] === ' ') {
            const d = Math.abs(i - mid);
            if (d < bestDist) { bestDist = d; best = i; }
          }
        }
        return best > 0 ? [text.slice(0, best).trim(), text.slice(best + 1).trim()] : null;
      })()
      || [text, '']
    );
  }

  // 낚시터 id → 영문 표기 (타이틀바 표시용).
  _locationDisplayNameEn(loc) {
    const id = loc?.id || this.location;
    // 계획(BG_NAMES) 매칭 — id 는 backward-compat, 표시명만 계획 반영.
    const map = {
      beach:    'South Sea of Korea',         // BG_01
      hongkong: 'Jeju Volcanic Coast',        // BG_02
      glacier:  'Hokkaido Cold Waters',       // BG_03
    };
    return map[id] || loc?.name || 'Fishing Spot';
  }

  // 2초 후 부드럽게 fade-out. 기존 tween/timer 가 있으면 취소 후 재예약.
  _scheduleLocationLabelHide() {
    if (this._locationLabelHideTimer) { this._locationLabelHideTimer.remove(); this._locationLabelHideTimer = null; }
    if (this._locationLabelFadeTween) { this._locationLabelFadeTween.stop(); this._locationLabelFadeTween = null; }
    const label = this._locationLabel;
    if (!label) return;
    label.setAlpha(1);
    this._locationLabelHideTimer = this.time.delayedCall(2000, () => {
      if (!this._locationLabel) return;
      this._locationLabelFadeTween = this.tweens.add({
        targets: this._locationLabel,
        alpha: 0,
        duration: 350,
        ease: 'Sine.InOut',
      });
    });
  }

  // (제거됨) glacier 전용 ◀▶ BG 프리뷰 슬라이드 도구 — _buildBgPreview/_buildBgPreviewList/_swapBgPreview.
  //   스테이지 실제 배경을 덮어써 3번 스테이지가 엉뚱한 배경으로 뜨던 문제 + 좌우 슬라이드 UI 제거.

  // ─── 해파리 부유 장식 (감상용 — 사용자 요청) ───
  //   위에서 본 맥동 해파리가 물속을 천천히 부유 + 상하 bob. 잡히지 않음.
  //   fish(7) 뒤 depth(jelly=4) + 반투명으로 배경 물에 녹아듦. 좌우 wrap 순환.
  _buildJellyfish(W) {
    this.jellyfish = [];
    if (!this.textures.exists('sprite_jellyfish')) return;   // 자산 누락 방어
    const sh = this.scale.height;
    const yTop = 150;
    const yBottom = Math.round(sh * 0.55);
    // 사용자 요청: 너무 많지 않게 — 화면당 1~2마리만.
    const COUNT = Phaser.Math.Between(1, 2);
    for (let i = 0; i < COUNT; i++) {
      const j = this.add.sprite(
        Phaser.Math.Between(40, W - 40),
        Phaser.Math.Between(yTop, yBottom),
        'sprite_jellyfish', Phaser.Math.Between(0, 5),
      );
      j.setDepth(DEPTH.jelly);
      j.setAlpha(0.3);   // 사용자 요청: 투명도 70% (불투명도 30%)
      // 셀 328 기준 0.26~0.46 → 약 85~150px, 개체별 크기 다양화.
      j.setScale(Phaser.Math.FloatBetween(0.26, 0.46));
      if (this.anims.exists('jellyfish_pulse')) {
        j.play('jellyfish_pulse');
        j.anims.timeScale = Phaser.Math.FloatBetween(0.3, 0.5);   // 더 느린 맥동 (사용자 요청)
      }
      // 부유 파라미터 — 사용자 요청: 아주 천천히.
      j._driftX  = Phaser.Math.FloatBetween(2, 5) * (Math.random() < 0.5 ? -1 : 1);
      j._bobAmp  = Phaser.Math.FloatBetween(8, 16);
      j._bobFreq = Phaser.Math.FloatBetween(0.2, 0.4);
      j._bobT    = Math.random() * Math.PI * 2;
      j._baseY   = j.y;
      this.jellyfish.push(j);
    }
  }

  // 매 프레임 — 수평 drift + 상하 sin bob + 화면 밖 좌우 wrap.
  _updateJellyfish(dt) {
    if (!this.jellyfish?.length) return;
    const W = this.scale.width;
    const sh = this.scale.height;
    for (const j of this.jellyfish) {
      j.x += j._driftX * dt;
      j._bobT += dt * j._bobFreq;
      j.y = j._baseY + Math.sin(j._bobT) * j._bobAmp;
      const margin = j.displayWidth * 0.5 + 40;
      if (j._driftX > 0 && j.x > W + margin) {
        j.x = -margin;
        j._baseY = Phaser.Math.Between(150, Math.round(sh * 0.55));
      } else if (j._driftX < 0 && j.x < -margin) {
        j.x = W + margin;
        j._baseY = Phaser.Math.Between(150, Math.round(sh * 0.55));
      }
    }
  }

  // ─── 어종 검증 모드 (사용자 요청: 빙하에서 전 어종 점검) ───
  //   lazy 정책상 빙하엔 일부 시트만 로드됨 → 전 어종 시트를 추가 로드/등록한 뒤
  //   spawner 를 round-robin(교대) 검증 모드로 시작. 15마리 cap 유지.
  //   미존재 시트(예: yellow_tang.webp 없음)는 loaderror 로 skip → _spriteReady 가 자동 제외.
  _startSpeciesVerification() {
    const allIds = FISH_SPECIES.map((f) => f.id);
    const begin = () => {
      // 로드된 시트의 anim 등록 (LocationLoaderScene 와 동일 정책).
      for (const [animKey, def] of Object.entries(ANIMATIONS)) {
        if (this.anims.exists(animKey)) continue;
        if (!this.textures.exists(def.spriteKey)) continue;
        this.anims.create({
          key: animKey,
          frames: this.anims.generateFrameNumbers(def.spriteKey, { frames: def.frames }),
          frameRate: def.frameRate,
          repeat:    def.repeat,
        });
      }
      // 신규 5종 atlas bleed 방지 — NEAREST filter (mipmap 비활성).
      //   verify 모드는 전 어종 spawn 하므로 LocationLoaderScene 와 동일 처리 필요.
      ['sprite_cutlasfish','sprite_flounder','sprite_marbledsole','sprite_mullet','sprite_whiting']
        .forEach((k) => { if (this.textures.exists(k)) this.textures.get(k).setFilter(Phaser.Textures.FilterMode.NEAREST); });
      this.spawner.enableVerifyMode(allIds);
      this.spawner.start();
      this.spawner.warmup();
    };
    // 미로드 시트(전 어종) 산출 → 로드. 파일 없는 시트는 loaderror 후에도 complete 발생.
    const needed = [...new Set(FISH_SPECIES.map((f) => f.sprite).filter(Boolean))];
    const toLoad = needed.filter((k) => ASSETS_SPRITESHEETS[k] && !this.textures.exists(k));
    if (toLoad.length === 0) { begin(); return; }
    for (const k of toLoad) {
      const d = ASSETS_SPRITESHEETS[k];
      this.load.spritesheet(k, d.path, { frameWidth: d.frameWidth, frameHeight: d.frameHeight });
    }
    this.load.once('complete', begin);
    this.load.start();
  }

  // ─── 상단 HUD 1행: lives | star+xp | coin ───
  // 자산 비율: lives 4.86:1, xp 4.93:1, coin 4.34:1, star 1:1
  _buildTopHUDRow(W) {
    const cy = LAYOUT.hudBarY;
    const pad = LAYOUT.outerPad;
    const leftW  = LAYOUT.hudLeftW;
    const rightW = LAYOUT.hudRightW;

    // 좌측: lives bar
    const livesCx = pad + leftW / 2;
    const lives = placeByWidth(this, 'hud_lives_bar', livesCx, cy, leftW);
    lives.setDepth(DEPTH.hud);
    this._fillHearts(lives, 4);

    // lives bar 아래 "Next life in" 라벨 — 작은 어두운 막대 배경 위에 텍스트
    // bar_progress 자산을 백킹으로 활용 (자체 비율 4.93:1, 좁고 긴 막대 모양)
    // 사용자 요청: 이 정보 패널 박스는 하트박스(hud_lives_bar) 뒷 레이어에 표시
    //   → bg 와 text 둘 다 hud-1 / hud 로 설정 (lives bar 는 hud 라 위에 옴)
    const nextLifeBg = placeByWidth(this, 'bar_progress', livesCx, LAYOUT.nextLifeY,
      leftW * 0.9);
    nextLifeBg.setDepth(DEPTH.hud - 2);
    const nextLife = strokeText(this, livesCx, LAYOUT.nextLifeY,
      'Next life in: 18m 24s', FONT.size.sm,
      { color: '#ffd147', strokeColor: COLORS.textStroke, strokeWidth: 3 });
    centerInBox(nextLife, 0.5);
    nextLife.setDepth(DEPTH.hud - 1);

    // 우측: coin bar
    const coinCx = W - pad - rightW / 2;
    const coinBar = placeByWidth(this, 'hud_coin_bar', coinCx, cy, rightW);
    coinBar.setDepth(DEPTH.hud);
    // HUD 의 코인 표시 — this.profile.gold 만 표시 (in-place 갱신됨, 코드 리뷰 9-2)
    this.scoreText = strokeText(this, coinBar.x + rightW * 0.10, coinBar.y,
      `${(this.profile?.gold ?? 0).toLocaleString()}`,
      FONT.size.lg,
      { color: COLORS.textWhite, strokeColor: COLORS.textStroke, strokeWidth: 4 });
    centerInBox(this.scoreText, 0.5);
    this.scoreText.setDepth(DEPTH.hud + 1);

    // 가운데: 별 + XP 막대
    const midLeft  = pad + leftW + 4;
    const midRight = W - pad - rightW - 4;

    const barH = lives.displayHeight;
    const starSize = Math.round(barH * LAYOUT.hudStarSizeFactor);
    // 별을 lives bar 의 (+) 와 시각적 분리 + 막대 줄보다 약간 위로 (꼭지점 위 솟음)
    const starCx = midLeft + 24 + starSize / 2;
    const starCy = cy - 8;   // 별 자체를 8px 위로
    const star = placeContained(this, 'hud_star', starCx, starCy, starSize, starSize);
    star.setDepth(DEPTH.hud + 1);
    // 별 안 숫자는 별의 시각 중심 (별의 정사각형 중심보다 약간 아래) 으로
    const lvlTxt = strokeText(this, star.x, star.y + starSize * 0.06, `${this.profile?.level ?? 1}`,
      Math.round(starSize * 0.40),
      { color: COLORS.textWhite, strokeColor: '#a35a00', strokeWidth: 4 });
    centerInBox(lvlTxt, 0.5);
    lvlTxt.setDepth(DEPTH.hud + 2);

    // XP 막대 — 별이 막대 좌측 끝을 hudStarXpOverlap 만큼 덮도록
    const xpBarLeft  = star.x + starSize / 2 - LAYOUT.hudStarXpOverlap;
    const xpBarBoxW  = midRight - xpBarLeft;
    const xpBarCx    = xpBarLeft + xpBarBoxW / 2;
    const xpBar = placeByWidth(this, 'bar_progress', xpBarCx, cy, xpBarBoxW);
    xpBar.setDepth(DEPTH.hud);   // 막대는 hud, 별은 hud+1 → 별이 막대 위로 자연스럽게 겹침
    this.xpText = strokeText(this, xpBar.x, xpBar.y,
      `${this.profile?.xp ?? 0} / 1000`, FONT.size.sm,
      { color: COLORS.textWhite, strokeColor: COLORS.textStroke, strokeWidth: 3 });
    centerInBox(this.xpText, 0.5);
    this.xpText.setDepth(DEPTH.hud + 1);
  }

  /** lives 막대 안에 빨간 하트를 N개 채워 그림.
   *  자산 그리드 측정으로 정확한 슬롯 cx: 13%, 27%, 42%, 57%, 71%
   *  → innerLeft = 5.75%, innerRight = 78.25%, slotW = 14.5%
   */
  _fillHearts(barImg, filled) {
    const b = getDisplayBounds(barImg);
    const slots = 5;
    const innerLeft  = b.left + b.w * 0.0575;
    const innerRight = b.left + b.w * 0.7825;
    const slotW = (innerRight - innerLeft) / slots;
    for (let i = 0; i < filled; i++) {
      const hx = innerLeft + slotW * (i + 0.5);
      const heart = placeContained(this, 'hud_heart', hx, barImg.y, slotW * 0.80, b.h * 0.78);
      heart.setDepth(DEPTH.hud + 1);
    }
  }

  // ─── 2차 줄: 퀘스트 보드 (좌) + RANK/MENU (우) ───
  _buildSecondRow(W) {
    const cy = LAYOUT.secondRowY;
    const pad = LAYOUT.outerPad;

    // 퀘스트 보드 — UI_17 자산 자체에 클립보드 + "6/10" 막대까지 포함
    // (추가 텍스트 overlay 없음). 보드 폭은 LAYOUT.questBoardWidth 로 축소
    const boardW = LAYOUT.questBoardWidth;
    const boardCx = pad + boardW / 2;
    const board = placeByWidth(this, 'hud_quest_board', boardCx, cy, boardW);
    board.setDepth(DEPTH.hud);

    // 우측: MENU 위 + RANK 아래 (세로 스택, 동일 cx)
    const btnSize = 80;
    const btnCx = W - pad - btnSize / 2;
    const menuCy = LAYOUT.menuY;
    const rankCy = menuCy + btnSize + LAYOUT.rankMenuGap;
    const menu = placeContained(this, 'btn_menu', btnCx, menuCy, btnSize, btnSize);
    const rank = placeContained(this, 'btn_rank', btnCx, rankCy, btnSize, btnSize);
    menu.setDepth(DEPTH.cast); rank.setDepth(DEPTH.cast);
    // 사용자 요청 (임시): MENU 버튼 → 종료 화면 (ResultScene) 으로 이동.
    this._makeClickable(menu, () => this._endMatch());
    this._makeClickable(rank, () => this._toast('RANK (TODO)'));

    // ─── 사용자 요청: RANK 아래에 사운드 ON/OFF 토글 버튼 ───
    const soundCy = rankCy + btnSize + LAYOUT.rankMenuGap;
    this._buildSoundToggleButton(btnCx, soundCy, btnSize);
  }

  /**
   * 사운드 ON/OFF 토글 버튼 — RANK 버튼 아래.
   *   - MENU/RANK 와 동일 크기(80px) 의 원형 배경 + 사운드 아이콘.
   *   - localStorage 에 mute 상태 저장 → 다음 세션에도 유지.
   *   - 클릭 시 this.sound.mute 토글 (Phaser 전역 sound manager).
   */
  _buildSoundToggleButton(cx, cy, size) {
    const KEY = 'fishing_sound_muted';
    let muted = false;
    try { muted = localStorage.getItem(KEY) === '1'; } catch (_) {}
    // 게임 시작 시 저장된 상태 적용
    if (this.sound) this.sound.mute = muted;

    // 원형 배경 (MENU/RANK 와 동일한 파란 톤)
    const r = size / 2;
    const bg = this.add.graphics();
    const drawBg = () => {
      bg.clear();
      // 외곽 stroke
      bg.lineStyle(4, 0x0a2540, 1);
      bg.fillStyle(muted ? 0x7a2a2a : 0x1d6f24, 1);   // OFF=어두운 빨강, ON=초록
      bg.fillCircle(cx, cy, r - 2);
      bg.strokeCircle(cx, cy, r - 2);
    };
    drawBg();
    bg.setDepth(DEPTH.cast);

    // 사운드 아이콘 (text — Unicode 음표/뮤트)
    const iconText = this.add.text(cx, cy, muted ? '🔇' : '🔊', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: `${Math.round(size * 0.5)}px`,
      color: '#ffffff',
    }).setOrigin(0.5);
    iconText.setDepth(DEPTH.cast + 1);

    // 클릭 처리 — 원형 영역 hit area
    bg.setInteractive(
      new Phaser.Geom.Circle(cx, cy, r - 2),
      Phaser.Geom.Circle.Contains
    );
    bg.on('pointerdown', () => {
      muted = !muted;
      if (this.sound) this.sound.mute = muted;
      try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch (_) {}
      iconText.setText(muted ? '🔇' : '🔊');
      drawBg();
      // 살짝 눌리는 tween
      this.tweens.add({
        targets: [bg, iconText],
        scaleX: { from: 0.92, to: 1 },
        scaleY: { from: 0.92, to: 1 },
        duration: 140,
        ease: 'Back.Out',
      });
    });

    this._soundToggle = { bg, iconText };
  }

  // ─── 상단 HUD 크롬 — fishing.json 레이아웃 구동, 없으면 기존 하드코드 폴백 ───
  //   공용 헬퍼(sceneChrome) + 낚시 고유: 코인/XP 라이브 참조(scoreText/xpText), MENU→매치종료, 사운드 토글.
  _buildTopChrome(W) {
    const p = this.profile || {};
    const res = buildChromeFromLayout(this, {
      cacheKey: 'layout_fishing', anchor: 'top', depth: DEPTH.hud,
      data: {
        gold:     `${(p.gold ?? 0).toLocaleString()}`,
        level:    `${p.level ?? 1}`,
        xp:       `${p.xp ?? 0} / 1000`,
        nextLife: 'Next life in: 18m 24s',
      },
      onEntries: (entries, ctx) => {
        const lives = resolveBind(entries, 'lives', () => entries.find((e) => e.node.key === 'hud_lives_bar'));
        if (lives?.primary) fillHeartsInto(this, ctx.container, lives.primary, 4);
        // _updateHUD 가 코인 텍스트를 in-place 갱신 → 바인딩 노드 참조 보관.
        this.scoreText = entries.find((e) => e.node.binding === 'gold')?.primary || null;
        this.xpText    = entries.find((e) => e.node.binding === 'xp')?.primary || null;
        const menu = resolveBind(entries, 'action:menu', () => entries.find((e) => e.node.key === 'btn_menu'));
        const rank = resolveBind(entries, 'action:rank', () => entries.find((e) => e.node.key === 'btn_rank'));
        if (menu) ctx.wire(menu, () => this._endMatch());
        if (rank) ctx.wire(rank, () => this._toast('RANK (TODO)'));
      },
      fallback: () => { this._buildTopHUDRow(W); this._buildSecondRow(W); },   // 폴백엔 사운드토글 포함됨
    });
    this._hudContainer = res ? res.container : null;
    // 사운드 토글 — 레이아웃 경로일 때만 별도 빌드(폴백 시 _buildSecondRow 가 이미 생성 → 중복 방지).
    if (res) {
      const btnSize = 80;
      const btnCx = W - LAYOUT.outerPad - btnSize / 2;
      const soundCy = LAYOUT.menuY + (btnSize + LAYOUT.rankMenuGap) * 2;
      this._buildSoundToggleButton(btnCx, soundCy, btnSize);
    }
  }

  // ─── 나무 데크 — 반응형: 화면 하단 앵커 ───
  //   user2 모드: 사용자 요청 — 패널 사이즈 축소 (이미지 1 레퍼런스).
  //   상단 아이템 행 ≈ sh-265, 하단 메뉴 행 ≈ sh-50 → 두 행 중심으로 데크 재배치.
  _buildWoodDeck(W) {
    const sh = this.scale.height;
    let deckOffsetFromBottom;
    let widthScale;
    if (this.mode === 'user2') {
      // 사용자 요청: 뒷편 나무판 확대 (1.45 scale, 1044 × 428).
      //   상향 조정된 layout: items 1015 (top 968), menus 1195 (bottom 1280)
      //   → 두 행 모두 데크에 안착. avg ≈ 1124 → sh - 156.
      deckOffsetFromBottom = 156;
      widthScale = 1.45;
    } else if (this.mode === 'user') {
      deckOffsetFromBottom = LAYOUT.deckOffsetUser;
      widthScale = LAYOUT.woodDeckWidthScale;
    } else {
      deckOffsetFromBottom = LAYOUT.deckOffsetAuto;
      widthScale = LAYOUT.woodDeckWidthScale;
    }
    const deckCy = sh - deckOffsetFromBottom;
    const deck = this.add.image(W / 2, deckCy, 'panel_wood_board');
    deck.setOrigin(0.5);
    const tex = deck.texture.getSourceImage();
    const s = (W * widthScale) / tex.width;
    deck.setScale(s);
    deck.setDepth(DEPTH.deck);
    this.deck = deck;
  }

  // ─── 물결 레이어 — 풀스크린 수면 효과 (방식 B 단독, 경량) ───
  //
  //  ADD 블렌드 caustics TileSprite 1 장만으로 "햇빛 광망이 수면에서 흐른다"
  //  인상을 가볍게 표현. WebGL 셰이더(Displacement) 사용 안 함 → WebView/
  //  저사양 디바이스 호환. caustics 텍스처는 부팅 시 Canvas 로 절차생성
  //  (외부 PNG 의존 없음).
  //
  //  + sparkle 입자 8개로 표면 반짝임만 살짝.
  _buildWaterSurface(W) {
    // 반응형: 실제 캔버스 높이 사용 (코드 리뷰 3-1)
    const H = this.scale.height;

    // 키 버전 bump — 코드 변경 시 캐시된 구 텍스처(예: cyan RGB) 자동 교체
    this._makeCausticsTexture('water_caustics_w3', 256);

    // ─── 매우 옅은 물 tint (사용자 요청: alpha 0.10) ───
    this.waterTint = this.add.rectangle(W / 2, H / 2, W + SHAKE_OVERSCAN * 2, H + SHAKE_OVERSCAN * 2, 0x0a4a85, 0.10)
      .setOrigin(0.5)
      .setDepth(DEPTH.fish + 0.5);

    // ─── 큰 광망 (사용자 요청: 큼직하게 몇 개만) ───
    //   tileScale 7.0 → 256 × 7 = 1792px (화면 폭 720 의 2.5배) → 화면당 1 미만 tile.
    //   사용자 요청 alpha 1.5 → Phaser alpha 범위 [0,1] 로 clamp 되어 1.0 (최대).
    this.caustics1 = this.add.tileSprite(W / 2, H / 2, W + SHAKE_OVERSCAN * 2, H + SHAKE_OVERSCAN * 2, 'water_caustics_w3')
      .setOrigin(0.5)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(1.0)
      .setDepth(DEPTH.water);
    this.caustics1.setTileScale(7.0, 7.0);

    // ─── 색상 사이클 (민트 → 황색 → 핑크 → 라벤더 → 하늘) ───
    //  과거 시도: CanvasTexture 의 픽셀 RGB 를 매 ~150ms 다시 쓰는 방식.
    //  → Phaser 3.90 의 CanvasTexture.refresh() 가 TileSprite 가 이미 바인딩한 WebGL
    //    텍스처를 무효화하지 못해 첫 RGB(민트) 가 GPU 에 캐시된 채 고정됨.
    //  현재: 캔버스는 흰색(255,255,255) + alpha 패턴만 baking 하고, 매 프레임 setTint()
    //    로 색만 바꿈. tint 는 GPU 셰이더에서 즉시 곱연산되므로 재업로드 불필요.
    this._waterPalette = [
      0x9affe0,   // 민트
      0xffe066,   // 황색 (gold)
      0xff9ec7,   // 핑크
      0xc4a8ff,   // 라벤더
      0x9ed8ff,   // 하늘
    ];
    this._waterColorTime = 0;
    this._waterColorSecPer = 8;     // 한 색 머무는 시간 (초)
    // 초기 tint = 팔레트[0] (캔버스가 흰색이라 tint 없으면 흰 caustics 가 보임)
    this.caustics1.setTint(this._waterPalette[0]);

    // sparkle 입자 — ADD 블렌드, 깜빡임 tween
    this.shimmers = [];
    for (let i = 0; i < 8; i++) {
      const sx = Phaser.Math.Between(20, W - 20);
      const sy = Phaser.Math.Between(40, H - 100);
      const s = this.add.circle(sx, sy, Phaser.Math.FloatBetween(1.0, 2.2),
        0xffffff, 0.9);
      s.setDepth(DEPTH.waterFx);
      s.setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: s,
        alpha: { from: 0, to: 1 },
        scale: { from: 0.4, to: 1.8 },
        duration: Phaser.Math.Between(1800, 3400),
        yoyo: true,
        delay: Phaser.Math.Between(0, 3000),
        repeat: -1,
        ease: 'Sine.InOut',
      });
      this.shimmers.push(s);
    }

    // 바닥에서 올라오는 물방울 emitter
    this._buildBubbleEmitters(W);
  }

  // ─── 물방울 emitter — 특정 지점 3곳에서 위로 올라옴 ───
  //  각 emitter 마다 frequency / x 좌표를 살짝 다르게 → 자연스러운 시퀀스.
  //  scale 은 작은 → 큰 (수면 가까울수록 압력 ↓ 으로 팽창하는 느낌).
  //  alpha 0.85 → 0 fade out, lifespan 끝에 자연스럽게 사라짐.
  _buildBubbleEmitters(W) {
    this._makeBubbleTexture('water_bubble', 32);

    // 반응형: 실제 화면 하단 — action layer 바로 위 (코드 리뷰 3-5)
    //   auto: deck top 약 sh-330, user: 약 sh-505. action layer 시작 위로 약 100px 여유.
    const sh = this.scale.height;
    const playBottom = (this.mode !== 'auto') ? sh - 600 : sh - 430;
    const spots = [
      { x: Math.round(W * 0.16), y: playBottom - 30, freq: 650 },
      { x: Math.round(W * 0.52), y: playBottom - 10, freq: 900 },
      { x: Math.round(W * 0.84), y: playBottom - 55, freq: 750 },
    ];

    this.bubbleEmitters = spots.map(s => {
      const e = this.add.particles(s.x, s.y, 'water_bubble', {
        lifespan:      { min: 3200, max: 4800 },
        speedY:        { min: -160, max: -110 },
        speedX:        { min:  -14, max:   14 },
        accelerationX: { min:  -10, max:   10 },
        scale:         { start: 0.18, end: 0.55 },
        alpha:         { start: 0.85, end: 0 },
        frequency:     s.freq,
        quantity:      1,
        blendMode:     Phaser.BlendModes.SCREEN,
      });
      e.setDepth(DEPTH.waterFx);
      return e;
    });
  }

  // 매 프레임 호출 — caustics 스크롤 + setTint 로 색 사이클 (GPU 셰이더에서 즉시 곱연산).
  _updateWaterSurface(dtSec) {
    if (this.gameOver) return;
    if (!this.caustics1) return;

    this.caustics1.tilePositionX += dtSec * 3.0;
    this.caustics1.tilePositionY += dtSec * 1.8;

    const palette = this._waterPalette;
    if (!palette || palette.length < 2) return;

    this._waterColorTime += dtSec;

    // ARCH-12: 색 lerp/setTint 는 8s/색 으로 매우 느려 매 프레임 재계산이 불필요.
    //   ~10Hz(0.1s) 로 throttle — 스크롤은 위에서 매 프레임 유지하므로 시각 차이 없음.
    this._waterTintAccum = (this._waterTintAccum ?? Infinity) + dtSec;
    if (this._waterTintAccum < 0.1) return;
    this._waterTintAccum = 0;

    // 팔레트 간 lerp → 현재 RGB 계산
    const per = this._waterColorSecPer;
    const cycleLen = per * palette.length;
    const tNorm = (this._waterColorTime % cycleLen) / per;
    const i0 = Math.floor(tNorm) % palette.length;
    const i1 = (i0 + 1) % palette.length;
    const f  = tNorm - Math.floor(tNorm);
    const c0 = palette[i0];
    const c1 = palette[i1];
    const r = Math.round(((c0 >> 16) & 0xff) * (1 - f) + ((c1 >> 16) & 0xff) * f);
    const g = Math.round(((c0 >>  8) & 0xff) * (1 - f) + ((c1 >>  8) & 0xff) * f);
    const b = Math.round(( c0        & 0xff) * (1 - f) + ( c1        & 0xff) * f);
    this.caustics1.setTint((r << 16) | (g << 8) | b);
  }

  // ─── 절차생성 텍스처 ───
  // 코스틱 (광망) — 간섭 sin 패턴을 sharpen → 밝은 그물망 + alpha 매핑.
  // 매 호출 시 강제 재생성. alpha 패턴 + ImageData + canvas reference 를 저장해두면
  // _recolorCaustics 가 RGB 만 다시 써서 색 변화를 직접 baking 할 수 있다.
  _makeCausticsTexture(key, size) {
    // perf-02/perf-09: 256×256(65k px) sin 루프는 비용이 크므로 1회만 생성·캐시.
    //   키가 이미 존재하면(이전 매치 진입 시 생성) 재사용 → create() 핫패스에서 재생성 금지.
    if (this.textures.exists(key)) return;
    const canvas = this.textures.createCanvas(key, size, size);
    if (!canvas) return;
    const ctx = canvas.getContext();
    const img = ctx.createImageData(size, size);
    const TWO_PI = Math.PI * 2;
    const alphaArr = new Uint8ClampedArray(size * size);

    // 흰색 baking — tint 가 곱연산(GPU)이라 캔버스는 R=G=B=255 로 두고 tint 로 채색.
    //   alpha 패턴만 캔버스에 남으면 어떤 tint 색이든 정확히 재현됨.
    const R0 = 0xff, G0 = 0xff, B0 = 0xff;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size * TWO_PI;
        const v = y / size * TWO_PI;
        const a = Math.sin(u * 1 + v * 1) * Math.sin(u * 2 - v * 1);
        const b = Math.sin(u * 2 + v * 1 + 1.7) * Math.sin(u * 1 - v * 2 + 2.3);
        const c = Math.sin(u * 1 + v * 2 + 3.1) * Math.sin(u * 2 - v * 2 + 0.9);
        let intensity = Math.max(0, (a + b + c) / 3);
        intensity = Math.pow(intensity, 2.6);
        const alpha = Math.min(255, Math.round(intensity * 360));
        const i = y * size + x;
        alphaArr[i] = alpha;
        const idx = i * 4;
        img.data[idx]     = R0;
        img.data[idx + 1] = G0;
        img.data[idx + 2] = B0;
        img.data[idx + 3] = alpha;
      }
    }
    ctx.putImageData(img, 0, 0);
    canvas.refresh();
    // 색 사이클은 TileSprite.setTint() 가 담당 → alpha 패턴/ImageData 보존 불필요.
  }

  // 물방울 — Canvas 로 절차생성. 옅은 흰 원 + 테두리 + 좌상단 하이라이트.
  _makeBubbleTexture(key, size) {
    // perf-09: shutdown 에서 더 이상 제거하지 않으므로 존재 시 재사용 (1회 생성·캐시).
    if (this.textures.exists(key)) return;
    const canvas = this.textures.createCanvas(key, size, size);
    if (!canvas) return;
    const ctx = canvas.getContext();
    const cx = size / 2, cy = size / 2;
    const r = size / 2 - 2;

    // 본체 — 매우 투명한 흰
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.20)';
    ctx.fill();

    // 테두리 — 살짝 진한 흰 (물 방울 윤곽)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 메인 하이라이트 — 좌상단 빛 반사
    ctx.beginPath();
    ctx.arc(cx - r * 0.35, cy - r * 0.35, r * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.90)';
    ctx.fill();

    // 보조 하이라이트 — 우하단 작은 점
    ctx.beginPath();
    ctx.arc(cx + r * 0.30, cy + r * 0.40, r * 0.10, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.50)';
    ctx.fill();

    canvas.refresh();
  }

  // ─── 액션 레이어 — 반응형: 화면 하단 앵커 (LAYOUT 상수, 코드 리뷰 4-1) ───
  _buildActionLayer(W) {
    const sh = this.scale.height;
    const isUser = (this.mode !== 'auto');
    const isU2 = this.mode === 'user2';
    // user2 — 사용자 요청 (메뉴 확대 + 상향): 메뉴를 위로 올리려면 CAST/아이템도 함께 50px 상향.
    //   gauge → CAST 간격 (115px) 은 그대로 유지 → 시각적 일관성.
    const meterCy = sh - (isU2 ? 410 : (isUser ? LAYOUT.meterOffsetUser : LAYOUT.meterOffsetAuto));
    const castCy  = sh - (isU2 ? 295 : (isUser ? LAYOUT.castOffsetUser  : LAYOUT.castOffsetAuto));
    const sideCy  = sh - (isU2 ? 265 : (isUser ? LAYOUT.sideOffsetUser  : LAYOUT.sideOffsetAuto));

    // 텐션 게이지 — CAST 보다 위쪽에 + 뒤로
    const meter = placeContained(this, 'meter_tension', W / 2, meterCy,
      460, 200);
    meter.setDepth(DEPTH.meter);
    this.meter = meter;

    // 바늘 — 호의 기하학적 중심에서 반경 R 로 회전하며, 보이는 화살표는 호 끝에 작게.
    //   - 게이지 이미지 분석: 호 3점(12시·9시·3시) 으로 푼 원의 중심이
    //     meter.y + dH×0.635, 반경 R = dH×1.026 (이미지 외부, 게이지 아래).
    //   - 보이는 화살표는 dH×0.35 (작게). 원점(origin)을 sprite 아래로 확장하여
    //     "보이지 않는 회전팔" 이 R 까지 닿게 함 → origin_y = R/visible ≈ 2.93.
    //   - rotation=0 일 때 화살표 끝(sprite 위쪽)이 호 상단(GOOD CATCH) 안쪽에 정렬.
    if (this.textures.exists('meter_needle')) {
      const dH = meter.displayHeight;
      const PIVOT_OFFSET = 0.635;   // 호 중심 (meter.y 기준 dH 비율)
      const ARM_FRAC     = 0.92;    // 회전 반경 — 색깔 띠 안쪽에 머물도록 외곽 1.026 보다 축소
      const VISIBLE_FRAC = 0.35;    // 보이는 화살표 길이 (dH 비율)

      const needle = this.add.image(meter.x, meter.y + dH * PIVOT_OFFSET, 'meter_needle');
      const needleScale = (dH * VISIBLE_FRAC) / Math.max(1, needle.height);
      needle.setScale(needleScale);
      // origin (0.5, ARM/VISIBLE) → 회전축이 sprite 아래로 (ARM/VISIBLE − 1) sprite-height 확장
      needle.setOrigin(0.5, ARM_FRAC / VISIBLE_FRAC);
      needle.setDepth(DEPTH.meter + 1);
      needle.setVisible(true);
      this.needle = needle;
    }
    // swing 상태
    this._needleT = 0;
    this._needleValue = 0;     // -1 ~ +1 (좌측~우측)
    this._needleActive = false;

    // CAST 버튼 — 사용자 요청: CRAFT panel 아래 레이어로 (panel 이 CAST 하단 일부를 덮음)
    // CAST 버튼 — 4프레임 spritesheet (idle → 살짝 → 중간 → 풀 press)
    // press_down 애니: 짧은 탭이면 0→3 빠르게 후 자동 press_up (튀어남)
    // hold 시 frame 3 정지, release 시 press_up (3→0) 재생
    const cast = this.add.sprite(W / 2, castCy, 'sprite_castbtn', 0);
    cast.setDepth(DEPTH.castBtn);
    // 시트 256×256 cell → 화면 250×250 박스에 맞춰 scale (코드 리뷰 4-3 단순화)
    const CAST_DISPLAY_SIZE = 250;
    cast.setScale(CAST_DISPLAY_SIZE / 256);
    this.castBtn = cast;
    cast.setInteractive({ useHandCursor: true });

    const SWING_AMP_FOR_SHOOT = Math.PI / 3;   // needle 각도 → 발사 각도 매핑 (±60°)
    cast.on('pointerdown', () => {
      this._setTap(true);
      this._castPressStart = this.time?.now ?? 0;
      if (this.anims.exists('castbtn_press_down')) {
        cast.play('castbtn_press_down');
      }
      // 유저 모드 II — 분기:
      //   (a) 미끼에 PECKING fish 가 있으면 catch 시도 (현재 needle 값으로 판정)
      //   (b) 그 외엔 발사/회수 — needle 값을 발사 각도로 변환
      //   needle 0 = 위쪽(-π/2), needle ±1 = ±60° 기울어진 위쪽.
      if (this.mode === 'user2') {
        const targeting = this.hook?.targetedBy;
        // 우선순위 1: PECKING 중 fish 가 있으면 catch 시도 (needle 중앙 → DASHING → HOOKED)
        if (targeting && targeting.state === FISH_STATE.PECKING) {
          this._user2TryCatch(targeting);
        } else if (this.hook?.user2Shoot) {
          // 사용자 요청: 실패 직후 1초 쿨다운 — AIM 상태 + 쿨다운 > 0 이면 발사 차단.
          if (this.hook.state === HOOK_STATE.USER2_AIM
              && (this._castCooldownTimer ?? 0) > 0) {
            this._toast('잠시 대기...');
            return;
          }
          // 우선순위 2: 발사 / 회수
          //   BUG-01: AIM(발사 시작)일 때만 비용 차감 — 부족하면 발사 차단(미차감).
          //   회수(FLY/REEL 등 비-AIM)는 비용 없음 → 그대로 진행.
          if (this.hook.state === HOOK_STATE.USER2_AIM) {
            if (!this._payCastCost()) return;
          }
          const angle = -Math.PI / 2 + (this._needleValue ?? 0) * SWING_AMP_FOR_SHOOT;
          this.hook.user2Shoot(angle);
        }
      }
    });
    const releaseCast = () => {
      if (!this._castPressStart) return;
      this._setTap(false);
      this._castPressStart = 0;
      if (this.anims.exists('castbtn_press_up')) {
        cast.play('castbtn_press_up');
      }
      if (this.mode === 'user2' && this.hook?.user2Stop) {
        this.hook.user2Stop();
      }
    };
    // pointerup / pointercancel 만 release 로 인정.
    // pointerout 은 finger 가 hit area 살짝 벗어나도 발생 → 사용자 의도 hold 가 끊김.
    //   user2 모드에서 hold 가 핵심 메카닉이므로 pointerout 무시.
    cast.on('pointerup',     releaseCast);
    cast.on('pointercancel', releaseCast);
    cast.on('pointerupoutside', releaseCast);
    // 전역 — 화면 어디서 손가락 떼도 인식 (모바일 안정성)
    this.input.on('pointerup', releaseCast);

    // 사이드 아이콘 — user2 모드는 4개 (미끼/낚시줄/릴/낚시대), 그 외는 기존 2개.
    if (this.mode === 'user2') {
      // 사용자 요청 (이미지 레퍼런스): CAST 양옆에 2개씩 = 총 4개.
      //   각 아이콘은 나무 타일 프레임 (UI_37) 안에 들어감.
      //   화면 폭 720, CAST 250 → 양옆 235px 안에 (tile×2 + gap×2) 들어가야 함.
      const tileSize = 95;
      const iconSize = tileSize * 0.72;   // 타일 안쪽 안전 영역에 아이콘 contained
      const gap = 6;
      const castHalfW = (cast.displayWidth ?? 250) / 2;
      const leftBaseX = cast.x - castHalfW - 12;
      const rightBaseX = cast.x + castHalfW + 12;
      // 와이어프레임 #1 (ItemPopupScene) 직접 진입 — slot id 와 매핑.
      const items = [
        { key: 'icon_item_bait', side: 'left',  order: 0, label: '미끼',   slot: 'bait' },
        { key: 'icon_item_line', side: 'left',  order: 1, label: '낚시줄', slot: 'line' },
        { key: 'icon_item_reel', side: 'right', order: 0, label: '릴',     slot: 'reel' },
        { key: 'icon_item_rod',  side: 'right', order: 1, label: '낚시대', slot: 'rod'  },
      ];
      for (const it of items) {
        const offset = (tileSize + gap) * it.order;
        const cx = it.side === 'left'
          ? leftBaseX - tileSize / 2 - offset
          : rightBaseX + tileSize / 2 + offset;
        // 나무 타일 프레임 (배경)
        const frame = placeContained(this, 'tile_frame_a', cx, sideCy, tileSize, tileSize);
        frame.setDepth(DEPTH.cast);
        // 아이콘 (프레임 안쪽 중앙)
        const icon = placeContained(this, it.key, cx, sideCy, iconSize, iconSize);
        icon.setDepth(DEPTH.cast + 1);
        // 클릭 → ItemPopupScene 직접 launch (와이어프레임 #1).
        //   FishingScene 은 동작 중인 상태로 유지. 팝업이 닫히면 별도 갱신 불필요.
        this._makeClickable(frame, () => {
          this.scene.launch('ItemPopupScene', { slot: it.slot, parentSceneKey: 'FishingScene' });
        });
      }
    } else {
      // 좌측 LURES
      const sideSize = 130;
      const luresCx = LAYOUT.outerPad + sideSize / 2 + 10;
      const lures = placeContained(this, 'btn_side_lures', luresCx, sideCy,
        sideSize, sideSize);
      lures.setDepth(DEPTH.cast);
      this._makeClickable(lures, () => this._toast('LURES'));

      // 우측 RODS
      const rodsCx = W - LAYOUT.outerPad - sideSize / 2 - 10;
      const rods = placeContained(this, 'btn_side_rods', rodsCx, sideCy,
        sideSize, sideSize);
      rods.setDepth(DEPTH.cast);
      this._makeClickable(rods, () => this._toast('RODS'));
    }

    // 유저 모드 II — CAST 버튼이 만들어진 후 hook 을 user2 시작 위치로 초기화.
    //   미끼 = CAST 버튼 살짝 위. 줄 출발 baseY = CAST 버튼 상단.
    if (this.mode === 'user2' && this.hook?.setUser2Mode) {
      this.hook.setUser2Mode(cast.x, cast.y - cast.displayHeight / 2);
    }
  }

  // ─── CRAFT NEW BAIT 패널 ───
  //
  //  panel body(UI_02, 902×329) 안에는 좌측 result 슬롯 + 화살표 + 하단 안내문이
  //  이미 baked-in. 그 위에 다음을 정밀 overlay:
  //   1) UI_03 "CRAFT NEW BAIT" 캡슐 — panel 상단 라인에 세로 중앙 정렬
  //   2) UI_20 ingredient 슬롯 × 10 (2 행 × 5 열) — 우측 베이지 영역에 정확 배치
  //   3) 각 슬롯에 item_* 아이콘 — 슬롯 안쪽 베이지 테두리 안 ~ 0.74 크기
  //
  //  슬롯 영역 정규화 좌표 (panel body 픽셀 좌표계, 902×329 native):
  //    x : 0.28 ~ 0.96  (화살표 오른쪽 ~ 우측 내부 테두리)
  //    y : 0.08 ~ 0.74  (상단 내부 테두리 ~ 하단 brown 안내문 위)
  _buildCraftPanel(W) {
    const panelCy = LAYOUT.craftPanelY + LAYOUT.craftPanelHeight / 2;
    const panelW  = W - 32;
    const body = placeByWidth(this, 'panel_craft_body', W / 2, panelCy, panelW);
    body.setDepth(DEPTH.panel);

    // 캡슐 — cy 가 panel 상단 라인과 일치 (절반 위, 절반 안)
    const panelTop = body.y - body.displayHeight / 2;
    const craftLabel = placeContained(this, 'btn_craft_text', W / 2, panelTop, 250, 58);
    craftLabel.setDepth(DEPTH.panelHeader);

    this._buildCraftSlots(body);
    this._buildCraftResult(body);
  }

  // 10개 ingredient 슬롯 (2 × 5) + 아이콘 정밀 배치 + 선택 인터랙션.
  //  - 클릭하면 토글 선택 (최대 5개, 외곽선 yellow stroke)
  //  - 3개 이상 선택 시 좌측 result 슬롯에 "Tap to Craft" 인디케이터 표시
  _buildCraftSlots(body) {
    const Lx = 0.28, Rx = 0.96;   // 우측 ingredient 영역 정규화 좌표
    const Ty = 0.13, By = 0.79;   // 사용자 요청: 전체 그리드 약간 아래로

    const bw = body.displayWidth;
    const bh = body.displayHeight;
    const bx = body.x;
    const by = body.y;

    const areaLeft  = bx - bw / 2 + bw * Lx;
    const areaRight = bx - bw / 2 + bw * Rx;
    const areaTop   = by - bh / 2 + bh * Ty;
    const areaBot   = by - bh / 2 + bh * By;
    const areaW = areaRight - areaLeft;
    const areaH = areaBot   - areaTop;

    const cols = 5, rows = 2;
    const colGap = 6, rowGap = 6;

    // 슬롯은 정사각형 — col / row 기준 중 작은 쪽 채택
    const slotByW = (areaW - colGap * (cols - 1)) / cols;
    const slotByH = (areaH - rowGap * (rows - 1)) / rows;
    const slotSize = Math.floor(Math.min(slotByW, slotByH));

    // 그리드 실제 폭/높이 → ingredient 영역 안에 중앙정렬
    const gridW = cols * slotSize + (cols - 1) * colGap;
    const gridH = rows * slotSize + (rows - 1) * rowGap;
    const startCx = (areaLeft + areaRight) / 2 - gridW / 2 + slotSize / 2;
    const startCy = (areaTop  + areaBot)  / 2 - gridH / 2 + slotSize / 2;

    const iconSize = Math.round(slotSize * 0.95);

    // 선택 상태 + 외곽선 트래킹
    this.craftSelected = new Set();
    this.craftSlotOutlines = [];

    CRAFT_INGREDIENTS.forEach((ing, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = startCx + col * (slotSize + colGap);
      const cy = startCy + row * (slotSize + rowGap);

      const slot = placeContained(this, 'panel_slot', cx, cy, slotSize, slotSize);
      slot.setDepth(DEPTH.panel + 1);

      const icon = placeContained(this, ing.key, cx, cy, iconSize, iconSize);
      icon.setDepth(DEPTH.panel + 2);

      // 선택 외곽선 — fill 0, 얇은 yellow stroke. 초기 숨김.
      const outline = this.add.rectangle(cx, cy, slotSize + 2, slotSize + 2, 0x000000, 0);
      outline.setStrokeStyle(2, 0xffd147, 1);
      outline.setVisible(false);
      outline.setDepth(DEPTH.panel + 3);
      this.craftSlotOutlines.push(outline);

      // 인터랙션 — 슬롯 전체 hit area (icon depth 위)
      const hit = this.add.rectangle(cx, cy, slotSize, slotSize, 0x000000, 0)
        .setDepth(DEPTH.panel + 4)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => this._toggleCraftSelect(i));
    });
  }

  // 좌측 result 슬롯 — "Tap to Craft" 인디케이터 + 클릭 시 새 아이템 생성.
  //  panel body(UI_02) 좌측 result 슬롯 정규화 좌표:
  //    x : 0.035 ~ 0.220, y : 0.105 ~ 0.685
  _buildCraftResult(body) {
    const bw = body.displayWidth, bh = body.displayHeight;
    const bx = body.x, by = body.y;
    const rLx = 0.035, rRx = 0.220;
    const rTy = 0.105, rBy = 0.685;

    const rcx = bx - bw / 2 + bw * (rLx + rRx) / 2;
    const rcy = by - bh / 2 + bh * (rTy + rBy) / 2;
    const rw  = bw * (rRx - rLx);
    const rh  = bh * (rBy - rTy);
    this._resultSlotBounds = { rcx, rcy, rw, rh };

    // "Tap to Craft" — 두 줄 텍스트, 초기 숨김
    const text = strokeText(this, rcx, rcy, 'Tap to\nCraft', FONT.size.md,
      { color: COLORS.textWhite, strokeColor: '#1a6e2a', strokeWidth: 3 });
    text.setAlign('center');
    text.setLineSpacing(2);
    centerInBox(text, 0.5);
    text.setDepth(DEPTH.panel + 5);
    text.setVisible(false);
    this.craftResultText = text;

    // 클릭 hit area — 3개 이상 선택 시 enable
    const hit = this.add.rectangle(rcx, rcy, rw, rh, 0x000000, 0)
      .setDepth(DEPTH.panel + 6);
    hit.setVisible(false);
    hit.disableInteractive();   // 코드 리뷰 9-5: 초기 명시적 비활성 (ready 시 _refreshCraftUI 가 enable)
    hit.on('pointerdown', () => this._craftCreate());
    this.craftResultHit = hit;
  }

  // ingredient 슬롯 토글 — 최대 5개
  _toggleCraftSelect(i) {
    if (this.craftSelected.has(i)) {
      this.craftSelected.delete(i);
    } else {
      if (this.craftSelected.size >= 5) {
        this._toast('Max 5 ingredients');
        return;
      }
      this.craftSelected.add(i);
    }
    this._refreshCraftUI();
  }

  // 외곽선 / Tap to Craft 인디케이터 상태 갱신
  _refreshCraftUI() {
    this.craftSlotOutlines.forEach((o, i) =>
      o.setVisible(this.craftSelected.has(i)));

    const ready = this.craftSelected.size >= 3;
    if (this.craftResultText) this.craftResultText.setVisible(ready);
    if (this.craftResultHit) {
      this.craftResultHit.setVisible(ready);
      if (ready) this.craftResultHit.setInteractive({ useHandCursor: true });
      else       this.craftResultHit.disableInteractive();
    }
  }

  // 새 아이템 생성 — 결과 슬롯에 pop-in → 1.5s 후 fade out + 선택 초기화
  _craftCreate() {
    const sel = [...this.craftSelected];
    if (sel.length < 3) return;

    const resultKey = CRAFT_INGREDIENTS[sel[sel.length - 1]].key;
    const { rcx, rcy, rw, rh } = this._resultSlotBounds;
    const iconSize = Math.min(rw, rh) * 0.78;

    const resultIcon = placeContained(this, resultKey, rcx, rcy, iconSize, iconSize);
    resultIcon.setDepth(DEPTH.panel + 7);
    const finalScale = resultIcon.scale;
    resultIcon.setScale(0);

    this.tweens.add({
      targets: resultIcon,
      scale: { from: 0, to: finalScale * 1.15 },
      duration: 220,
      ease: 'Back.Out',
      onComplete: () => {
        this.tweens.add({
          targets: resultIcon,
          scale: finalScale,
          duration: 120,
        });
      },
    });

    this._toast('+1 New Bait!');

    this.time.delayedCall(1500, () => {
      this.tweens.add({
        targets: resultIcon,
        alpha: 0,
        duration: 300,
        onComplete: () => resultIcon.destroy(),
      });
    });

    this.craftSelected.clear();
    this._refreshCraftUI();
  }

  // ─── 하단 4탭 ───
  // 각 탭 자산에 라벨 포함 → overlay 텍스트 안 함
  // ─── 하단 탭바 — fishing_tabs.json 레이아웃 구동, 없으면 기존 하드코드 폴백 ───
  _buildBottomTabsChrome(W) {
    const res = buildChromeFromLayout(this, {
      cacheKey: 'layout_fishing_tabs', anchor: 'bottom', depth: DEPTH.tabs,
      roleHandlers: {
        'action:home':    () => this._goHome(),
        'action:upgrade': () => this._toast('강화 (TODO)'),
        'action:album':   () => this._toast('도감 (TODO)'),
        'action:shop':    () => this._toast('상점 (TODO)'),
      },
      fallback: () => this._buildBottomTabs(W),
    });
    this._tabsContainer = res ? res.container : null;
  }

  // user2 모드: 홈/강화/도감/상점 4개 메뉴 아이콘 (사용자 요청 — 이미지 1 레이아웃)
  _buildBottomTabs(W) {
    // 반응형: 화면 하단 앵커 (LAYOUT 상수, 코드 리뷰 4-2)
    const sh = this.scale.height;
    const tabH = LAYOUT.bottomTabsHeight;
    const cy = sh - LAYOUT.bottomTabsOffsetFromBottom + tabH / 2;
    const pad = LAYOUT.outerPad;
    const gap = 8;

    if (this.mode === 'user2') {
      // user2 — 4 메뉴 (홈/강화/도감/상점) 각각 나무 타일 (UI_37) 안에 들어감.
      //   사용자 요청: 사이즈 확대 + 메뉴명 표시.
      const menus = [
        { key: 'icon_menu_home',    label: '홈',   onClick: () => this._goHome() },
        { key: 'icon_menu_upgrade', label: '강화', onClick: () => this._toast('강화 (TODO)') },
        { key: 'icon_menu_album',   label: '도감', onClick: () => this._toast('도감 (TODO)') },
        { key: 'icon_menu_shop',    label: '상점', onClick: () => this._toast('상점 (TODO)') },
      ];
      // 사용자 요청: 메뉴 아이콘 약간 축소 + 하단 여백 확보.
      //   tileBoxH 170 → 158 (UI_38 aspect 0.89 → visual 140×158, 약 7% 축소)
      //   menuCy sh-85 → sh-97 (위로 12px 올려 화면 하단 25px 여백 확보)
      const menuCy = sh - 95;
      const tileBoxW = 170;
      const tileBoxH = 150;          // 158 → 150 (CAST 와 미겹침 + 하단 여백 20px)
      const iconSize = 95;
      const iconYOffset = -22;       // 아이콘을 타일 상단 쪽으로
      const labelYOffset = 34;       // 사용자 요청: 아이콘-라벨 시각적 간격 축소
      const menuGap = 12;
      const sidePad = Math.max(pad, 14);
      const totalGap = menuGap * (menus.length - 1);
      const cellW = (W - sidePad * 2 - totalGap) / menus.length;
      const tileW = Math.min(tileBoxW, cellW);
      menus.forEach((m, i) => {
        const cx = sidePad + cellW / 2 + (cellW + menuGap) * i;
        // 나무 타일 프레임 (배경) — UI_38 + maxScale 1.5 → 높이 158 로 제한 → visual ≈ 140×158
        const frame = placeContained(this, 'tile_frame_b', cx, menuCy, tileW, tileBoxH, { maxScale: 1.5 });
        frame.setDepth(DEPTH.tabs);
        // 아이콘 (타일 상단) — native 105 → 95 로 살짝 축소
        const icon = placeContained(this, m.key, cx, menuCy + iconYOffset, iconSize, iconSize, { maxScale: 1.5 });
        icon.setDepth(DEPTH.tabs + 1);
        // 메뉴명 라벨 (타일 하단 부분, 박스 안) — 사용자 요청: 조금 크게 (md → lg)
        const label = strokeText(this, cx, menuCy + labelYOffset, m.label,
          FONT.size.lg,
          { color: COLORS.textWhite, strokeColor: '#5a2e0c', strokeWidth: 4 });
        centerInBox(label, 0.5);
        label.setDepth(DEPTH.tabs + 2);
        this._makeClickable(frame, m.onClick);
      });
      return;
    }

    // BOTTOM_TABS key → EquipmentScene 의 tab id 매핑.
    //   tab_baits → bait / tab_lures → lure / tab_rod_parts → rod / tab_reels → reel.
    const TAB_KEY_TO_EQUIP = {
      tab_baits:     'bait',
      tab_lures:     'lure',
      tab_rod_parts: 'rod',
      tab_reels:     'reel',
    };
    const tabW = (W - pad * 2 - gap * 3) / BOTTOM_TABS.length;
    BOTTOM_TABS.forEach((tab, i) => {
      const cx = pad + tabW / 2 + (tabW + gap) * i;
      const img = placeContained(this, tab.key, cx, cy, tabW, tabH);
      img.setDepth(DEPTH.tabs);
      if (i !== 0) img.setAlpha(0.85);   // BAITS 가 기본 활성 (legacy 시각)
      this._makeClickable(img, () => {
        const equipTab = TAB_KEY_TO_EQUIP[tab.key];
        if (equipTab) {
          this.scene.start('EquipmentScene', {
            tab: equipTab,
            returnTo: 'LocationLoaderScene',
            returnArgs: { locId: this.location, mode: this.mode, targetScene: 'FishingScene' },
          });
        } else {
          this._toast(tab.label);
        }
      });
    });
  }

  // ─── 입력 ───
  _wireInputs() {
    this.input.on('pointerdown', (p) => {
      if (this._isInPlayArea(p.x, p.y)) this._setTap(true);
    });
    this.input.on('pointerup',         () => this._setTap(false));
    this.input.on('pointerupoutside',  () => this._setTap(false));
  }

  // 반응형: 실제 캔버스 폭/높이 기준 (코드 리뷰 3-4)
  _isInPlayArea(x, y) {
    return y >= LAYOUT.playTop && y <= (this.scale.height - 100) &&
           x >= 0 && x <= this.scale.width;
  }

  _setTap(v) { this.isTapping = v; }

  _makeClickable(img, onClick) {
    img.setInteractive({ useHandCursor: true });
    img.on('pointerdown', () => {
      this.tweens.add({ targets: img, scale: img.scale * 0.94, yoyo: true, duration: 90 });
      onClick?.();
    });
  }

  _toast(msg) {
    const t = strokeText(this, this.scale.width / 2, 280, msg, FONT.size.lg,
      { color: '#ffffff', strokeColor: '#000000', strokeWidth: 4 });
    centerInBox(t, 0.5);
    t.setDepth(DEPTH.toast);
    this.tweens.add({
      targets: t, alpha: { from: 1, to: 0 }, y: t.y - 30,
      duration: 700, onComplete: () => t.destroy(),
    });
  }

  _updateHUD() {
    // HUD 는 this.profile.gold 만 표시 — addGold() 가 in-place 갱신 (코드 리뷰 9-2)
    if (this.scoreText) {
      const gold = this.profile?.gold ?? 0;
      this.scoreText.setText(`${gold.toLocaleString()}`);
    }
  }

  // ─── 게임 루프 ───
  update(timeMs, deltaMs) {
    if (this.gameOver) return;
    const dt = deltaMs / 1000;

    // 튜토리얼 단계 머신 (활성 시) — 게임 상태(hook/spawner)는 아래에서 갱신되지만,
    //   튜토리얼은 직전 프레임 상태로 안내/시연을 구동하므로 순서 무관.
    this.tutorial?.update(dt);

    // 사용자 요청 BGM: HOOKED 상태에서 music_02, 외 상태에서 music_01.
    //   매 프레임 폴링 — state 변화 시에만 crossfade 호출 (no-op 가드 내장).
    const inHooked = this.hook?.state === HOOK_STATE.HOOKED;
    if (inHooked && this._musicState !== 'fight') {
      this._musicState = 'fight';
      crossfadeMusic(this, 'music_02');
    } else if (!inHooked && this._musicState !== 'normal') {
      this._musicState = 'normal';
      crossfadeMusic(this, 'music_01');
    }

    // 릴 효과음 — HOOKED 진입 시 1 모델 랜덤 add → isTapping 시 play / 떼면 pause.
    //   HOOKED 종료 시 sound 객체 destroy.
    this._updateReelSfx(inHooked);

    this._updateWaterSurface(dt);
    this._updateJellyfish(dt);
    // 실패 후 cast 쿨다운 (사용자 요청: 누름이 끌려서 재발사되는 문제 방지).
    if ((this._castCooldownTimer ?? 0) > 0) {
      this._castCooldownTimer = Math.max(0, this._castCooldownTimer - dt);
    }
    this.hook.update(dt, this.isTapping, this.maxDepth);

    // ─── needle (게이지 바늘) 업데이트 ───
    //   3 가지 모드:
    //   A) HOOKED struggle (pulling/resisting): needle = tensionLevel × SWING_AMP
    //      → 오른쪽 끝(=+SWING_AMP)으로 가면 줄 끊김 (Hook 가 자동 감지)
    //   B) PECKING: 빠른 sin swing (입질 미니게임)
    //   C) IDLE: 느린 sin swing
    const SWING_AMP = Math.PI / 3;   // 60° in radians
    const targeting = this.hook.targetedBy;
    const peckingFish = (targeting && targeting.state === FISH_STATE.PECKING) ? targeting : null;
    const inHookedStruggle = this.hook.state === HOOK_STATE.HOOKED &&
      (this.hook._strugglePhase === 'pulling' || this.hook._strugglePhase === 'resisting');

    // user2 FLY/DECEL 중에는 needle 이 캡처된 발사 각도에 고정 (시각 피드백)
    const inUser2Fly = this.hook.state === HOOK_STATE.USER2_FLY
                    || this.hook.state === HOOK_STATE.USER2_DECEL;

    if (this.needle) {
      if (inHookedStruggle) {
        // 텐션 게이지 모드 — tension level 을 needle 위치로 직접 매핑
        this._needleValue = Math.max(-1, Math.min(1, this.hook._tensionLevel ?? 0));
        this.needle.setRotation(this._needleValue * SWING_AMP);
        this._needleActive = true;
      } else if (inUser2Fly) {
        // user2 발사 중 — needle 이 캡처된 각도에 정지 (-π/2 = 0, +π/3 = +1 ...)
        const captured = ((this.hook._u2Angle ?? -Math.PI / 2) + Math.PI / 2) / SWING_AMP;
        this._needleValue = Math.max(-1, Math.min(1, captured));
        this.needle.setRotation(this._needleValue * SWING_AMP);
        this._needleActive = false;
      } else {
        const speed = peckingFish ? 3 : 1.5;
        this._needleT += dt * speed;
        this._needleValue = Math.sin(this._needleT);
        this.needle.setRotation(this._needleValue * SWING_AMP);
        this._needleActive = !!peckingFish;
      }
    }
    // Fish 가 참조 가능하도록 hook 에 노출
    this.hook._needleValue = this._needleValue;
    this.hook._needleActive = this._needleActive;

    // ─── 끌어올림 중 잔잔한 카메라 흔들림 (사용자 요청) ───
    //   pulling: ±1.5px (가벼움), resisting: ±3px (fish 가 더 격렬히 thrash)
    //   final-pull/failed/그 외: 카메라 원위치
    if (inHookedStruggle) {
      this._reelShakeT = (this._reelShakeT ?? 0) + dt;
      const t = this._reelShakeT;
      const intensity = this.hook._strugglePhase === 'pulling' ? 1.5 : 3.0;
      this.cameras.main.setScroll(
        Math.sin(t * 35) * intensity,
        Math.cos(t * 27) * intensity * 0.5,
      );
    } else if (this._reelShakeT != null) {
      this.cameras.main.setScroll(0, 0);
      this._reelShakeT = null;
    }

    this.spawner.update(dt, this.hook);   // hook 객체 전달 (peck/dash 메카닉)

    // perf-01: 과거엔 spawner.update 후 hook 을 한 번 더 그렸으나(이중 redraw),
    //   _drawHook 는 hook 자체 좌표(this.x/y)만 사용하고 spawner.update 는 hook 위치를
    //   바꾸지 않아(Fish 는 hook.x/y 를 읽기만 함) Hook.update() 의 draw 와 동일하다.
    //   → 동일 기하 재계산을 매 프레임 제거 (auto/user 모드 wavy-line 비용 절반).

    // 사용자 요청: 물고기 위 부유 텐션 게이지 + HP 바 (PECKING/HOOKED 일 때).
    this._drawFishGauges(dt);

    // ─── struggle 실패 감지 — 사용자 요청 메카닉 ───
    // 3~4 사이클 저항 후 fish 가 풀려나가면 hook.struggleFailed=true → 정리
    if (this.hook.struggleFailed) {
      this._handleStruggleFailure();
    }

    if (this.hook.state !== HOOK_STATE.HOOKED) {
      // fish 가 자체적으로 dash 완료 → state=HOOKED 가 됐는지 확인
      for (const fish of this.spawner.getFishes()) {
        // FISH_STATE.HOOKED 진입한 fish 가 있으면 hook attach 처리
        if (fish.state === FISH_STATE.HOOKED && !fish.dead) {
          // Phase 3: rod.power 게이트 — 너무 큰 fish 면 즉시 rejection.
          //   장비 미설정(legacy) 시 hook.canHookFish 가 항상 true 반환 → 영향 없음.
          if (!this.hook.canHookFish(fish)) {
            this._onRodTooWeak(fish);
            break;
          }
          this._onHook(fish);
          break;
        }
      }
    } else {
      // 모바일 햅틱 — 파이팅(릴 감기) 중 진동 (장력 비례).
      this._updateFightHaptics(dt);

      // hook reel up — fish 머리 hook 에 매달림 + 끌려올라가면서 점진 확대.
      // hook 이 reelTopY 도달 후 showcase 진입.
      const attached = this.hook.attachedFish;
      if (attached && !attached.dead) {
        const halfH = (attached.def.size * 0.5);
        // 사용자 요청: catch 순간 frame skip 방지 — user2 는 PECKING 시 rotation 유지.
        //   auto/user 만 setRotation(0). user2 는 외부 rotation 유지.
        //   showcase 동안엔 rotation tween 이 진행되므로 매 프레임 덮어쓰기 금지.
        if (this.hook._mode !== 'user2' && !this._user2Escaping && !this._showcaseActive) {
          attached.sprite?.setRotation(0);
        }

        // attached._baseScale = 원본 scale (Fish 가 size/frameW 로 설정한 값)
        if (attached._baseScale == null && attached.sprite?.scale != null) {
          attached._baseScale = attached.sprite.scale;
        }

        // showcase 중에는 fish 가 hook 에 묶이지 않고 별도 tween 으로 이동 — 위치/스케일 업데이트 스킵.
        if (!this._showcaseActive) {
          // 끌려올라가는 동안 progressive scale (1.0x → 1.6x)
          if (attached._baseScale != null) {
            let progress;
            if (this.hook._mode === 'user2') {
              const tx = this.hook.baseX;
              const ty = this.hook._u2HookedAnchorY?.() ?? ((this.hook._baseY ?? 0) - 30);
              const dxh = tx - this.hook.x;
              const dyh = ty - this.hook.y;
              const dist = Math.sqrt(dxh * dxh + dyh * dyh);
              const init = this._user2InitDist || 500;
              progress = Math.max(0, Math.min(1, 1 - dist / init));
            } else {
              const total = (this.maxDepth - FISHING.reelTopY) || 1;
              progress = Math.max(0, Math.min(1,
                (this.maxDepth - this.hook.y) / total));
            }
            const targetScale = attached._baseScale * (1 + progress * 0.6);
            attached.sprite?.setScale(targetScale);
          }
          // ─── 위치 + 회전 (user2 HOOKED: 발버둥 wobble) ───
          //   사용자 요청: 한 방향만 바라보지 않고 방향 변경.
          //   - Base rotation: outward 방향 (CAST 반대) → fish 가 화면 위쪽 도주 자세
          //   - Wobble: sin(time × 5) × 0.35 rad (≈ ±20°) → 발버둥 시각
          //   mouth-at-tip 유지: 회전이 변해도 mouth (sprite head edge) 가 lure tip 에 고정.
          if (this.hook._mode === 'user2') {
            const tipU2 = this.hook.getLureTip?.() ?? { x: this.hook.x, y: this.hook.y };
            // outward direction
            const ox = tipU2.x - this.hook.x;
            const oy = tipU2.y - this.hook.y;
            const oMag = Math.sqrt(ox * ox + oy * oy) || 1;
            const outX = ox / oMag;
            const outY = oy / oMag;
            // base rotation — sprite head 가 outward 향함 (sin(R)=outX, cos(R)=-outY)
            const baseRot = Math.atan2(outX, -outY);
            // wobble — 발버둥 회전 (showcase / panic 중에는 적용 안 함)
            let wobble = 0;
            if (!this._showcaseActive && !this._user2Escaping) {
              this._fishWobbleT = (this._fishWobbleT ?? 0) + dt;
              wobble = Math.sin(this._fishWobbleT * 5.5) * 0.40;
            }
            attached.sprite?.setRotation(baseRot + wobble);
            // mouth-at-tip 으로 fish 위치 재계산 (회전 반영)
            const finalRot = baseRot + wobble;
            const hdx = Math.sin(finalRot);
            const hdy = -Math.cos(finalRot);
            const fhead = attached.def.size * 0.35;
            attached.x = tipU2.x - hdx * fhead;
            attached.y = tipU2.y - hdy * fhead;
          } else {
            const curScale = attached.sprite?.scaleY ?? 1;
            const visHalfH = halfH * (curScale / (attached._baseScale ?? 1));
            attached.x = this.hook.x;
            attached.y = this.hook.y + visHalfH;
          }
          attached.sprite?.setPosition(attached.x, attached.y);

          // 꼬리 fast 애니메이션 + timeScale 2x (HOOKED 시 빠르게 발버둥)
          const fastKey = `${attached.def.animKey}_fast`;
          if (attached._currentAnim !== fastKey
              && this.anims.exists(fastKey)) {
            attached.sprite?.play(fastKey);
            attached._currentAnim = fastKey;
          }
          if (attached.sprite?.anims) {
            attached.sprite.anims.timeScale = 2.0;
          }
        }
      }

      // final-pull 진입 직후 "PULL!" 플래시 (한 번만)
      // 상단 텐션 막대 제거 (사용자 요청) — needle 이 텐션 게이지 역할
      const phase = this.hook._strugglePhase;
      if (phase === 'final-pull' && !this._pullFlashed) {
        this._spawnFlashText('PULL!', '#45c34c', 72);
        this._pullFlashed = true;
      }

      // ─── showcase 단계 — 사용자 요청 ───
      //   1) hook 에서 fish 분리 (위치 tween 으로 독립 이동)
      //   2) fish 가 천천히 아래로 슬라이드 (Sine.Out, 1.2s)
      //   3) 애니메이션 timeScale 을 0.7로 감속 → 부드러운 헤엄
      //   4) 이름/크기/무게는 fish 의 최종 위치 기준으로 배치, fish 따라가며 갱신
      // showcase 가 이미 시작됐으면 isAtTop 여부와 무관하게 타이머 진행.
      //   (user2: release 로 hook 이 CAST 멀어져 isAtTop=false 되어도
      //    showcase 가 멈추지 않고 정상 완료되도록 분리.)
      if (this._showcaseActive) {
        this._showcaseTimer += dt;
        if (this._showcaseEffect && attached) {
          this._showcaseEffect.setPosition(attached.x, attached.y);
        }
        if (attached && (this._showcaseName || this._showcaseInfo)) {
          const size = attached.def.size || 80;
          const ny = attached.y - size - 30;
          this._showcaseName?.setY(ny);
          this._showcaseInfo?.setY(ny + 38);
        }
        if (this._showcaseTimer >= 1.8) {   // slide 1.2s + 표시 0.6s = 1.8s
          this._showcaseActive = false;
          this._showcaseTimer  = 0;
          this._completeCatch();
        }
      } else if (this.hook.isAtTop()) {
        this._showcaseActive = true;
        this._showcaseTimer  = 0;
        this.hook._struggleFrozen = true;
        // 잡기 성공 햅틱 — 짧은 더블 펄스.
        vibrate([0, 55, 35, 90]);
        // 사용자 요청: 가로 중앙 정렬, 세로는 화면 중앙에서 150px 위.
        const displayX = this.scale.width / 2;
        const displayY = this.scale.height / 2 - 150;
        this._showcaseDisplayY = displayY;
        // 사용자 요청: 백그라운드에 반투명 막 — 물결 바로 위, UI 아래.
        //   depth 10 = water/caustics(8)/shimmer(9) 위, deck(11)/UI/showcase fish(52) 아래.
        //   주의: Phaser rectangle 의 fillAlpha 와 gameObject alpha 가 곱연산.
        //   fillAlpha 는 1 로, gameObject alpha 를 0→0.45 tween.
        const sw = this.scale.width;
        const sh = this.scale.height;
        this._showcaseOverlay = this.add.rectangle(sw / 2, sh / 2, sw + SHAKE_OVERSCAN * 2, sh + SHAKE_OVERSCAN * 2, 0x041824, 1)
          .setOrigin(0.5)
          .setDepth(10)
          .setAlpha(0);
        this.tweens.add({
          targets: this._showcaseOverlay,
          alpha: 0.45,
          duration: 400, ease: 'Sine.Out',
        });
        if (attached?.sprite && attached._baseScale != null) {
          // rotation tween → 0 (mouth up). shortest path 보장.
          let cr = attached.sprite.rotation;
          while (cr > Math.PI)  cr -= 2 * Math.PI;
          while (cr < -Math.PI) cr += 2 * Math.PI;
          attached.sprite.rotation = cr;
          this.tweens.add({
            targets: attached.sprite,
            rotation: 0,
            duration: 600, ease: 'Sine.Out',
          });
          // scale 1.6×
          const finalScale = attached._baseScale * 1.6;
          this.tweens.add({
            targets: attached.sprite,
            scale: finalScale,
            duration: 700, ease: 'Sine.Out',
          });
          // 위치 tween → 화면 중앙 (x, y 둘 다)
          this.tweens.add({
            targets: [attached.sprite],
            x: displayX,
            y: displayY,
            duration: 1200, ease: 'Sine.Out',
          });
          this.tweens.add({
            targets: [attached],
            x: displayX,
            y: displayY,
            duration: 1200, ease: 'Sine.Out',
          });
          // 애니 timeScale 감속
          if (attached.sprite.anims) {
            attached.sprite.anims.timeScale = 0.7;
          }
        }
        this._spawnSuccessShowcase(attached, displayY);
      }
    }
  }

  // Phase 3: 낚시대 power 부족 — fish 도주 + 토스트.
  //   _onHook 와 다르게 attachFish 호출하지 않음. fish 는 자체적으로 도주 처리.
  _onRodTooWeak(fish) {
    if (!fish) return;
    fish.dead = true;        // spawner 다음 tick 에서 정리
    this.hook.targetedBy = null;
    // 텐션 sfx 컷 + 짧은 카메라 shake 로 실패감 전달.
    this.cameras.main.shake(120, 0.005);
    const rodName  = this._equippedRod?.name ?? '낚시대';
    // BUG-03: 무게는 species def 가 아닌 combat profile 에 있음(fish.def.weight 는 항상 undefined).
    //   실제 필요 power = getFishCombatProfile(id).weight (kg) → 토스트에 정확히 표기.
    const need = getFishCombatProfile(fish.def?.id)?.weight ?? 0;
    this._toast?.(`${rodName} 이 너무 약합니다! (필요 power ≥ ${Math.ceil(need)}kg)`);
    // hook 도 리셋 — 다음 캐스팅 준비.
    this.hook?.reset?.();
    // BUG-02 방어선: Fish.js 게이트가 정상 경로를 막지만, 장비 교체 등 엣지 경로로
    //   over-weight 어종이 attach 된 경우에도 긴 입질 쿨다운을 걸어 즉시 재입질을 막는다.
    this.hook?.rejectOverweightFish?.();
  }

  _onHook(fish) {
    fish.isHooked = true;
    // user2: hook 의 현재 위치 — CAST 까지 거리.
    if (this.mode === 'user2') {
      const tx = this.hook.baseX;
      const ty = this.hook._u2HookedAnchorY?.() ?? ((this.hook._baseY ?? 0) - 30);
      const dxh = tx - this.hook.x;
      const dyh = ty - this.hook.y;
      const initDist = Math.sqrt(dxh * dxh + dyh * dyh);
      this._user2InitDist = Math.max(80, initDist);
      // 사용자 요청: 가까운 곳 catch → 텐션 더 급격 (rise/drop 모두 가속).
      //   dist   0 → boost 1.50× (50% 가속)
      //   dist 150 → boost 1.23×
      //   dist 280 → boost 1.00× (가속 없음)
      this.hook._proximityTensionBoost = Math.max(1.0, Math.min(1.5, 1.5 - initDist / 560));
    }
    this.hook.attachFish(fish);
    this.hook.targetedBy = null;   // peck/dash 잠금 해제

    // 사용자 요청: HOOKED 시 fish 를 hook 보다 상위 레이어로 → hook 이 fish 뒤로 숨음
    fish.sprite?.setDepth(52);   // hook(51) 위

    // 사용자 요청: 물 splash 이펙트 임시 삭제
    // this._spawnSplash(fish);

    if (fish.sprite?.scale != null) {
      const baseScale = fish.sprite.scale;
      this.tweens.add({
        targets: fish.sprite,
        scale: { from: baseScale, to: baseScale * 1.2 },
        yoyo: true, repeat: 1, duration: 120, ease: 'Sine.InOut',
      });
    }

    // 사용자 요청: 입질/잡힘 시 물고기 이름 표시 안 함 (Result 화면에서만 집계).
    this._hookedNameText?.destroy();
    this._hookedNameText = null;

    // H1 STRIKE — 카메라 흔들기 (강한 후킹 충격 시각, 1회)
    this.cameras.main.shake(180, 0.006);
    // 상단 텐션 막대 제거 (사용자 요청) — needle 이 텐션 게이지 역할 대체

    // 사용자 요청: catch 후 즉시 reel-in 메카닉 시작.
    //   panic-escape (CAST 근처면 빠르게 외곽으로 풀려나감) 직후 struggle 본격 시작.
    if (this.mode === 'user2') {
      const dxc = this.hook.baseX - this.hook.x;
      const dyc = (this.hook._baseY ?? 0) - 30 - this.hook.y;
      const distNow = Math.sqrt(dxc * dxc + dyc * dyc);
      if (distNow < 280) {
        this._user2PanicEscape(fish, distNow, dxc, dyc);
      }
    }
  }

  // user2 — CAST 근처에서 낚인 fish 가 빠르게 멀리 외곽으로 풀려나감.
  //   - 외곽 방향 = CAST 의 반대.  거의 정확히 CAST 위치면 무작위 위쪽 각도.
  //   - 거리 380~480 px, 0.5s 안에 도달 (≈ 760~960 px/s, 매우 빠름).
  //   - 가까울수록 더 멀리 escape (max 시 dist≈0 → 460, dist 280 → 380).
  _user2PanicEscape(fish, distNow, dxc, dyc) {
    // 사용자 요청: 도망 방향 랜덤 — outward 기준 ±90° 범위 (CAST 쪽으론 가지 않음).
    let baseAngle;
    if (distNow > 5) {
      baseAngle = Math.atan2(-dyc, -dxc);   // outward (CAST 반대)
    } else {
      baseAngle = -Math.PI / 2;             // CAST 위치 정확히 → 기본 위쪽
    }
    const angle = baseAngle + (Math.random() - 0.5) * Math.PI;   // ±90°
    // 가까울수록 더 멀리: dist 0 → +150 보너스
    const proximityBoost = Math.max(0, (280 - distNow) / 280) * 150;
    const escapeDist = 320 + proximityBoost + Math.random() * 80;
    const targetX = this.hook.x + Math.cos(angle) * escapeDist;
    const targetY = this.hook.y + Math.sin(angle) * escapeDist;
    const pad = 40;
    const sw = this.scale.width, sh = this.scale.height;
    // 사용자 요청: 가까운 catch 시 도망 위치 = 화면 중앙 살짝 위 범위 안.
    //   minY = sh×0.40 (sh=1280 → 512), maxY = sh×0.48 (→ 614)
    //   → fish 항상 화면 위쪽 1/3 ~ 중앙 사이에 도망. CAST 근처 머무는 일 없음.
    const minY = Math.max(pad + 80, sh * 0.40);
    const maxY = Math.max(minY + 60, sh * 0.48);
    const clampedX = Math.max(pad, Math.min(sw - pad, targetX));
    const clampedY = Math.max(minY, Math.min(maxY, targetY));

    if (fish.sprite) {
      fish.sprite.setRotation(angle + Math.PI / 2);
    }
    this.hook._struggleFrozen = true;
    this._user2Escaping = true;

    this.tweens.add({
      targets: this.hook,
      x: clampedX,
      y: clampedY,
      duration: 500,
      ease: 'Sine.Out',
      onComplete: () => {
        // panic 완료 → struggle 즉시 시작 (사용자 입력 대기 X)
        this.hook._struggleFrozen = false;
        this._user2Escaping = false;
        const fdx = this.hook.baseX - this.hook.x;
        // 파이팅 anchor(lift 반영) 기준 — scale-progress 계산과 동일 기준 유지.
        const fdy = (this.hook._u2HookedAnchorY?.() ?? ((this.hook._baseY ?? 0) - 130)) - this.hook.y;
        this._user2InitDist = Math.max(80, Math.sqrt(fdx * fdx + fdy * fdy));
      },
    });
  }

  // (제거됨) ─── Tension Meter 상단 막대 ───
  //   needle 이 텐션 게이지 역할을 대체하면서 dead code 가 됨 (코드 리뷰 6-1).
  //   _buildTensionMeter / _showTensionMeter / _hideTensionMeter / _drawTensionFill 모두 제거.

  // 화면 중앙에 떠오르며 페이드 되는 텍스트 (PULL!, LOST! 등)
  _spawnFlashText(msg, color = '#ffd147', size = 64) {
    const t = strokeText(this, this.scale.width / 2, 380, msg, size,
      { color, strokeColor: '#0a2540', strokeWidth: 5 });
    centerInBox(t, 0.5);
    t.setDepth(200);
    t.setScale(0.5);
    this.tweens.add({
      targets: t,
      scale: 1.0,
      duration: 220,
      ease: 'Back.Out',
    });
    this.tweens.add({
      targets: t,
      alpha: { from: 1, to: 0 },
      y: t.y - 50,
      duration: 800,
      delay: 400,
      onComplete: () => t.destroy(),
    });
  }

  // ─── 성공 SHOWCASE 이펙트 (사용자 요청) ───
  //   1) 방사형 광선 + glow ring (fish 뒤, depth 51.5)
  //   2) 어종 이름 (흰색, 큰 폰트) — fish 위쪽
  //   3) 크기(cm) + 무게(kg) — 이름 아래 (노란색)
  //   * 1.5s 후 _completeCatch 에서 정리 destroy
  _spawnSuccessShowcase(fish, displayY) {
    if (!fish) return;

    const fishDepth = fish.sprite?.depth ?? 52;
    const burstDepth = fishDepth - 0.5;   // fish 뒤
    const size = fish.def.size || 80;
    // 이름/정보 위치 — fish 의 최종 표시 y (slide 후) 기준
    const finalY = displayY ?? fish.y;

    // (1) 회오리 이펙트 스프라이트 — fish 뒤에 회전하며 4 프레임 progression
    //   sprite_fish_effect 시트 (1024×1024, 2×2 cell 512×512) → 'fish_effect' anim (4 프레임)
    if (this.textures.exists('sprite_fish_effect')) {
      const effect = this.add.sprite(fish.x, fish.y, 'sprite_fish_effect', 0);
      // 사용자 요청: 이펙트가 오른쪽으로 약간 치우쳐 보임 → originX 0.5→0.55 로 시각 보정.
      //   (텍스처 frame 내부에서 swirl 의 visible center 가 우측으로 offset 되어 있음.)
      effect.setOrigin(0.55, 0.5);
      effect.setDepth(burstDepth);
      effect.setBlendMode(Phaser.BlendModes.ADD);
      // fish 사이즈에 비례하여 둘레를 풍부하게 감싸도록 (fish.size × 2.6 너비)
      // 셀 512px 기준 division (모바일 안전을 위해 시트 1024² 로 축소 → 셀 512).
      const targetScale = (size * 2.6) / 512;
      effect.setScale(targetScale * 0.5);   // 초기 작게 → tween 으로 확장
      effect.setAlpha(0);
      this.tweens.add({
        targets: effect,
        scale: targetScale,
        rotation: Math.PI * 0.5,         // 1.5s 동안 약 90° 회전
        duration: 1500,
        ease: 'Sine.Out',
      });
      this.tweens.add({
        targets: effect,
        alpha: 1.0,
        duration: 200,
      });
      if (this.anims.exists('fish_effect')) {
        effect.play('fish_effect');
      }
      this._showcaseEffect = effect;
    }

    // (2) 어종 이름 — 흰색 큰 폰트 (사용자 요청: 살짝 아래로 + 크기/무게에 가까이)
    // slide 후 fish 의 최종 y (displayY) 기준으로 이름/정보 배치 (반응형: 실제 캔버스 중앙)
    const cx = this.scale.width / 2;
    const nameY = Math.max(180, finalY - size - 30);
    const name = strokeText(this, cx, nameY,
      fish.def.name, 48,
      { color: '#ffffff', strokeColor: '#0a2540', strokeWidth: 6 });
    centerInBox(name, 0.5);
    name.setDepth(200);
    name.setScale(0.5);
    this.tweens.add({
      targets: name,
      scale: 1.0,
      duration: 220,
      ease: 'Back.Out',
    });
    this._showcaseName = name;

    // (3) 크기 + 무게 — 이름 바로 아래 (사용자 요청: 가까이 붙여서)
    //   사이즈: realLengthCm × ±8% jitter
    //   무게: 0.000020 × len^3 × (0.85 + rand × 0.3)  → kg
    const baseLen = fish.def.realLengthCm || 30;
    const lenCm = baseLen * (0.92 + Math.random() * 0.16);
    const weightKg = 0.000020 * Math.pow(lenCm, 3) * (0.85 + Math.random() * 0.30);
    const weightStr = weightKg >= 1.0
      ? `${weightKg.toFixed(1)} kg`
      : `${Math.round(weightKg * 1000)} g`;
    const sizeStr = lenCm >= 100
      ? `${(lenCm / 100).toFixed(2)} m`
      : `${lenCm.toFixed(1)} cm`;

    // 이름 폰트 48 + 외곽선 6 → glyph 가로/세로 ≈ 60px. 가까이 붙이려면 ~38px 간격.
    const info = strokeText(this, cx, nameY + 38,
      `${sizeStr}  /  ${weightStr}`, 32,
      { color: '#ffd147', strokeColor: '#0a2540', strokeWidth: 4 });
    centerInBox(info, 0.5);
    info.setDepth(200);
    info.setAlpha(0);
    this.tweens.add({
      targets: info,
      alpha: 1,
      duration: 280,
      delay: 200,
    });
    this._showcaseInfo = info;
  }

  // ─── 골드 획득 풉업 — 사용자 요청: 더 크고 길게 ───
  //   pop-in (Back.Out, 250ms) → 2.5s 동안 위로 떠오르며 페이드.
  //   콤보 있을 때는 더 큰 폰트 + 별도 라인.
  _spawnScorePopup(x, y, scoreGain, comboMult) {
    const hasCombo = comboMult > 1.0;
    // 콤보 배수는 정수(2,4,8,...) — toFixed 대신 정수 표기
    const text = hasCombo
      ? `+${scoreGain} GOLD\n×${comboMult} COMBO!`
      : `+${scoreGain} GOLD`;
    const fontSize = hasCombo ? 44 : 40;
    const t = strokeText(this, x, y - 30, text, fontSize,
      { color: '#ffd147', strokeColor: '#0a2540', strokeWidth: 5 });
    t.setAlign('center');
    t.setLineSpacing(4);
    centerInBox(t, 0.5);
    t.setDepth(200);
    t.setScale(0.4);
    this.tweens.add({
      targets: t, scale: 1.0,
      duration: 250, ease: 'Back.Out',
    });
    this.tweens.add({
      targets: t,
      y: t.y - 140,
      alpha: { from: 1, to: 0 },
      duration: 2500,
      delay: 400,
      ease: 'Sine.Out',
      onComplete: () => t.destroy(),
    });
  }

  // ─── 골드 소모 풉업 — 사용자 요청: 캐스팅 시 100골드 차감 시각 표시 ───
  //   빨간색 큰 폰트, 2.2s 표시. CAST 버튼 위로 떠오름.
  _spawnCostPopup(x, y, amount) {
    const t = strokeText(this, x, y, `-${amount} GOLD`, 40,
      { color: '#ff5050', strokeColor: '#0a2540', strokeWidth: 5 });
    centerInBox(t, 0.5);
    t.setDepth(200);
    t.setScale(0.4);
    this.tweens.add({
      targets: t, scale: 1.0,
      duration: 220, ease: 'Back.Out',
    });
    this.tweens.add({
      targets: t,
      y: t.y - 110,
      alpha: { from: 1, to: 0 },
      duration: 2200,
      delay: 300,
      ease: 'Sine.Out',
      onComplete: () => t.destroy(),
    });
  }

  // 캐스팅 비용 차감 — 레벨에 따라 동적 증가.
  //   Level 1: 150 골드, Level N: 150 + (N-1) × 25 (cap 800).
  //   BUG-01: 골드 부족 시 차감하지 않고 false 반환 → 호출부가 캐스팅을 중단해야 함.
  //   @returns {boolean} 결제 성공 여부 (true=차감 완료, false=잔액 부족·미차감).
  _payCastCost() {
    const level = this.profile?.level ?? 1;
    const cost = castCostForLevel(level);
    const gold = this.profile?.gold ?? 0;
    if (gold < cost) {
      this._toast('GOLD 부족!');
      return false;
    }
    addGold(this.profile, -cost);
    this._updateHUD?.();
    if (this.castBtn?.scene) {
      this._spawnCostPopup(this.castBtn.x, this.castBtn.y - 80, cost);
    }
    return true;
  }

  // BUG-08: mid-flight splash 의 update 리스너/스프라이트를 일괄 정리 (_shutdown 에서 호출).
  _cleanupSplashListeners() {
    const arr = this._splashSyncs;
    if (!arr || !arr.length) { this._splashSyncs = []; return; }
    for (const tracked of arr.slice()) {
      tracked.done = true;
      this.events.off('update', tracked.sync);
      if (tracked.splash && tracked.splash.scene) tracked.splash.destroy();
    }
    this._splashSyncs = [];
  }

  /**
   * 물 splash 이펙트를 fish 에 attach. fish.x/y 변화 (reel-up 등) 를 매 프레임 따라감.
   * fish.def.size 에 비례한 scale 로 splash 가 물고기 둘레에 퍼지게.
   * @param {Fish} fish — 따라갈 대상 fish (사용 후 dead 면 splash 도 detach)
   */
  _spawnSplash(fish) {
    if (!this.textures.exists('sprite_splash') || !fish) return;

    const fishSize = fish.def?.size ?? 60;
    const sX = (fishSize * 1.3) / 256;
    const sY = sX;
    // splash 셀이 256×384 → 256×512 (POT 정렬) 로 변경 — origin Y 재캘리브레이션:
    //   기존 0.35 × 384 = 134 px (시각적 발원점) → 0.2625 × 512 = 134 px (동일)
    const splash = this.add.sprite(fish.x, fish.y, 'sprite_splash', 0);
    splash.setOrigin(0.5, 0.2625);
    splash.setScale(sX, sY);
    splash.setDepth(60);              // fish(52)/hook(51) 위, panel(100)/HUD(110) 아래
    splash.setAlpha(1.0);

    // ── fish 와 위치 동기화 — 매 프레임 fish.x/y 를 splash 에 복사 ──
    // (Scene 의 update 이벤트 사용. fish 가 destroy 되거나 dead 되면 자동 detach)
    const sync = () => {
      if (!splash.scene) return;     // splash 가 이미 destroy 된 경우
      if (fish && !fish.dead && fish.sprite?.scene) {
        splash.x = fish.x;
        splash.y = fish.y;
      }
    };
    this.events.on('update', sync);
    // BUG-08: splash 가 mid-flight 인 채 씬이 종료되면 _shutdown 이 이 update 리스너를
    //   제거하지 못해 누수됨 → 추적 배열에 등록하고 _cleanupSplashListeners 가 일괄 정리.
    this._splashSyncs = this._splashSyncs || [];
    const tracked = { sync, splash, done: false };
    this._splashSyncs.push(tracked);

    // 이중 호출(안전타이머 + animationcomplete) 방어 — done 플래그로 1회만 실행.
    const cleanup = () => {
      if (tracked.done) return;
      tracked.done = true;
      this.events.off('update', sync);
      if (splash && splash.scene) splash.destroy();
      const arr = this._splashSyncs;
      if (arr) {
        const idx = arr.indexOf(tracked);
        if (idx >= 0) arr.splice(idx, 1);
      }
    };

    if (this.anims.exists('water_splash')) {
      splash.play('water_splash');
      const safetyTimer = this.time.delayedCall(1500, cleanup);
      splash.once('animationcomplete', () => {
        safetyTimer.remove(false);
        cleanup();
      });
    } else {
      this.tweens.add({
        targets: splash, alpha: { from: 1, to: 0 }, duration: 500,
        onComplete: cleanup,
      });
    }

    // POP 효과 — 시작에 scale up
    this.tweens.add({
      targets: splash,
      scaleX: { from: sX * 0.6, to: sX },
      scaleY: { from: sY * 0.6, to: sY },
      duration: 180,
      ease: 'Back.Out',
    });
  }

  // ─── 사용자 요청: 물고기 위 부유 게이지 (제공된 이미지 자산 사용) ───
  //   fish_gauge_arc       : 색상 채워진 arc (green→red)
  //   fish_gauge_needle    : 텐션 표시 needle
  //   fish_gauge_bar_bg    : HP 바 빈 outline
  //   fish_gauge_bar_fill  : HP 바 색상 (cropped 으로 hp/maxHp 표시)
  _buildFishGauges() {
    const container = this.add.container(0, 0).setDepth(80).setVisible(false);
    // 사용자 요청: 1.4× 확대 — arc 110→154, bar 72→101, h 12→17.
    const ARC_W = 154;
    const BAR_W = 101;
    const BAR_H = 17;

    // arc 배경 (색상 채워진 게이지)
    const arcBg = this.textures.exists('fish_gauge_arc')
      ? this.add.image(0, 0, 'fish_gauge_arc')
      : null;
    if (arcBg) {
      arcBg.setOrigin(0.5, 1);
      // arc 의 가로 폭이 ARC_W 가 되도록 scale
      const arcScale = ARC_W / (arcBg.width || 1);
      arcBg.setScale(arcScale);
      container.add(arcBg);
    }

    // needle (회전축 = 호 중심)
    const needle = this.textures.exists('fish_gauge_needle')
      ? this.add.image(0, 0, 'fish_gauge_needle')
      : null;
    if (needle) {
      // needle origin 을 하단 중심으로 (회전축이 needle 의 base 가 되도록)
      needle.setOrigin(0.5, 1);
      const needleScale = arcBg
        ? (arcBg.displayHeight * 0.95) / (needle.height || 1)
        : 0.3;
      needle.setScale(needleScale);
      container.add(needle);
    }

    // HP 바 — bg (outline) + fill (color, cropped). arc 와 가까이.
    const barY = 11;   // 8 × 1.4
    const barBg = this.textures.exists('fish_gauge_bar_bg')
      ? this.add.image(0, barY, 'fish_gauge_bar_bg')
      : null;
    if (barBg) {
      barBg.setOrigin(0.5, 0);
      const barScale = BAR_W / (barBg.width || 1);
      barBg.setScale(barScale);
      container.add(barBg);
    }
    const barFill = this.textures.exists('fish_gauge_bar_fill')
      ? this.add.image(0, barY, 'fish_gauge_bar_fill')
      : null;
    if (barFill) {
      // 사용자 보고: fill 직사각형 모서리가 bg 둥근 모서리 밖으로 삐져나옴 +
      //   왼쪽으로 치우침. → fill 을 bg 실제 displayed 사이즈의 88% × 75% 로 축소 +
      //   bg 내부 중앙 정렬. (bg displayed dims 기준으로 inset 적용)
      const FILL_W_INSET = 0.88;
      const FILL_H_INSET = 0.75;
      const bgDispW = barBg ? barBg.displayWidth  : BAR_W;
      const bgDispH = barBg ? barBg.displayHeight : BAR_H;
      const fillDispW = bgDispW * FILL_W_INSET;
      const fillDispH = bgDispH * FILL_H_INSET;
      const fillScaleX = fillDispW / (barFill.width  || 1);
      const fillScaleY = fillDispH / (barFill.height || 1);
      barFill.setOrigin(0, 0);
      barFill.setScale(fillScaleX, fillScaleY);
      // 좌상단 정렬 — bg 중앙 (x=0) 기준으로 fill 가로 중앙 정렬 + 세로 inset.
      barFill.setX(-fillDispW / 2);
      barFill.setY(barY + (bgDispH - fillDispH) / 2);
      container.add(barFill);
    }

    // 사용자 요청: 게이지 밑에 작은 폰트로 물고기 이름.
    const nameY = barY + (barBg?.displayHeight ?? BAR_H) + 4;
    const nameText = strokeText(this, 0, nameY, '', 12,
      { color: '#ffffff', strokeColor: '#0a2540', strokeWidth: 2 });
    nameText.setOrigin(0.5, 0);
    container.add(nameText);

    container.setAlpha(0.92);   // 약간 반투명
    this._fishGauges = {
      container, arcBg, needle, barBg, barFill, nameText,
      ARC_W, BAR_W, BAR_H,
    };
  }

  _drawFishGauges(dt = 0.016) {
    const fg = this._fishGauges;
    if (!fg) return;
    if (this._showcaseActive) { fg.container.setVisible(false); return; }

    let fish = null;
    if (this.hook?.targetedBy && this.hook.targetedBy.state === FISH_STATE.PECKING) {
      fish = this.hook.targetedBy;
    } else if (this.hook?.attachedFish && !this.hook.attachedFish.dead) {
      fish = this.hook.attachedFish;
    }
    if (!fish || !fish.sprite || fish.dead) {
      fg.container.setVisible(false);
      return;
    }

    fg.container.setVisible(true);
    // 위치: fish 머리 위 + 둥둥 떠 있는 sin 오실레이션.
    //   게이지 1.4× 확대로 fish 와 거리 28→40 (비례).
    const fhead = (fish.def.size ?? 80) * 0.5;
    this._gaugeBobT = (this._gaugeBobT ?? 0) + dt;
    const bob = Math.sin(this._gaugeBobT * 2.4) * 3.5;
    fg.container.setPosition(fish.x, fish.y - fhead - 40 + bob);

    // ── Needle 회전 — 텐션 [-1, 1] → 회전각 [-π/3, π/3] (60° 좌우) ──
    if (fg.needle) {
      const tension = Math.max(-1, Math.min(1, this.hook?._tensionLevel ?? 0));
      const SWING_AMP = Math.PI / 3;
      fg.needle.setRotation(tension * SWING_AMP);
    }

    // ── 물고기 이름 (사용자 요청) ──
    if (fg.nameText) {
      const name = fish.def?.name ?? '';
      if (fg.nameText.text !== name) fg.nameText.setText(name);
    }

    // ── HP 바 fill — 가로 너비 cropped 으로 hp/maxHp 표시 ──
    if (fg.barFill) {
      const maxHp = this.hook?._fishMaxHp ?? 1;
      const hp = Math.max(0, this.hook?._fishHp ?? 0);
      const hpFrac = Math.max(0, Math.min(1, hp / maxHp));
      // Phaser image 의 crop 으로 표시 너비 조절. 원본 width × frac.
      const srcW = fg.barFill.width || 1;
      fg.barFill.setCrop(0, 0, srcW * hpFrac, fg.barFill.height || 1);
      fg.barFill.setVisible(hpFrac > 0);
      // 좌측 정렬 fill(origin 0,0, x=-BAR_W/2) — crop 이 우측부터 줄임. 별도 offset 불필요.
    }
  }

  // ─── 유저 모드 II catch 시도 ───
  //   PECKING 중인 fish 에게 CAST 버튼을 눌렀을 때 호출.
  //   현재 needle 값(중심에서 떨어진 절대거리)으로 판정:
  //     |needle| < 0.485 → catch (DASHING → HOOKED 진입)
  //     그 외             → fish 도주 (FLEEING)
  //   임계값은 Fish._updatePecking 의 자동판정과 동일.
  _user2TryCatch(fish) {
    if (!fish) return;
    const needleVal = Math.abs(this._needleValue ?? 0);
    if (needleVal < 0.485) {
      fish.state = FISH_STATE.DASHING;
      fish._dashTimer = 0;
      fish._playAnim?.(`${fish.def.animKey}_fast`);
    } else {
      const dxh = this.hook.x - fish.x;
      const dyh = this.hook.y - fish.y;
      const m = Math.sqrt(dxh * dxh + dyh * dyh) || 1;
      fish._fleeDirX = -dxh / m;
      fish._fleeDirY = -dyh / m;
      fish._fleeTimer = 0;
      if (this.hook.targetedBy === fish) this.hook.targetedBy = null;
      fish.state = FISH_STATE.FLEEING;
      fish._playAnim?.(`${fish.def.animKey}_fast`);
    }
  }

  // ─── 저항 실패 — fish 가 풀려서 도망 (사용자 요청 메카닉) ───
  //   - fish.state = FLEEING (Fish.js 가 자동으로 화면 밖으로 도망)
  //   - hook 깨끗이 풀고 forceReel → 자동으로 castStartY 로 복귀 → 다음 cast 재개
  _handleStruggleFailure() {
    const fish = this.hook.attachedFish;
    if (fish && !fish.dead) {
      fish.isHooked = false;
      fish.sprite?.setDepth(DEPTH.fish);
      // 임의 방향으로 도주
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;   // 주로 위쪽 ± 90°
      fish._fleeDirX = Math.cos(angle);
      fish._fleeDirY = Math.sin(angle);
      fish._fleeTimer = 0;
      fish.state = FISH_STATE.FLEEING;
      fish._playAnim?.(`${fish.def.animKey}_fast`);
    }
    // hook 정리 + 새 cast
    //   auto/user: 위에서 내려오는 cast tween (= 새 캐스팅 → 100 골드 차감)
    //   user2: CAST 버튼 위치로 즉시 리셋 (USER2_AIM 복귀, 다음 user2Shoot 시 차감)
    this.hook.attachedFish = null;
    this.hook.struggleFailed = false;
    this.hook._strugglePhase = null;
    this._user2AwaitingStruggleStart = false;
    if (this.mode === 'user2') {
      this.hook.user2Reset();
    } else if (this._payCastCost()) {
      this.hook.cast();
    } else {
      // BUG-01: 잔액 부족이면 재캐스팅하지 않고 out-of-gold 종료.
      this._endMatch();
      return;
    }
    // UI 정리
    this._hookedNameText?.destroy();
    this._hookedNameText = null;
    this._showcaseActive = false;
    this._showcaseTimer  = 0;
    this._pullFlashed = false;
    // 반투명 overlay 즉시 정리 (showcase 가 fail 로 중단된 경우 대비)
    this._showcaseOverlay?.destroy();
    this._showcaseOverlay = null;
    // 카메라 원위치 (잔잔한 reel shake 중이었다면)
    this.cameras.main.setScroll(0, 0);
    this._reelShakeT = null;
    // 실패 햅틱 — 강한 단일 펄스(줄 끊김/놓침).
    vibrate(160);
    // 콤보 리셋 + flash + 카메라 충격
    this._combo = 0;
    // 사용자 요청: 실패 후 1초 쿨다운 — 누르고 있던 버튼으로 즉시 재발사 방지.
    this._castCooldownTimer = 1.0;
    // 실패 사유별 메시지 + 시각 효과:
    //   overweight / snap: 줄 끊김 → line snap 시각 (사용자 요청)
    //   escaped: 챔질 늦음 → 물고기 도주
    //   loose:   텐션 음수 끝 → 일반 LOST
    const reason = this.hook._failureReason;
    // reason 별 실패 사운드 (사용자 요청).
    this._playFailSfx(reason);
    if (reason === 'overweight') {
      this._spawnFlashText('TOO BIG!\nLINE SNAPPED!', '#ff5050', 64);
      this.cameras.main.shake(320, 0.012);
      this._spawnLineSnapEffect();
    } else if (reason === 'snap') {
      this._spawnFlashText('LINE SNAPPED!', '#ff5050', 72);
      this.cameras.main.shake(260, 0.010);
      this._spawnLineSnapEffect();
    } else if (reason === 'escaped') {
      this._spawnFlashText('FISH ESCAPED!\nSTRIKE TOO LATE', '#ff8040', 56);
      this.cameras.main.shake(150, 0.005);
    } else {
      this._spawnFlashText('LOST!', '#ff5050', 80);
      this.cameras.main.shake(220, 0.008);
    }
    this.hook._failureReason = null;
  }

  // 사용자 요청: 낚시줄 끊김 시각 — 끊긴 줄 끝 두 가닥 + 노란 파편 입자.
  _spawnLineSnapEffect() {
    if (!this.hook) return;
    const rodX = this.hook.baseX;
    const rodY = this.hook._baseY ?? 0;
    const endX = this.hook.x;
    const endY = this.hook.y;
    const midX = (rodX + endX) / 2;
    const midY = (rodY + endY) / 2;
    const dx = endX - rodX;
    const dy = endY - rodY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / dist, uy = dy / dist;

    // 줄 끝 두 가닥 (rod 측 + lure 측) — 끊긴 위치에서 살짝 처짐
    const breakPoint = { x: midX, y: midY };
    const rodSideEnd = { x: breakPoint.x - ux * 14, y: breakPoint.y - uy * 14 + 8 };
    const lureSideEnd = { x: breakPoint.x + ux * 14, y: breakPoint.y + uy * 14 + 8 };

    const snapGfx = this.add.graphics();
    snapGfx.setDepth(60);
    snapGfx.lineStyle(2.0, 0xffe040, 1.0);
    // rod 측 끊김 끝
    snapGfx.beginPath();
    snapGfx.moveTo(rodX, rodY);
    snapGfx.lineTo(rodSideEnd.x, rodSideEnd.y);
    snapGfx.strokePath();
    // lure 측 끊김 끝
    snapGfx.beginPath();
    snapGfx.moveTo(lureSideEnd.x, lureSideEnd.y);
    snapGfx.lineTo(endX, endY);
    snapGfx.strokePath();

    // fade out + 떨어지는 효과
    this.tweens.add({
      targets: snapGfx,
      alpha: { from: 1, to: 0 },
      y: '+=30',
      duration: 700,
      ease: 'Sine.In',
      onComplete: () => snapGfx.destroy(),
    });

    // 끊긴 지점 노란 파편 6개 — 사방으로 튕기며 사라짐
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 60;
      const p = this.add.circle(midX, midY, 2.5, 0xffe040, 1);
      p.setDepth(60);
      this.tweens.add({
        targets: p,
        x: p.x + Math.cos(angle) * speed,
        y: p.y + Math.sin(angle) * speed + 40,   // gravity bias
        alpha: 0,
        scale: 0.3,
        duration: 600 + Math.random() * 200,
        ease: 'Sine.Out',
        onComplete: () => p.destroy(),
      });
    }

    // 메인 hook line 일시 숨김 — _lineSnapped flag 로 _drawHook 에서 skip
    this.hook._lineSnapped = true;
    this.time.delayedCall(700, () => {
      if (this.hook) this.hook._lineSnapped = false;
    });
  }

  _completeCatch() {
    const fish = this.hook.attachedFish;
    if (!fish) { this.hook.reset(); return; }

    // 콤보 증가
    this._combo += 1;
    // 콤보 배수 = 2^(combo-1) — BUG-05: 무한 증가(2^(combo-1))로 경제 붕괴를 막기 위해 8× 상한.
    //   combo 1: 1×, 2: 2×, 3: 4×, 4: 8×, 5+: 8× (cap). 점수/골드 오버플로 방지.
    const COMBO_MULT_CAP = 8;
    const comboMult = this._combo >= 2
      ? Math.min(COMBO_MULT_CAP, Math.pow(2, Math.min(this._combo - 1, 3)))
      : 1.0;
    const baseScore = fish.def.score;
    // 사용자 요청: 최저 보상 120 골드 (그레이드 시작점)
    const MIN_REWARD = 120;
    const finalScore = Math.max(MIN_REWARD, Math.round(baseScore * comboMult));

    this.score += finalScore;
    this.catches += 1;
    this._caughtList.push({ id: fish.def.id, name: fish.def.name, score: finalScore });
    recordCatch(fish.def);
    // addGold(profile, amount) — in-place 갱신 + localStorage 저장 1회 (코드 리뷰 5-1, 9-2)
    addGold(this.profile, finalScore);
    // ─── Phase 2: 미끼 1회 소비 (생미끼만, 루어는 재사용) ───
    //   stock=0 도달 시 setBait(null) → 이후 spawn 어종은 입질 X (재구매 유도).
    if (this._activeBait && this._activeBait.type === 'live') {
      const remaining = consumeBait(this._activeBait.id);
      if (remaining <= 0) {
        this._activeBait = null;
        this.spawner?.setBait(null);
      }
    }
    this._updateHUD();

    // 성공 효과음 — 3가지 중 1개 랜덤 (loop X).
    //   먼저 작은 물튀김 효과음 (사용자 요청: "작게"), 이어서 메인 성공 사운드.
    this._playSplashSfx();
    this._playSuccessSfx();

    // 점수 풉업 + 콤보 표시
    this._spawnScorePopup(fish.x, fish.y, finalScore, comboMult);
    // 사용자 요청: 콤보 2부터 flash 표시 (×2, ×4, ×8 ...)
    if (this._combo >= 2) {
      this._spawnFlashText(`COMBO x${this._combo}  ×${comboMult}!`, '#ffd147', 56);
    }

    if (fish.sprite) {
      this.tweens.add({
        targets: fish.sprite, y: fish.sprite.y - 60, alpha: 0,
        duration: 350, ease: 'Cubic.Out',
        onComplete: () => fish.sprite?.destroy(),
      });
    }
    this.spawner.removeFish(fish);
    this.hook.reset();
    // auto/user: 위에서 cast tween (= 새 캐스팅 → 골드 차감)
    // user2: CAST 버튼 위치 즉시 리셋 (다음 user2Shoot 시 차감)
    if (this.mode === 'user2') {
      this.hook.user2Reset();
    } else if (this._payCastCost()) {
      this.hook.cast();
    } else {
      // BUG-01: 재캐스팅 비용 부족 → out-of-gold 종료 (scene shutdown 이 showcase 잔여 정리).
      this._endMatch();
      return;
    }
    // 다음 catch 를 위한 showcase / 대기 상태 초기화
    this._showcaseActive = false;
    this._showcaseTimer  = 0;
    this._pullFlashed = false;
    this._user2AwaitingStruggleStart = false;
    // 카메라 원위치
    this.cameras.main.setScroll(0, 0);
    this._reelShakeT = null;
    // showcase 오브젝트 정리 (사용자 요청: 1.5s 유지 후 사라짐)
    this._showcaseEffect?.destroy(); this._showcaseEffect = null;
    this._showcaseName?.destroy();   this._showcaseName = null;
    this._showcaseInfo?.destroy();   this._showcaseInfo = null;
    // 반투명 overlay fade-out
    if (this._showcaseOverlay) {
      const overlay = this._showcaseOverlay;
      this._showcaseOverlay = null;
      this.tweens.add({
        targets: overlay, alpha: 0, duration: 300,
        onComplete: () => overlay?.destroy(),
      });
    }
    // 이름 텍스트 정리
    this._hookedNameText?.destroy();
    this._hookedNameText = null;
  }

  _endMatch() {
    if (this.gameOver) return;
    this.gameOver = true;
    this.timerEvent?.remove();
    this.spawner.stop();
    recordMatchEnd({ score: this.score, catches: this.catches });

    smoothStart(this, 'ResultScene', {   // 낚시 화면 유지 → 결과 씬 완전 준비 후 전환(청색 틈 방지)
      score: this.score,
      catches: this.catches,
      caughtList: this._caughtList,
      location: this.location,   // PLAY AGAIN 시 동일 낚시터로 복귀하기 위해 전달
      mode: this.mode,
    });
  }

  _goHome() {
    this.gameOver = true;
    this.timerEvent?.remove();
    this.spawner?.destroyAll();
    smoothStart(this, 'HomeScene');   // 낚시 화면 유지 → 홈 완전 준비 후 전환
  }
}
