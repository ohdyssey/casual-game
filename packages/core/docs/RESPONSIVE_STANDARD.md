# 화면 대응 표준 — 3층 프레임 + 양축 가변

> 이 문서가 **원본(SSOT)** 입니다. 각 게임의 `CLAUDE.md` 에는 이 문서를 가리키는 포인터와
> 그 게임의 현재 상태만 적습니다. 규칙을 바꾸려면 여기를 고치세요.

## 원격 참조용 절대경로

이 문서는 **다른 저장소에서 작업할 때 원격 참조**하는 것을 전제로 씁니다. 아래 경로는 모노레포
바깥에서도 그대로 열립니다(리포 루트 = `d:\Dev\CasualGame`).

| 대상 | 절대경로 |
|---|---|
| **이 표준 문서** | `d:/Dev/CasualGame/packages/core/docs/RESPONSIVE_STANDARD.md` |
| 산출 구현(순수 함수) | `d:/Dev/CasualGame/packages/core/src/designSize.ts` |
| 산출 테스트 | `d:/Dev/CasualGame/packages/core/src/designSize.test.ts` |
| 앵커 구현(pin/pinX) | `d:/Dev/CasualGame/games/Homerun/src/ui/layoutAnchor.ts` |
| 앵커 테스트 | `d:/Dev/CasualGame/games/Homerun/src/ui/layoutAnchor.test.ts` |
| 레퍼런스 적용 게임 | `d:/Dev/CasualGame/games/Homerun` |
| 게임별 현황 재생성 | `d:/Dev/CasualGame/scripts/record-responsive-standard.mjs` |

**다른 프로젝트에서 이 표준을 쓰려면** 그 프로젝트의 `CLAUDE.md` 에 한 줄만 넣으세요:

```markdown
화면비 대응은 공통 표준을 따른다 — 화면 작업 전 반드시 읽을 것:
`d:/Dev/CasualGame/packages/core/docs/RESPONSIVE_STANDARD.md`
```

이 표준은 **Phaser 세로 게임 일반**에 적용됩니다. 산출 함수(`resolveDesignSize`)는 Phaser·DOM
비의존 순수 함수라 `@casual/core` 를 안 쓰는 프로젝트도 그대로 이식할 수 있습니다(2~5절이
규칙 전문이고, 6절이 검증 방법입니다).

## 왜 필요한가

세로 게임은 저작 화면비(예 20:9)와 실제 기기 화면비가 절대 일치하지 않는다. Phaser `Scale.FIT`
은 남는 쪽을 검은 여백으로 채우므로, 아무 대책 없이 두면 **좌우 또는 상하에 검은 띠**가 남는다.

특히 위험한 착각: "요즘 폰은 다 세로로 기니까 세로 확장만 하면 된다"가 **틀렸다.** 하단 광고
배너 슬롯을 빼고 나면 캔버스가 들어갈 컨테이너 비율이 크게 낮아진다.

| 기기 | 뷰포트 | 배너 예약 | **컨테이너 비율 r** |
|---|---|---|---|
| iPhone 15 | 393×852 | 96+34 | 722/393 = **1.84** |
| iPhone SE / 8 | 375×667 | 96+0 | 571/375 = **1.52** |

세로만 가변으로 두면 이 기기들이 세로 하한에 걸려 **좌우 필러박스**가 생긴다. 실제로 홈런팝
iPhone SE 에서 좌우 각 27px 검은 띠가 남아 있었다.

## 1. 3층 프레임 규약

| 층 | 홈런팝 값 | 규칙 |
|---|---|---|
| **저작 프레임** | 1080×2400 (20:9) | 에디터 SSOT. 디자이너가 그리는 캔버스 |
| **세이프존** | 1080×**2200** | **항상 100% 보인다.** 모든 UI·버튼·판정요소는 반드시 이 안에 |
| **세로 블리드** | 상하 합 200px | 배경·장식 전용. 잘려도 무방 |
| **가로 블리드** | 좌우 각 260px (→1600) | 배경 전용. 더 드러나도 무방 |

