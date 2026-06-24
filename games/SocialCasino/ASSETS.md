# 슬롯매치(SocialCasino) — 에셋 사양

> 시각 보드: **[`design/index.html`](./design/index.html)** 를 브라우저로 열어 화면 청사진·카탈로그·체크리스트를 한눈에 본다.
> 이 문서는 그 사양의 버전관리용 사본(grep 가능). 화면 배치의 SSOT 는 phaser-ui-editor → `public/ui/layouts/*.json`.

## 게임 한 줄 요약
퍼즐+슬롯 하이브리드. 하단 **매치-3 보드**에서 3매치 → 스핀 적립(`MATCH = 1 SPIN`), 상단 **슬롯머신(5릴×3행)** 레버로 스핀 → 코인·잭팟. 소셜(TOP SPINNERS·INVITE·잭팟 게이지) + 베팅 배율.

## 디자인 프레임
- **1080 × 2400** HD 세로, Phaser FIT(레터박스). `designWidth: 1080`, `designHeight: 2400`.
- accent `#9B5DE5`(카지노 퍼플) · 배경 톤 `#1A1030`(딥 퍼플) · 골드 포인트 `#F5B400`.

## 화면 (에디터 _index.json)
| 화면 | 파일 | 용도 |
|------|------|------|
| 진입화면 | `blank.json` | 스플래시 / 시작 |
| 로비 | `blank_2.json` | **메인 플레이**(아래 영역 구성) |
| 팝업화면 | `blank_copy.json` | 일반 팝업 |
| 광고 보상 제안 | `popup_ad_3.json` | 리워드 광고 오퍼 |

## 로비(메인) 화면 영역 — 1080×2400 기준 권장 y범위
| 영역 | y범위 | 내용 |
|------|-------|------|
| 상단 HUD | 30–180 | 아바타·레벨 · 코인 · 경험치 바 · 에너지 5/5 · ☰메뉴 |
| 슬롯머신 | 210–1010 | 5릴×3행 릴 + 레버 / 좌측 TOP SPINNERS / 잭팟 0/10 + 보물상자 |
| 안내 배너 | 1040–1160 | MAKE 3 MATCHES → GET 1 SPIN! |
| 매치-3 보드 | 1190–1990 | 식료품 타일 스왑 매치(스핀 적립) |
| 파워업 바 + SPIN | 2020–2190 | 망치 · 로우블래스트 · [SPIN!] · 스왑 · 컬러밤 |
| 베팅 바 | 2220–2370 | BET AMOUNT − 1,000 🪙 + MAX BET |

## 카탈로그
### 슬롯 심볼(상단 릴)
`cherry` · `bell` · `crown` · `seven` · `star` · `bonus` · `coin`

### 매치 타일(하단 보드, 식료품 테마)
`apple` · `broccoli` · `cheese` · `soap` · `tissue` · `chips` · `coin` (+ 특수 `star`=컬러밤)

### 파워업(4종)
`hammer`(단일 제거) · `rowBlast`(가로줄) · `swap`(자리바꿈) · `colorBomb`(동색 일괄)

## 네이밍 규약
- 업로드 키 접두 **`up_SC_`**(에디터 규약; SocialCasino → SC). 예: `up_SC_Slot_01-1_v2`.
- 권장 분해 키(추후 per-아트): 심볼 `up_SC_SYM_<id>` · 타일 `up_SC_TILE_<id>` · 파워업 `up_SC_PU_<id>` · 배경 `up_SC_BG_01`.
- 매니페스트 `public/ui-assets.json` 에 `"키":"ui/uploads/파일.png"`(에디터가 자동 갱신).
- 로딩 화면 고정 파일명: `public/loading/{bg,logo,start_on,start_off}.png`.

## 에셋 체크리스트
### 브랜드 · 로딩
- [ ] `loading/bg.png` 1080×2400 — 풀스크린 배경
- [ ] `loading/logo.png` — 로고
- [ ] `loading/start_on.png` / `start_off.png` — START 활성/비활성

### 슬롯머신
- [x] `up_SC_Slot_01` — 슬롯머신 본체(업로드됨)
- [ ] 릴 심볼 7종(분해 시 `up_SC_SYM_*`) — 체리/벨/왕관/세븐/별/보너스/코인
- [ ] 레버 · 잭팟 게이지 · 보물상자 · TOP SPINNERS 랭킹 프레임

### 매치-3 보드
- [ ] `up_SC_TILE_<id>` 식료품 타일 7종(~140×140)
- [ ] 보드 판 배경 · 특수타일(별)

### 파워업 / 베팅
- [ ] `up_SC_PU_hammer` / `_rowBlast` / `_swap` / `_colorBomb`
- [ ] SPIN 버튼 · 베팅 −/+ · MAX BET

## 내보내기 규칙
- 스프라이트 시트 한 변 **≤ 2048px**. GPU 메모리 = 가로×세로×4(파일 용량 무관) → 표시 크기에 맞춰 최소화.
- 업로드 이미지는 표시 크기의 **2배 해상도 이내**. 투명 PNG.
- export 후 PNG→WebP 최적화(개발자). PNG 재내보내면 최적화 재실행.
