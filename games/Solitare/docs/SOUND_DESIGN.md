# 솔리테어 하이츠 — 사운드 디자인 문서

> 게임 = TriPeaks(±1 순환, A↔K) + **타워 건설 메타**. 세로 HD 1080×2400.
> 전 게임 이벤트를 점검해 뽑은 **사운드 리스트 + 제작 가이드**. 캐주얼 매치 퍼즐 톤(말랑·쫀득·따뜻).

---

## 0. 톤 & 레퍼런스

- **무드**: 아늑한 베이커리/호텔 로비, 부드럽고 달콤한 캐주얼(솔리테어 그랜드 하비스트·홈스케이프 계열).
- **음색 팔레트**: 말렛/마림바·글로켄슈필·플럭 신스·부드러운 종(칩), 코인 짤랑, 소프트 우드/펠트 타격, 공기감 있는 whoosh.
- **금지**: 날카로운 하이·금속 노이즈·긴 리버브 테일(모바일 스피커에서 지저분).
- 이미 구현된 **콤보 상승 멜로디**(장음계 한 음씩 ↑, WebAudio 오실레이터)는 유지하거나 마림바 샘플로 교체 가능.

---

## 1. 기술 접근 (제작 전 세팅)

- **재생 엔진**: 코어에 경량 WebAudio SFX 매니저 신설 권장 — `packages/core/src/systems/audio.ts`(형제 게임 ZombieArrow `audio.ts` 패턴 재사용).
  - `preload(keys)` → AudioBuffer 풀, `play(key,{volume,rate,pan})`, `mute`/`duck`(BGM 감쇠), **모바일 오토플레이 언락**(첫 포인터 입력에서 `ctx.resume()`).
  - Phaser 사운드 대신 WebAudio 권장(짧은 SFX 저지연 + 피치 랜덤 용이).
- **파일 포맷**: SFX·BGM 모두 **`.m4a`(AAC) + `.webm`(opus) 2종** 폴백(사파리/크롬 커버). 모노 44.1k, SFX는 짧게.
- **네이밍**: `sfx_<카테고리>_<이름>`, 배경음 `bgm_<이름>`. 경로 `public/audio/`.
- **반복음 지터**: 카드 놓기 등 잦은 SFX는 **피치 ±6% 랜덤**(rate 0.94~1.06)으로 기관총 방지.
- **햅틱 페어링**: 핵심 SFX는 코어 `haptics.ts`의 라이트 진동과 동시 트리거(카드 놓기·별 획득·건설).
  → ✅ 2026-08-25 구현. 문법·표는 `src/haptics.ts` 헤더가 SSOT(콤보 길이별 light→medium→heavy, 판정=notify·조작=impact·탐색=selection, UI 는 무진동). 짝짓기 지점은 `audio.ts` 의 `sfx()/sfxCardPlace(combo)/sfxStar()`. 음소거와 독립, 설정 메뉴 `📳 진동` 토글(localStorage `solitaire.haptics`). iOS 는 네이티브 셸(Capacitor `@capacitor/haptics`)에서만 울린다 — 코어 `systems/haptics.ts` 가 `window.Capacitor.Plugins.Haptics` 를 탐지해 자동 분기.
- **믹스**: SFX 피크 -6dB, 동시 다발음(승리 흩뿌림)은 살짝 덕킹. BGM은 -18dB 언저리 배경.

---

## 2. 사운드 리스트

### 2-1. BGM / 앰비언스

| 키 | 트리거 | 느낌 | 제작 방법 |
|----|--------|------|-----------|
| `bgm_home` | HomeScene(타워 로비) | 아늑·따뜻·루프. 층 올라갈수록 밝게 | 60~80BPM 마림바+따뜻한 패드+가벼운 퍼커션 루프(60~90s seamless). 로열티프리 루프 편집 or 간단 작곡 |
| `bgm_play` | PlayScene | 집중되되 방해 안 되는 라이트 퍼즐 루프 | 밝은 플럭+소프트 베이스, 리듬 절제. home보다 저자극 |
| `bgm_win_sting` | 승리 정산 시작 | 3~4초 팡파레(짧은 스팅어) | 상승 아르페지오+벨 히트, 마지막에 코인 짤랑 겹침 |
| `amb_shop_loop`(선택) | 층 배경 | 매장 앰비언스(오븐·손님 웅성) 아주 낮게 | 필드 레코딩 or 폴리 루프, -30dB 앰비언스 |

### 2-2. 플레이 — 카드/보드 (`PlayScene`)

