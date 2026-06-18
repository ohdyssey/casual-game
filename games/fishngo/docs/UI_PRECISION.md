# UI 정밀제작 기법 (UI Precision Workflow)

> 캔버스(Phaser) 게임 UI를 **추측 없이 측정·분수좌표·시각검증**으로 정밀하게 조립하는
> 재사용 가능한 작업 체계. 통짜 baked 이미지 대신 조각을 데이터로 조립해 50+ 스테이지/팝업을
> 일관되게 양산한다.
>
> 첫 적용 사례: 낚시터 카드(LocationCard) — 통짜 `Location_kr_NN.webp` → 9조각 동적 조립.

---

## ★ UI 저작도구 (#uieditor) — 정밀 배치의 주 도구

분수값을 코드로 추측하지 말고 **게임 엔진으로 직접 보면서 배치**한다 (True WYSIWYG).
편집 결과는 `public/card.layout.json` 에 저장되고, 게임이 그 파일을 읽어 렌더한다.

```
npm run dev → http://localhost:5175/#uieditor
```

- **좌측**: 카드가 실제 렌더(그리드 오버레이). **우측**: DOM 패널(레이어·속성·툴바).
- 노드 클릭 → 선택(바운딩 박스 + 4핸들). 본체 드래그=이동 / 핸들 드래그=리사이즈.
- **Shift+클릭 = 다중 선택**(캔버스·레이어 목록 둘 다) → **드래그/방향키로 함께 이동**.
- **정렬 툴바**(선택 시 표시): 좌 ⬅ / 가로중앙 ↔ / 우 ➡ / 상 ⬆ / 세로중앙 ↕ / 하 ⬇ / 가로분배 ⇿ / 세로분배 ⇳.
  다중 선택 = 그룹 bbox 기준, 단일 선택 = 프레임 기준(예: ↔ = 카드 가로 중앙).
- 방향키 1px 넛지(Shift 10px) — 선택 전체. 레이어 목록에서 순서(▲▼)·표시(👁)·선택.
- 속성 패널에서 X/Y/W/H/깊이/글자·아이콘·별·슬롯 크기/반경/간격을 **숫자로 정밀 입력**(단일 선택).
- 작은 노드(코인 등)는 핸들이 본체를 덮어 **이동 전용**, 크기는 속성의 반경/크기 값으로 조정.
- **빈 곳 드래그 = 마키(박스) 선택**, **Ctrl+A** = 전체 선택. 프레임은 배경이라 레이어 목록으로만 선택.
- **편집**: Ctrl+Z 취소 / Ctrl+Shift+Z·Ctrl+Y 다시 / Ctrl+D 복제 / Ctrl+C·V 복사·붙여넣기 / Del 삭제 (히스토리 60).
- **에셋 교체**(속성 하단): 노드별 ① 기존 에셋 드롭다운 즉시 교체(node.key/onKey/offKey, 레이아웃에 저장)
  ② **⬆ 업로드**(이미지 파일 → `POST /__ui_asset` → public/ui/card/uploads/ 저장 + `card.assets.json` 매니페스트 병합
  → LoadingScene 가 매니페스트의 각 이미지를 2단계 로딩 → 게임에서도 커스텀 에셋 렌더).
- 툴바: **💾 저장**(→파일 기록, 게임 HMR 즉시 반영) / **⬇ 다운로드**(JSON) / ↻ 새로고침 / ⟲ 기본값 / 그리드 / 스냅.

**데이터 흐름**:
```
#uieditor 편집 → [저장] → POST /__ui_layout (Vite 플러그인) → public/card.layout.json
   → LoadingScene this.load.json('card_layout') → LocationCard.renderLayoutInto → 게임 카드
```
- 레이아웃 모델: `src/config/card-layout.js` (절대좌표 노드 배열 + `specToLayout`/`DEFAULT_LAYOUT`).
- 렌더 코어(편집기·게임 공유): `src/ui/LocationCard.js` `renderLayoutInto()`.
- 저장 엔드포인트: `vite.config.js` `uiLayoutSaver()` 플러그인 (dev 전용).
- 시드/리셋: `npm run ui:seed-layout` (spec → JSON 재생성). 통합검증: `npm run ui:editor-test`.

> 파일이 없으면 `DEFAULT_LAYOUT`(spec에서 생성)으로 fallback. 즉 분수 spec은 이제 **시드**이고,
> 실제 배치 권한은 저작도구(사람이 보는 화면)에 있다 → "추측" 제거.

---

## 핵심 원칙 4가지

1. **측정 우선 (Measure first).** 좌표/크기는 눈대중이 아니라 `ui-introspect`로 잰 실측치에서
   도출한다. 치수·알파 콘텐츠 경계·9-slice 보더를 먼저 안다.
