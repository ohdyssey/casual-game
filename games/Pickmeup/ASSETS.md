# 픽미업(Pick Me Up!) — 에셋 사양

> 시각 보드: **[`design/index.html`](./design/index.html)** 를 브라우저로 열어 화면 청사진·색 카탈로그·체크리스트를 한눈에 본다.
> 이 문서는 그 사양의 버전관리용 사본(grep 가능). 화면 배치의 SSOT 는 phaser-ui-editor → `public/ui/layouts/main.json`.

## 게임 한 줄 요약
색 정렬 주차장 퍼즐. 보드의 색깔 차량을 탭하면 같은 색 **픽업 슬롯**으로 이동 → 슬롯의 버스가 같은 색으로 차면 출발(승객 픽업)하고 슬롯이 비워진다. 슬롯 수 제한이 곧 난이도. 보드를 다 비우면 클리어.

## 디자인 프레임
- **720 × 1280** 세로, Phaser FIT(레터박스). `designHeight: 1280`.
- accent `#E5703A` · 배경 톤 `#2a1c12`(나무책상/놀이방).

## 색 카탈로그 (퍼즐의 축)
차량·버스·승객·슬롯은 같은 색끼리 매칭. 코어 6색(색을 늘리면 난이도↑).

| id | hex |
|----|-----|
| blue | `#3f7fe0` |
| red | `#e24b3b` |
| yellow | `#f2c12e` |
| green | `#4caf50` |
| pink | `#e85aa0` |
| orange | `#E5703A` |

## 화면 영역(720×1280 기준 권장 시작 좌표)
| 영역 | y범위 | 내용 |
|------|-------|------|
| 상단 HUD | 20–140 | 레벨 · 승객 30/40 · 보드 남음 · ⚙설정 |
| 승객 대기 큐 | 156–252 | 색깔 승객 줄(픽업 목표) |
| 픽업 슬롯 | 268–436 | 열린 5 + 잠금 3 |
| 도로 | 452–508 | 출발 버스 통과 연출 레인 |
| 차량 보드(퍼즐) | 524–1120 | 색깔 차량 — 탭 → 같은 색 슬롯 |
| 부스터 바 | 1136–1260 | 슬롯추가 · 셔플 · 터보 · VIP보드 |

## 네이밍 규약
- 업로드 키 접두 `up_`(에디터 규약).
- 차량 `up_Pickmeup_CAR_<색>` · 버스 `up_Pickmeup_BUS_<색>` · 승객 `up_Pickmeup_PAX_<색>`
- UI 공통 `up_Pickmeup_UI_<이름/NN>` · 배경 `up_Pickmeup_BG_01`
- 매니페스트 `public/ui-assets.json` 에 `"키":"ui/uploads/파일.png"`(에디터가 자동 갱신).
- 로딩 화면 고정 파일명: `public/loading/{bg,logo,start_on,start_off}.png`

## 에셋 체크리스트
### 브랜드 · 로딩
- [ ] `loading/bg.png` 720×1280 — 풀스크린 배경
- [x] `loading/logo.png` — 허브 `PickmeUp_logo_t.png` 재사용 가능
- [ ] `loading/start_on.png` / `start_off.png` — START 활성/비활성

### 상단 HUD
- [ ] `up_Pickmeup_UI_hud` ~680×120 — HUD 프레임
- [ ] `up_Pickmeup_UI_settings` 88×88 — ⚙
- [ ] `up_Pickmeup_UI_paxbadge` ~200×72 — 👤 30/40

### 게임플레이 (색 × 6)
- [ ] `up_Pickmeup_CAR_<색>` ~120×120 — 보드 차량(진행방향 ▲ 통일)
- [ ] `up_Pickmeup_BUS_<색>` ~140×96 — 픽업 버스(채움 단계 표현 권장)
- [ ] `up_Pickmeup_PAX_<색>` ~48×72 — 대기 큐 승객
- [ ] `up_Pickmeup_UI_slot` ~120×150 — 빈 슬롯 바닥
- [ ] `up_Pickmeup_UI_slot_lock` ~120×150 — 🔒 UNLOCK 슬롯
- [ ] `up_Pickmeup_BG_board` ~680×600 — 보드 판(앵커)
- [ ] `up_Pickmeup_BG_01` 720×1280 — 전체 배경

### 부스터 (4종)
- [ ] `up_Pickmeup_UI_bst_addslot` — +슬롯
- [ ] `up_Pickmeup_UI_bst_shuffle` — 셔플
- [ ] `up_Pickmeup_UI_bst_turbo` — ×2 터보
- [ ] `up_Pickmeup_UI_bst_vip` — VIP보드

### FX
- [x] 픽업 반짝임·출발 파티클 — 런타임 Graphics 로 생성 가능(선택).

## 내보내기 규칙 (에디터가 자동으로 안 지켜줌)
- 스프라이트 시트 한 변 **≤ 2048px**.
- GPU 메모리 = 가로 × 세로 × 4 (파일 용량 무관) → 표시 크기에 맞춰 최소화.
- 업로드 이미지는 표시 크기의 **2배 해상도 이내**.
- 투명 PNG. 차량/버스는 진행방향 ▲(north) 기준 통일.
- export 후 PNG→WebP 최적화(개발자). PNG 재내보내면 최적화 재실행.