세이프존 높이(`designHeightRange.min`)가 **체감 "답답함"을 직접 좌우한다.** 낮을수록 세로가
잘려 필드/캐릭터 주변 여백이 사라진다. 홈런팝은 1920(20% 손실)에서 답답하다는 실사용 피드백을
받아 2200(8% 손실)으로 올렸다.

## 2. 캔버스 산출 규칙

컨테이너 박스 비율 `r = vh/vw` 로 두 구간을 나눈다. 경계는 세이프존 비율 `hMin/wMin`:

```
r ≥ hMin/wMin  →  세로 확장:  W = wMin,                    H = clamp(wMin·r, hMin, hMax)
r <  hMin/wMin  →  가로 확장:  W = clamp(hMin/r, wMin, wMax), H = hMin
```

두 구간 모두 **캔버스 비율이 컨테이너 비율과 일치**하므로 FIT 여백이 0이 된다.
범위를 넘어서는 극단 비율(초장신 폰, 데스크톱 가로 창)에서만 여백을 허용한다.

`vw`/`vh` 는 **window 가 아니라 `#game-container` 실측값**이다. 광고 슬롯으로 컨테이너를
뷰포트보다 줄여 놓은 게임이 있어 window 를 보면 비율이 틀어진다.

### 적용

```ts
// games/<Game>/src/game.ts
export const XxxGame: GameModule = {
  designWidth: 1080,
  designHeightRange: { min: 2200, max: 2400 },  // 세이프존 높이 ~ 저작 높이
  designWidthRange:  { min: 1080, max: 1600 },  // 저작 폭 ~ 배경이 덮을 수 있는 최대 폭
};
```

`designWidthRange` 를 **생략하면 기존 동작(폭 고정)과 100% 동일하다.** 옵트인이므로 아직
준비 안 된 게임을 깨뜨리지 않는다.

## 3. 앵커 규약 — 늘어난 축을 누가 흡수하는가

캔버스가 저작 프레임과 달라진 만큼(`dH`, `dW`)을 레이아웃이 흡수해야 한다.

| 축 | 속성 | 값 | 기본 |
|---|---|---|---|
| 세로 | `pin` | `top`(고정) · `bottom`(y+dH) · `center`(y+dH/2) | 위치 휴리스틱(상단⅓=top·하단⅓=bottom) |
| 가로 | `pinX` | `left`(고정) · `right`(x+dW) · `center`(x+dW/2) | **항상 `center`** |

우선순위는 둘 다 **노드 저작값 > 게임 코드 overrides > 기본**.

> ⚠️ **가로는 위치 휴리스틱을 쓰지 말 것.** 기본 `center` 는 "세이프존 통째로 중앙정렬"을
> 뜻하고, 저작 배치의 상대 관계를 그대로 보존한다. 위치로 추측하면(좌⅓=left 등) 중앙에 모여
> 있어야 할 UI 가 화면 폭에 따라 벌어져 디자인이 깨진다. 화면 모서리에 붙어야 하는 노드만
> `pinX: left/right` 로 **명시** 예외 처리한다.

구현 레퍼런스: `games/Homerun/src/ui/layoutAnchor.ts` (`anchorLayoutDoc`).
Phaser 비의존 순수 모듈로 분리해 두었다 — 좌표 규약은 단위 테스트로 고정해야 하는데 Phaser 를
import 하면 DOM 없는 테스트 환경에서 로드 자체가 실패한다.

## 4. 배경 규약

- **배경은 축소(fit)하지 않는다. 크롭/확장(cover)한다.** 세로가 줄면 자르고, 가로가 늘면 더 보여준다.
- 배경 노드는 저작 폭보다 **넓게** 그려야 한다. 필요 폭 = `designWidthRange.max`.
  이보다 좁으면 가로 확장 구간에서 배경 옆에 빈 띠가 생긴다 — **이것이 채택의 실질적 관문이다.**
- "이 노드가 배경인가" 판정 임계값은 **캔버스 폭이 아니라 저작 폭 상수**를 써야 한다.
  캔버스 폭이 가변인데 캔버스 폭을 기준으로 삼으면 폭이 늘어난 순간 판정이 뒤집힌다.

## 5. 채택 전제 조건 (반드시 확인)