2. **분수 좌표 (Fractional anchoring).** 절대 px가 아니라 "기준 박스 안의 0~1 분수"로 배치한다.
   스케일·해상도가 바뀌어도 내부 비율이 보존된다. (`AnchorBox`)
3. **선언적 spec (Declarative spec).** 좌표를 코드에 흩지 않고 `*.spec.js` 한 곳에 분수로 모은다.
   디자인 변경 = 데이터 한 줄 수정.
4. **시각 검증 루프 (Visual verify loop).** `#uilab` 하니스 + 자동 스크린샷으로 레퍼런스와 겹쳐
   보며 분수를 보정한다. HMR로 즉시 반영된다.

---

## 파이프라인 한눈에

```
원본 PNG ──ui:convert──▶ public/ui/<group>/ (WebP)
                              │
                    ui:introspect (치수·alpha bbox·9slice)
                              │
                       *.spec.js (분수 좌표 선언)
                              │
                  layout.js(AnchorBox/nineSlice) + 컴포넌트(조립)
                              │
                       #uilab + ui:shot (시각 검증)
                              │
                  spec 분수 보정 ◀── 그리드로 위치 읽기
                              ▼
                         씬에 통합
```

---

## 단계별 워크플로

### 1. 반입 (Convert) — 외부 PNG → 프로젝트 WebP

프로젝트 컨벤션: 모든 UI 자산은 WebP. 파일명은 보존(재반입 용이).

```bash
npm run ui:convert -- "D:/작업/UI/popup" ui/card          # quality 92
npm run ui:convert -- "D:/작업/배경" ui/card --quality=90  # 사진형
npm run ui:convert -- "D:/작업/아이콘" ui/icon --lossless  # 무손실
```

→ `public/ui/<dest>/<name>.webp` 생성. 이후 `assets.config.js` 의 `ASSETS` 에 의미 기반 키로 등록.

### 2. 계측 (Introspect) — 정밀 배치의 근거 데이터

```bash
npm run ui:introspect -- public/ui/card            # 사람 가독 테이블
npm run ui:introspect -- public/ui/card --json     # 기계 가독
```

출력 컬럼:
- **W×H** — 픽셀 치수 (spec의 designW/H, aspect 계산 근거)
- **콘텐츠(pad LTRB)** — 알파>임계 픽셀의 외접 사각형 → 투명 패딩 (조각이 셀 안에서 차지하는 실제 영역)
- **cov** — 알파 커버리지 (프레임/패널은 ~0.9+, 아이콘은 낮음)
- **9slice(TRBL)** — 불투명 프레임의 보더 inset 추정 (휴리스틱 — 시각 확인 권장)

> 패널처럼 "장식이 특정 위치에 박힌" 조각은 9-slice보다 **비율 유지 contain 배치**가 정밀하다.
> 9-slice는 단색 보더의 프레임/캡슐 버튼(임의 리사이즈 필요)에만 쓴다.

### 3. 선언 (Spec) — 분수 좌표 레이아웃

`src/config/<name>.spec.js` 에 기준 박스(프레임/패널) 대비 분수만 모은다.
프레임 직속 요소는 frame 분수, 패널 내부 요소는 **panel 분수(중첩)** 로 적는다.

```js
// 예: card.spec.js (발췌)
export const LOCATION_CARD_SPEC = {
  frame: { key: 'card_frame', designW: 408, designH: 645 },     // ← introspect 실측
  header: { key: 'card_header', cx: 0.50, cy: 0.082, wFrac: 0.95,
            title: { fy: 0.40, size: 30, ... } },               // title.fy 는 헤더 박스 내부 분수
  fishPanel: { key: 'card_panel_a', cx: 0.310, rowCy: 0.660, wFrac: 0.505,
               icons: { fy: 0.665, sizeFh: 0.62, gapFw: 0.035, max: 3 } },  // 패널 내부 분수
  ...
};
```

### 4. 조립 (Compose) — AnchorBox + 컴포넌트

`src/ui/layout.js` 의 `AnchorBox` 로 좌표를 푼다. **박스는 중첩된다**: 프레임 → 패널 → 셀.

```js
import { AnchorBox, placeFrac } from '../ui/layout.js';

// 프레임을 로컬 원점에 깔고, 그 박스를 분수로 가리킨다.
const box = new AnchorBox(-W/2, -H/2, W, H);
const panel = placeFrac(scene, box, spec.fishPanel.key, spec.fishPanel.cx, spec.fishPanel.rowCy, spec.fishPanel.wFrac, 1, { container });

// 패널을 먼저 배치 → 그 화면박스를 중첩 박스로 잡아 라벨/아이콘을 패널 분수로 배치.
const pb = AnchorBox.fromGameObject(panel);
const labelPos = pb.point(0.5, spec.fishPanel.label.fy);
```

