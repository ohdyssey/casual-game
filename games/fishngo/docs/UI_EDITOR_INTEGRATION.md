# UI ↔ 에디터 연결 가이드 (정규화 절차)

게임 화면 UI를 인게임 저작도구 `#uieditor`로 편집 가능하게 만드는 표준 절차와 **명령 규약**.

---

## 1. 개념 — 무엇이 "연결"인가

`#uieditor`는 **문서 레지스트리**에 등록된 화면만 편집 목록에 띄운다. 한 화면이 "연결"되려면 **두 가지**가 모두 필요하다:

1. **레지스트리 등록** — 에디터가 그 화면을 알아야 함 (`src/config/ui-screens.js` 매니페스트 → `ui-docs.js` 자동 파생)
2. **씬의 렌더 경로** — 게임 씬이 그 레이아웃 JSON을 읽어 렌더해야 함 (`buildChromeFromLayout`)

둘 중 하나라도 없으면 안 뜬다(또는 떠도 게임에 반영 안 됨).

### 연결 방식 = "외형 스킨 하이브리드"
- **레이아웃**(`public/ui/layouts/*.json`) = 외형(이미지·텍스트·위치·색).
- **게임 코드** = 동적 데이터(코인/레벨…)와 클릭/액션을 레이아웃 노드의 `role`/`binding`으로 찾아 연결.
- 동적 게임플레이(매 프레임 계산·물리)는 **레이아웃화하지 않고** 코드로 둔다.

---

## 2. 명령 규약 (이렇게 부르면 됩니다)

| 명령 | 동작 |
|------|------|
| **"에디터에 `<id>` 연결해줘"** | 매니페스트 추가 → 범용 캡처 → 씬 와이어 → 검증 → 커밋·배포 |
| **"에디터에서 `<id>` 저장했어, 반영해줘"** | 저장된 `*.json`을 커밋·배포(프로덕션 반영) |
| **"`<id>` 다시 캡처해줘"** | `node scripts/capture-screen.cjs <id>` 로 시드 재생성 |
| **"`<id>` 폴백으로 되돌려줘"** | 연결 해제(레이아웃 무시, 기존 하드코드로) |

> `<id>`는 매니페스트의 화면 id (예: `home`, `home_tabs`, `loading`, `fishing_hud`).

---

## 3. 표준 절차 (제가 수행하는 3단계)

### ① 매니페스트 등록 — `src/config/ui-screens.js`
화면 1개 = 항목 1개. 캡처 대상·앵커·role/binding을 선언:
```js
{ id, name, file, cacheKey, captureScene, reach,
  anchor: 'top'|'bottom'|'center', anchorOffset, frame,
  sample, capture: { images:[…], texts:[…], repeat:{…} } }
```
→ `ui-docs.js`가 `screenToDoc()`로 **자동 등록**(에디터 목록 노출). 별도 등록 코드 불필요.

### ② 범용 캡처 — `scripts/capture-screen.cjs`
```bash
node scripts/capture-screen.cjs <id> http://127.0.0.1:<devPort>
```
→ `captureScene`을 띄워 현재 하드코드 UI 지오메트리를 읽고 `public/<file>` 시드 생성.
캡처는 **근사 시드**다(앵커별 좌표 변환 포함) — 미세 위치는 에디터에서 조정.

### ③ 씬 와이어 — `src/ui/sceneChrome.js`
씬의 기존 `_buildXxx(W)` 하드코드 호출을 헬퍼로 교체(폴백 보존):
```js
const res = buildChromeFromLayout(this, {
  cacheKey: 'layout_<id>', anchor: 'top', depth: DEPTH.hud,
  data: { /* binding 값 */ },
  roleHandlers: { 'action:foo': () => … },        // 단순 role 클릭
  onEntries: (entries, ctx) => { /* 하트·라이브참조 등 */ },
  fallback: () => this._buildXxxHardcoded(W),       // 레이아웃 없으면 원본
});
this._xxxContainer = res ? res.container : null;     // 재진입 대비 create()에서 null 리셋
```
씬 `preload()`에 캐시버스트 로드 추가:
```js
this.cache.json.remove('layout_<id>');
this.load.json('layout_<id>', `<file>?t=${Date.now()}`);
```

