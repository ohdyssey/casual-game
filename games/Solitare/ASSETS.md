# 솔리테어 하이츠 — 에셋 사양

> 시각 보드: **[`design/index.html`](./design/index.html)** 를 브라우저로 열어 화면 청사진·카드 사양·체크리스트를 본다.
> 이 문서는 그 사양의 버전관리용 사본(grep 가능). 화면 배치의 SSOT 는 phaser-ui-editor → `public/ui/layouts/{main,home}.json`.

## 게임 한 줄 요약
탑 쌓기형 캐주얼 솔리테어. TriPeaks + ±1 랭크 + 순환(A↔K). 노출 카드를 웨이스트와 ±1 로 이어 제거,
보드를 비우면 층 클리어 → 타워를 쌓아 올린다.

## 디자인 프레임
- **1080 × 2400** 세로 HD, Phaser FIT(레터박스). `designWidth:1080, designHeight:2400`.
- accent `#E86FA6`(타워 핑크) · 홈 배경 = 이미지1 타워, 플레이 배경 = 층(상점) 테마.
- ⚠️ HD 라 코어 720 responsive 헬퍼 미사용 — 절대 좌표(순수 FIT 1:1).

## 에셋 현황 (이미 반영 · `public/ui/uploads/`)
| 키 | 파일 | 원본 | 용도 |
|----|------|------|------|
| `up_Solitaire_BG_Back01` | Slitare_BG_Back01 | 841×1870 | 도시 거리 배경(홈·플레이 공용, cover) |
| `up_Solitaire_BG_01` | Slitare_BG_01 | 837×566 | 1층 Golden Crust Bakery |
| `up_Solitaire_BG_02` | Slitare_BG_02 | 766×503 | 2층 Ramen Yokocho |
| `up_Solitaire_BG_03` | Slitare_BG_03 | 775×484 | 3층 Bean & Bloom Coffee |
| `up_Solitaire_BG_04` | Slitare_BG_04 | 690×428 | 4층 Ocean Flame Seafood |
| `up_Solitaire_BG_05` | Slitare_BG_05 | 654×427 | 5층 Sweet Escape Dessert |

층 아트 키 = `floorArtKey(level)` = `up_Solitaire_BG_0N`(N=level). 배경 = `BACK_BG_KEY`(`src/assets.ts`).

## 남은 에셋 체크리스트 (`up_` 접두)
| 키 | 내용 | 수량 | 비고 |
|----|------|------|------|
| `up_Solitaire_CARD_<suit><rank>` | 카드 앞면 52장 | 52 | suit=S/H/D/C · rank=1..13. 현재 코드 드로우 |
| `up_Solitaire_CARD_back` | 카드 뒷면 | 1 | 이미지2식 파란 백. 현재 코드 드로우 |
| `loading/{bg,logo,start_on,start_off}.png` | 포털 로딩 화면 | 4 | 준비 후 makePortalLoading 배선 |

카드는 코드 계약이 `cardFaceKey(suit,rank)`/`CARD_BACK_KEY`(`src/assets.ts`)와 1:1 — 키만 맞추면 자동 대체.

## 타워 층(레벨) — 아트 순서(아래→위로 쌓임, 좁아지는 테이퍼)
1F Golden Crust Bakery · 2F Ramen Yokocho · 3F Bean & Bloom Coffee · 4F Ocean Flame Seafood · 5F Sweet Escape Dessert. 각 아트가 간판(상점명)을 포함.

## 화면 구성
- **홈(HomeScene)**: 도시 배경 + 상점 층을 아래→위로 쌓은 타워. 층 탭 → 그 레벨 플레이. 레벨↑ = 위층 해금(진행 로직 이후).
- **플레이(PlayScene · 1080×2400)**:
  | 영역 | y범위 | 내용 |
  |------|-------|------|
  | 상단 HUD | 0–150 | 코인 · 콤보 · 남은 카드 · 홈 |
  | 현재 층 아트 | 200–720 | 그 레벨 상점 스토어front(제일 상단층을 화면 상단에) |
  | 검은 반투명 보드 | 770–2376 | 솔리테어 진행 영역 |
  | 팬 그룹 카드 | 1020–1720 | 이미지2 방식 3×2=6그룹(앞면1+뒷면2) |
  | 스톡/웨이스트 | 1830–2050 | 더미(뽑기) + 기준 카드 |

규칙: 앞면 탭(±1 순환 매칭) 제거 → 뒤 두 장 노출. 보드 클리어 = 층 클리어. 보드 형태 = `IMAGE2_GRID`(layouts.ts, `buildFannedGrid(3,2)`).

## 내보내기 규칙
- 투명 PNG(카드는 라운드 모서리 포함), 긴 변 ≤ 2048px. 배포 시 WebP 전환.
- 카드 앞면 비율 ≈ 3:4(140×192 렌더 기준). 뒷면 동일 규격.