1. **배경 좌우 블리드** — 배경 노드 폭 ≥ `designWidthRange.max`. 부족하면 그만큼만 `max` 를 낮춰
   부분 적용하거나, 배경 에셋을 다시 그린다.
2. **월드/필드 수학이 `w/2` 상대 좌표** — 절대 x 좌표(예 `540`)로 박아 둔 게임플레이 좌표가 있으면
   폭이 늘어난 순간 어긋난다. 홈런팝은 `zoneX`·`batContactX`·타구 궤적이 전부 `w/2` 기준이라 통과했다.
3. **광고 슬롯 분리** — 배너를 캔버스 위에 겹치지 말고 컨테이너 아래 별도 슬롯에 둔다.
   컨테이너 높이 = 뷰포트 − 배너. (홈런팝 `src/main.ts` 참조)

## 6. 검증 방법

컨테이너 대비 캔버스 렌더 rect 를 재서 **여백 px 이 0인지** 본다. 스크린샷 눈대중은 페이지
여백과 캔버스 레터박스를 구분하지 못한다.

```js
const c = document.querySelector('canvas').getBoundingClientRect();
const b = document.getElementById('game-container').getBoundingClientRect();
console.log('캔버스', __game.scale.width + 'x' + __game.scale.height,
            '좌우여백', Math.round((b.width - c.width) / 2));
```

홈런팝 실측(2026-08-04, Chromium):

| 뷰포트 | 캔버스 | 세로 손실 | 좌우 여백 |
|---|---|---|---|
| iPhone 15 393×852 | 1144×2200 | 8% | **0px** |
| iPhone SE 375×667 | 1445×2200 | 8% | **0px** |
| 데스크톱 1163×1450 | 1600×2200 | 8% | 89px (폭 상한 도달) |

## 7. 전 프로젝트 채택 현황 (2026-08-04 실측)

각 게임의 상세·적용 코드는 그 게임의 `CLAUDE.md` 「화면비 대응 표준」 절에 있습니다.
이 표는 `scripts/record-responsive-standard.mjs` 로 언제든 재생성됩니다.

| 상태 | 게임 | 배경 최대 폭 | 다음 할 일 |
|---|---|---|---|
| ✅ 적용 완료 | Homerun | 2415 | 레퍼런스 구현 |
| 🟢 즉시 적용 가능 | SoccerGO(3189), Solitare(4341) | ≥1600 | 전제 조건 확인 후 2줄 교체 |
| 🟡 부분 적용 가능 | Logistics(1430), Grillking(1429), eco01(1370), ZombieArrow(1351), Archery(1359), SumoClash(1213) | 1213~1430 | 배경 폭까지만 `wMax` 설정 — iPhone 15 는 커버, SE 는 여백 잔존 |
| 🔴 배경 재작업 필요 | store(1116), SoccerFlick(1098), FlockGo(1080) | ≈저작 폭 | 배경을 1600px 폭으로 다시 그린 뒤 적용 |
| 🔴 저작 프레임 확장 필요 | DragonBeat, PathRush, PawLink, bubblepong | — | 720×1280(16:9) 저작이라 블리드 자체가 없음. 20:9 로 확장 필요 |
| 🔴 저작/코드 불일치 | DuckhuntRush, Pickmeup, SocialCasino | — | `game.ts` 의 `designWidth` 와 레이아웃 프레임이 어긋남. **이것부터 정리** |

우선순위 제안: 🟢 2종 → 🟡 6종(에셋 재작업 없이 iPhone 15 계열 커버) → 🔴 순.
🔴 「저작/코드 불일치」는 표준과 무관하게 이미 좌표가 어긋나 있을 수 있으니 먼저 확인하세요.

## 8. 알려진 한계

- **캔버스 크기는 부팅 시 1회만 산출된다.** 창 크기를 바꾼 뒤에는 새로고침해야 반영된다.
  실기기에선 크기가 안 변해 문제되지 않지만, 데스크톱 QA 중 혼동하기 쉽다.
- 폭 상한을 넘는 초광폭(데스크톱 가로 창)은 필러박스가 남는다. 세로 게임이라 범위 밖으로 둔다.