핵심 API:
- `new AnchorBox(left, top, w, h)` / `AnchorBox.centered(cx,cy,w,h)` / `AnchorBox.fromGameObject(go)`
- `.fx(fr) .fy(fr) .fw(fr) .fh(fr) .point(fxr,fyr)` — 분수 → 절대
- `.sub(fl,ft,fwr,fhr)` — 내부 분수 영역을 새 박스로 (중첩)
- `.inset(fl,ft,fr,fb)` — 보더 안쪽 내용 영역
- `placeFrac(scene, box, key, fxr, fyr, fwBox, fhBox, {container,tint,maxScale})`
- `nineSlice(scene, key, cx, cy, w, h, insets)` / `stretchBarTo(...)` — 모서리 보존 리사이즈

**아트창처럼 둥근 클립이 필요한 이미지**는 geometry mask(컨테이너 follow 문제) 대신
캔버스 합성 정적 텍스처를 쓴다 — `LocationCard._roundedCoverTexture` 참고.

**컨테이너 틴트**: Container는 `setTint`가 없으므로 자식 이미지 목록을 모아 `setCardTint(tint)`로
일괄 적용한다 (dim/lock 상태).

### 5. 검증 (Verify) — #uilab + 스크린샷

```bash
npm run dev                                          # 5175 (또는 표시 포트)
# 브라우저: http://localhost:5175/#uilab
```

`#uilab` (UiLabScene) 조작:
- **좌/우 1/3 탭** — 이전/다음 대상
- **중앙 탭 / [O]** — 오버레이 순환 (카드만 → 카드+레퍼런스50% → 레퍼런스만)
- **[G]** — 분수 그리드(10% 격자 + 라벨) 토글 → 위치를 분수로 직접 읽음
- **[1~3]** — 대상 직접 선택

자동 스크린샷 (CI/반복 비교용):
```bash
npm run ui:shot -- http://localhost:5175/#uilab tmp/card.png 6500 760 1440
npm run ui:verify-card                                # 4모드(오버레이/레퍼런스/카드/그리드) 일괄 캡처
```

> Playwright는 **실제 키 입력(CDP)** 으로 모드를 전환한다. 합성 `KeyboardEvent`는 `keyCode`가
> 없어 Phaser가 못 받으므로 `page.keyboard.press` 를 쓴다 (verify-card.cjs 참고).

### 6. 보정 (Calibrate)

그리드로 읽은 위치와 레퍼런스 오버레이를 보고 **spec의 분수만 수정** → HMR 즉시 반영.
코드는 건드리지 않는다. 만족스러우면 끝.

---

## 산출물 맵

| 파일 | 역할 |
|------|------|
| `scripts/ui-introspect.cjs` | 계측 — 치수·alpha bbox·9slice inset (`npm run ui:introspect`) |
| `scripts/convert-ui.cjs` | 반입 — PNG→WebP (`npm run ui:convert`) |
| `scripts/shot.cjs` | 단일 스크린샷 (`npm run ui:shot`) |
| `scripts/verify-card.cjs` | 카드 4모드 일괄 캡처 (`npm run ui:verify-card`) |
| `src/ui/layout.js` | `AnchorBox` (분수 좌표) + `nineSlice`/`placeFrac` 헬퍼 |
| `src/config/card.spec.js` | 낚시터 카드 선언적 레이아웃 spec |
| `src/ui/LocationCard.js` | spec 기반 카드 동적 조립 컴포넌트 |
| `src/scenes/UiLabScene.js` | `#uilab` 시각 검증 하니스 |

---

## 새 팝업/카드에 적용하기 (레시피)

1. 조각 PNG를 `npm run ui:convert` 로 `public/ui/<group>/` 에 반입, `assets.config.js` 키 등록.
2. `npm run ui:introspect` 로 치수/경계 측정 → 기준 프레임의 designW/H 결정.
3. `src/config/<name>.spec.js` 작성 — 프레임 분수 + 패널 중첩 분수.
4. 컴포넌트 작성 — `AnchorBox` + `placeFrac`/중첩 박스로 조립 (LocationCard.js를 템플릿으로).
5. `UiLabScene`에 새 대상 분기 추가 → `#uilab`에서 그리드·오버레이로 보정.
6. 씬에 통합. 통짜 이미지는 fallback으로만 유지.

---

## 안티패턴

- ❌ 절대 px 하드코딩 흩뿌리기 → ✅ spec의 분수로 모으기
- ❌ "대충 이쯤" 눈대중 → ✅ introspect 실측 + 그리드로 읽기
- ❌ 장식 박힌 패널을 9-slice로 늘리기(장식 이동) → ✅ 비율 유지 contain
- ❌ 컨테이너에 둥근 geometry mask(스케일/이동 follow 깨짐) → ✅ 캔버스 합성 정적 텍스처
- ❌ 합성 KeyboardEvent로 검증 자동화 → ✅ Playwright 실제 키 입력(CDP)
- ❌ 통짜 baked 이미지 50장 양산 → ✅ 9조각 + 데이터로 50장 생성