---

## 4. 앵커 모드 (화면 위치 고정 방식)

| anchor | 컨테이너 위치 | 용도 | ⚠ |
|--------|--------------|------|----|
| `top` | `(designW/2, designH/2)` 고정 | 상단 HUD | 톨폰에서 상단 유지 |
| `bottom` | `(designW/2, sh - anchorOffset)` | 하단 탭바 | 프레임중심(fh/2)이 화면하단에 붙음 |
| `center` | `(scale.width/2, scale.height/2)` | 전체화면 팝업 | 실제 화면 중앙 |

> 팝업식 `center`를 상단 HUD에 쓰면 톨폰(`scale.height > designH`)에서 아래로 밀린다 — 상단은 반드시 `top`.

---

## 5. 저장 ≠ 커밋 (반영 단계)

| 단계 | 어디에 | 언제 보임 |
|------|--------|-----------|
| 에디터 미리보기 | 에디터 | 즉시 |
| **저장**(에디터 버튼) | 데브서버 로컬 파일 | 새로고침/씬 재진입 후 |
| **커밋·푸시** | 프로덕션 | 배포 후 |

`*.json`은 **런타임 자산**이라 커밋해야 프로덕션 반영(미커밋 시 폴백으로 떨어짐).

---

## 6. 현재 연결 현황

| id | 화면 | anchor | 사용 씬 | 비고 |
|----|------|--------|---------|------|
| `card` | 낚시터 카드 | — | HomeScene | card.layout.json (캐러셀) |
| `home` | 홈 상단 HUD | top | HomeScene | 코인/XP, 하트, MENU/RANK |
| `home_tabs` | 홈 하단 탭바 | bottom | HomeScene | 홈/강화/도감/상점 |
| `fishing` | 낚시 상단 HUD | top | FishingScene | 코인/XP 라이브, 하트, MENU/RANK |
| `fishing_tabs` | 낚시 하단 탭바 | bottom | FishingScene | 홈/강화/도감/상점 |
| upgrade/album/shop/bait/line/reel/rod/result | 팝업류 | center | 각 팝업 씬 | 기존 |

> 홈과 낚시는 같은 초기 구성을 사용하지만 문서는 독립적이다. `fishing` / `fishing_tabs`를 편집하면 낚시 화면에만 반영된다.

### 의도적 미연결 (레이아웃화 부적합)
- **CAST 버튼** — 스프라이트 애니 + 카드와 군집이동 + 핵심 입력
- **낚시 동적 요소** — 물고기 게이지·바늘 회전·HP바·카메라 셰이크·캐치 쇼케이스 (매 프레임 계산)
- **카드 캐러셀** — 군집 로직 (카드 자체는 card.layout.json로 편집 가능)
- **로딩 화면(LoadingScene)** — ⚠ **현 모델 부적합.** 모든 요소가 **비례좌표**(`W*fx, H*fy`) + 트윈으로 배치되고(로고 top·진행바 bottom·배경 full = 혼합 앵커), 화면 자체가 **자산 로더**다(자기 레이아웃을 BootScene 에서 선로드해야 함). 고정프레임(top/bottom/center) 단일 앵커로는 톨폰에서 깨짐. → **`pct` 비례앵커 노드 모드**(노드 좌표를 화면비율로 해석)를 추가해야 깔끔히 연결 가능. (후속 과제 — 명령: "비례앵커 모드 만들어줘")

---

## 7. 관련 파일

- `src/config/ui-screens.js` — 매니페스트(단일 출처)
- `src/ui/sceneChrome.js` — 와이어 헬퍼(buildChromeFromLayout, fillHeartsInto)
- `scripts/capture-screen.cjs` — 범용 캡처
- `src/config/ui-docs.js` — 에디터 문서 레지스트리(매니페스트 자동 파생 + 팝업류)
- 메모리: `ui-layout-wiring`, `ui-runtime-capture`, `ui-authoring-tool`