| 키 | 트리거(코드) | 느낌 | 제작 방법 |
|----|--------------|------|-----------|
| `sfx_card_place` | `onCardTap` 매칭 → 웨이스트 안착(360° 토스 도착) | 쫀득한 "톡/착" | 소프트 우드/펠트 탭 + 미세 whoosh. **피치 랜덤 필수** |
| `sfx_card_toss`(선택) | 카드가 위로 솟구쳐 날아가는 순간 | 가벼운 whoosh | 짧은 공기 스와이프, 저볼륨 레이어 |
| `sfx_card_deal` | `onStockTap` 뽑기(뒷면→앞면 플립하며 이동) | "슥-탁" 딜/플립 | 카드 슬라이드 + 플립 스냅. place와 구분되게 톤 낮게 |
| `sfx_card_flip`(선택) | 딜 중간(0.5t) 뒷면→앞면 교체 | 짧은 플립 스냅 | deal에 포함하거나 분리 |
| `sfx_card_invalid` | `denyFeedback`(매칭 불가 흔들림) | 부드러운 "부-" 거절음(불쾌하지 않게) | 낮은 뮤트 벙/소프트 버즈, 짧게. 절대 날카롭지 않게 |
| `sfx_combo_step` | 연속 매칭(현 `melodyStep` 상승음) | 콤보마다 한 음 ↑ | **이미 WebAudio 합성 존재** — 유지 or 마림바 8음 샘플(미~미') 세트로 교체 |
| — (콤보 리셋) | `resetComboRun`(뽑기/와일드) | 무음 or 아주 짧은 "슉" 리셋 | 선택. 과하면 생략 |

### 2-3. 플레이 — 미션 게이지 / 보상

| 키 | 트리거 | 느낌 | 제작 방법 |
|----|--------|------|-----------|
| `sfx_mission_slot` | `pushMatch`로 미션 박스 5칸 채워질 때(칸당) | 콩콩 채워지는 팝 | 짧은 마림바 팝, 칸 번호(1~5)마다 음 살짝 ↑ |
| `sfx_set_complete` | `completeSet`(5매칭=세트 완성) | 상큼한 완성 벨 | 글로켄 3음 상승 + 반짝 chime |
| `sfx_star` | 별 1개 획득(게이지 단계, 1~3) | "핑!" 별 획득 | 밝은 벨 히트, 별 순번마다 피치 ↑(1<2<3) |
| `sfx_gauge_full` | 별 3개 만충 | 파워업 충전 완료 | 상승 스윕 + 벨, set_complete보다 크게 |
| `sfx_coin_tick` | 코인 카운트업(`refresh` 코인 증가) | 짤짤 카운트 | 짧은 코인 클릭 루프(빠른 반복), 마지막에 톤 마감 |
| `sfx_coin_burst` | 보상 코인 낙하/버스트(`showMissionReward`) | 코인 쏟아짐 | 코인 샤워(다층 짤랑), 0.6~1s |
| `sfx_win_fanfare` | 승리 흩뿌림(`winScatter` 52장 토스) | 승리 환호 | `bgm_win_sting`과 연동, 카드 흩뿌림 whoosh 겹침 |
| `sfx_stuck` | 교착 안내(`isStuck` 토스트) | 부드러운 "음?" 안내(실패 아님) | 낮은 벨 2음, 낙담 아닌 힌트 톤 |

### 2-4. 플레이 — 부스터

| 키 | 트리거 | 느낌 | 제작 방법 |
|----|--------|------|-----------|
| `sfx_wild_activate` | `useWild` 발동(와일드 마커 등장) | 반짝 마법 충전 | 상승 샤이머 + 소프트 스파클 |
| `sfx_wild_use` | 와일드로 카드 제거 순간 | 마법 "팟" | activate보다 짧고 임팩트, 반짝 tail |
| `sfx_undo` | `undo` 되돌리기 | 되감기 "휘릭" | 짧은 리버스 스와이프(피치 하강) |
| `sfx_add5` | `add5`(＋5 카드) | 카드 보충 "촤르륵" | 카드 다발 딜, 5장 리듬 |
| `sfx_buy` / `sfx_no_coin` | `spend` 성공 / '코인 부족' 토스트 | 구매 짤랑 / 부드러운 거절 | 성공=코인칭, 실패=낮은 벙 |

### 2-5. 홈 / 타워 (`HomeScene`)

| 키 | 트리거 | 느낌 | 제작 방법 |
|----|--------|------|-----------|
| `sfx_floor_select` | 지어진 층 탭 → 플레이 진입 | 경쾌한 "톡" 선택 | 밝은 플럭 + 살짝 상승 |
| `sfx_build` | `tryBuild` 성공(다음 층 건설) | 뿌듯한 건설 완료(핵심 연출) | 망치/조립 "쿵-반짝" + 상승 벨 + 코인 소모. 층 등장과 동기 |
| `sfx_build_fail` | 건설 코인 부족(`toast`) | 부드러운 거절 | sfx_no_coin 재사용 가능 |
| `sfx_unlock`(선택) | 새 층 해금/연출 | 자물쇠 풀림 반짝 | 소프트 언락 + 샤인 |
| `sfx_level_open` / `sfx_level_close` | 레벨 선택 열기/닫기 | 패널 슬라이드 | 부드러운 whoosh(open ↑ / close ↓) |
| `sfx_level_pick` | 레벨 버튼 탭 | 선택 팝 | sfx_button 변형 |
| (앰비언트) 캐릭터 idle | 캐릭터 살랑/숨쉬기 트윈 | **무음 권장** | 필요 시 아주 낮은 옷깃/발소리 랜덤(과하지 않게) |

### 2-6. UI / 시스템 (공통)

| 키 | 트리거 | 느낌 | 제작 방법 |
|----|--------|------|-----------|
| `sfx_button` | 일반 버튼 탭(홈/네비/닫기) | 표준 "톡" | 소프트 플럭, 전 게임 공통 1종 |
| `sfx_popup_open` / `sfx_popup_close` | 팝업/오버레이 등장·퇴장 | 팝 인/아웃 | 짧은 상승/하강 whoosh + 소프트 팝 |
| `sfx_toast` | 토스트 알림 | 아주 짧은 "띵" | 낮은 벨 1음(과용 주의, 중요한 것만) |
| `sfx_transition` | 씬 전환(홈↔플레이) | 화면 스와이프 | 짧은 whoosh, BGM 크로스페이드와 병행 |
| `sfx_portal_progress`(선택) | 포털 로딩 진행 | 로딩 틱 | 낮은 틱, 선택적 |
| `sfx_start` | START 게이트 진입 | 시작 신호 | 밝은 "고!" 상승음 |

---

## 3. 제작 방법 — 실전 요약

1. **소싱 우선순위**: (a) 로열티프리 라이브러리(freesound CC0·zapsplat·kenney audio)에서 근접음 → 편집, (b) 간단음은 **합성**(콤보 멜로디처럼 WebAudio/신스), (c) 폴리(코인은 실제 동전, 카드는 실제 카드 녹음) 소량.
2. **편집**: 무료 DAW(Audacity/Reaper 데모)에서 트림(무음 제거)→노멀라이즈(-6dB peak)→짧은 페이드(클릭 방지 1~3ms)→저역 하이패스(80Hz)로 답답함 제거.
3. **길이 기준**: 탭/놓기 40~120ms, 벨/획득 150~400ms, 팡파레 스팅어 2~4s, BGM 루프 60~90s(seamless: 시작=끝 크로스페이드).
4. **변형 대비**: `card_place`·`coin_tick`·`button`은 **2~3 변형(variation)** 저장하거나 런타임 **피치 랜덤 ±6%**로 단조로움 제거.
5. **일관성**: 같은 계열은 같은 악기/룸톤 유지(별 1·2·3은 동일 벨의 피치 변주). 승리 스팅어와 코인버스트는 조성 맞춤.
6. **모바일 검증**: 실제 폰 스피커에서 청취(저역·과한 하이 확인), 첫 탭 언락·무음 스위치·백그라운드 복귀 시 재개 확인.
7. **최소 세트(MVP)로 시작 → 점증**(아래 우선순위).

---

## 4. 우선순위 (단계 도입)

- **P0 (필수 8종)**: `sfx_card_place`, `sfx_card_deal`, `sfx_card_invalid`, `sfx_coin_tick`, `sfx_win_fanfare`, `sfx_build`, `sfx_button`, `bgm_play`.
- **P1 (체감 큰 10종)**: `sfx_set_complete`, `sfx_star`, `sfx_coin_burst`, `sfx_wild_use`, `sfx_undo`, `sfx_add5`, `sfx_floor_select`, `sfx_popup_open/close`, `bgm_home`, `bgm_win_sting`.
- **P2 (디테일)**: `sfx_mission_slot`, `sfx_gauge_full`, `sfx_wild_activate`, `sfx_card_toss`, `sfx_stuck`, `sfx_level_open/close`, `sfx_transition`, `sfx_unlock`, 앰비언스.
- **콤보 멜로디**: 이미 합성 구현 — P0에서 볼륨/음색만 다듬고, 여유 시 마림바 샘플로 교체.

> **다음 단계 제안**: 코어 `systems/audio.ts`(WebAudio 매니저 + 언락 + 뮤트) 스캐폴드 → `public/audio/` 매니페스트 → PlayScene/HomeScene의 위 트리거 지점에 `audio.play('sfx_...')` 배선. 원하면 이 배선을 P0 세트로 먼저 구현해 드립니다.
