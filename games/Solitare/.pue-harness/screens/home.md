# home — 타워

1080×2400 · 노드 58개 · rev `4e030c3e`

## 구조

- **상단** (9개) — 코인 패널, 125,250, 125,250 복사, 125,250 복사, 상점, t, 리그, t 복사 …
- **상중단** (10개) — 하늘, 3층 Bean&Bloom, Roof, 패키지, t 복사, 랭킹, t 복사, 시즌패스 …
- **중앙** (10개) — 원경, 중경, 중경 복사, 2층 GoldenCrust, 2_캐릭터, Glass 복사, 2_캐릭터 복사, 코인 상점 …
- **중하단** (17개) — 자동차3, 가로등, 가로등 복사, 소화전, 소화전 복사, 1층 로비, Glass 복사, 매입버튼 …
- **하단** (12개) — 도로, 도로 복사, 도로 복사, 화분, 화분 복사, 1_캐릭터, Glass, 플레이 버튼 …

## 배치도

화면을 10×16 격자로 본 모습(왼쪽 위가 원점). `.` = 빈 곳.

```
3333ii3333
aa......kk
88......99
88......77
........77
..........
16........
1h.......2
1j.......2
1........2
1..egg4..2
cc.4444.dd
cc......dd
1..5ff5..2
1..5ff5..2
..........
```

| 기호 | id | 라벨 | 종류 |
|---|---|---|---|
| `1` | `layer_16` | 부지구입 | button? |
| `2` | `layer_16_copy` | 부지구입1 | button? |
| `3` | `layer_4` | 코인 패널 | button? |
| `4` | `layer_8_copy` | 매입버튼 | button? |
| `5` | `layer_8` | 플레이 버튼 | button? |
| `6` | `layer_11_copy2` | 코인 상점 | button? |
| `7` | `layer_11_copy5` | 시즌패스 | button? |
| `8` | `layer_11_copy` | 패키지 | button? |
| `9` | `layer_11_copy4` | 랭킹 | button? |
| `a` | `layer_11` | 상점 | button? |
| `b` | `layer_11_copy3` | 리그 | button? |
| `c` | `layer_17` | 스와이프 좌 | button? |
| `d` | `layer_17_copy` | 스와이프 우 | button? |
| `e` | `layer_8_copy4` | 코인아이콘 | button? |
| `f` | `layer_9` | 게 | text |
| `g` | `layer_10` | 매입텍스트 | text |
| `h` | `layer_13_copy7` | t 복사 | text |
| `i` | `layer_5` | 125,250 | text |
| `j` | `layer_13_copy2` | t 복사 | text |
| `k` | `layer_13_copy6` | t 복사 | text |

## ⚠ 추정된 상호작용 — 확정이 아닙니다

저작자가 역할을 지정하지 않아 하네스가 **유추한 후보**입니다.
구현에 참고하되 **코드에 `TODO` 로 남겨** 사람이 확인할 수 있게 하세요.
저작된 역할(`action:`)이 있으면 언제나 그쪽이 우선합니다.

| id | 라벨 | 확신 | 추정 동작 | 근거 |
|---|---|---|---|---|
| `layer_8` | 플레이 버튼 | 95% | `play` | 에셋 키가 UI 계열 (up_Solitare_UI_21_v2) · 이름에 버튼/구매 표현 ("플레이 버튼") · 인접 캡션 텍스트 "계속하기" (layer_9) · 이름에서 동작 추정 → "play" |
| `layer_8_copy` | 매입버튼 | 95% | `buy` | 에셋 키가 UI 계열 (up_Solitare_UI_21-3) · 이름에 버튼/구매 표현 ("매입버튼") · 인접 캡션 텍스트 "1.5K" (layer_10_copy3) · 이름에서 동작 추정 → "buy" |
| `layer_11_copy` | 패키지 | 90% | `package` | 에셋 키가 UI 계열 (up_Solitare_UI_16_v2) · 인접 캡션 텍스트 "Pack" (layer_13_copy) · 같은 크기 아이콘 3개 묶음 = 메뉴/내비 패턴 · 이름에서 동작 추정 → "package" |
| `layer_11_copy4` | 랭킹 | 90% | `rank` | 에셋 키가 UI 계열 (up_Solitare_UI_19_v2) · 인접 캡션 텍스트 "Rank" (layer_13_copy4) · 같은 크기 아이콘 3개 묶음 = 메뉴/내비 패턴 · 이름에서 동작 추정 → "rank" |
| `layer_11_copy5` | 시즌패스 | 90% | `pass` | 에셋 키가 UI 계열 (up_Solitare_UI_20_v2) · 인접 캡션 텍스트 "Pass" (layer_13_copy5) · 같은 크기 아이콘 3개 묶음 = 메뉴/내비 패턴 · 이름에서 동작 추정 → "pass" |
| `layer_11` | 상점 | 70% | `shop` | 에셋 키가 UI 계열 (up_Solitare_UI_15) · 인접 캡션 텍스트 "Shop" (layer_13) · 이름에서 동작 추정 → "shop" |
| `layer_11_copy2` | 코인 상점 | 70% | `shop` | 에셋 키가 UI 계열 (up_Solitare_UI_17_v2) · 인접 캡션 텍스트 "1200" (layer_13_copy7) · 이름에서 동작 추정 → "shop" |
| `layer_11_copy3` | 리그 | 70% | `league` | 에셋 키가 UI 계열 (up_Solitare_UI_18_v2) · 인접 캡션 텍스트 "15" (layer_13_copy3) · 이름에서 동작 추정 → "league" |
| `layer_4` | 코인 패널 | 70% | `gold` | 에셋 키가 UI 계열 (up_Solitare_UI_14_v3) · 인접 캡션 텍스트 "125,250" (layer_5) · 이름에서 동작 추정 → "gold" |
| `layer_17` | 스와이프 좌 | 50% | `swipe` | 에셋 키가 UI 계열 (up_Solitare_UI_21-1) · 이름에서 동작 추정 → "swipe" |
| `layer_17_copy` | 스와이프 우 | 50% | `swipe` | 에셋 키가 UI 계열 (up_Solitare_UI_21-2) · 이름에서 동작 추정 → "swipe" |
| `layer_8_copy4` | 코인아이콘 | 50% | `gold` | 에셋 키가 UI 계열 (up_Solitare_UI_2-3_v3) · 이름에서 동작 추정 → "gold" |
| `layer_16` | 부지구입 | 25% ⚠ | `buy` | 에셋 키가 배경·캐릭터 계열 (up_Slitare_BG_Ruin_01) · 이름에 버튼/구매 표현 ("부지구입") · ⚠ 신호 충돌 — 이름은 버튼인데 에셋은 배경 계열. 사람 확인 필요 · 이름에서 동작 추정 → "buy" |
| `layer_16_copy` | 부지구입1 | 25% ⚠ | `buy` | 에셋 키가 배경·캐릭터 계열 (up_Slitare_BG_Ruin_05) · 이름에 버튼/구매 표현 ("부지구입1") · ⚠ 신호 충돌 — 이름은 버튼인데 에셋은 배경 계열. 사람 확인 필요 · 이름에서 동작 추정 → "buy" |

## 전체 노드 (z 오름차순 — 뒤에서 앞으로)

| id | 라벨 | 타입 | rect (l,t,w,h) | 비고 |
|---|---|---|---|---|
| `layer_14` | 하늘 | image | (-263,-937) 1586×2993 | 에셋 up_Slitare_BG_Back01-1 |
| `layer_1_copy` | 원경 | image | (-218,-364) 1498×2824 | 에셋 up_Slitare_BG_Back01-12-1 |
| `layer_1_copy2` | 도로 | image | (-673,1884) 2285×592 | 에셋 up_Slitare_BG_Back01-10_v5 |
| `layer_1_copy3` | 도로 복사 | image | (1595,1885) 2285×592 | 에셋 up_Slitare_BG_Back01-10_v5 |
| `layer_1_copy4` | 도로 복사 | image | (-2920,1884) 2285×592 | 에셋 up_Slitare_BG_Back01-10_v5 |
| `layer_1_copy5` | 중경 | image | (-3674,879) 4341×1087 | 에셋 up_Slitare_BG_Back01-11-1_v5 |
| `layer_15_copy2` | 자동차3 | image | (-33,1823) 260×114 | 에셋 up_Car_01 |
| `layer_1_copy6` | 중경 복사 | image | (574,879) 4341×1087 | 에셋 up_Slitare_BG_Back01-11-1_v5 |
| `layer_1` | 가로등 | image | (25,1694) 79×391 | 에셋 up_Slitare_BG_Item_01 |
| `layer_1_copy7` | 가로등 복사 | image | (976,1695) 79×391 | 에셋 up_Slitare_BG_Item_01 |
| `layer_1_copy8` | 소화전 | image | (89,1965) 79×119 | 에셋 up_Slitare_BG_Item_02 |
| `layer_1_copy10` | 화분 | image | (-3,2043) 112×109 | 에셋 up_Slitare_BG_Item_04 |
| `layer_1_copy9` | 소화전 복사 | image | (915,1965) 79×119 | 에셋 up_Slitare_BG_Item_02 |
| `layer_1_copy11` | 화분 복사 | image | (973,2038) 112×113 | 에셋 up_Slitare_BG_Item_05 |
| `layer_4` | 코인 패널 | image | (31,38) 1018×104 | 에셋 up_Solitare_UI_14_v3 |
| `layer_5` | 125,250 | text | (486,70) 126×43 | "125,250" · 크기 근사 |
| `layer_2` | 1층 로비 | image | (121,1709) 858×513 | 에셋 up_Slitare_BG_01_v3 |
| `layer_7` | 1_캐릭터 | image | (640,1944) 150×233 | 에셋 up_Solirare_Chr_01 |
| `layer_6` | Glass | image | (195,2081) 690×111 | 에셋 up_Slitare_BG_Glass |
| `layer_2_copy` | 2층 GoldenCrust | image | (121,1197) 859×518 | 에셋 up_Slitare_BG_02_v2 |
| `layer_7_copy` | 2_캐릭터 | image | (297,1434) 142×238 | 에셋 up_Solirare_Chr_02 |
| `layer_6_copy` | Glass 복사 | image | (195,1576) 690×111 | 에셋 up_Slitare_BG_Glass |
| `layer_8_copy` | 매입버튼 | image | (378,1547) 324×132 | 에셋 up_Solitare_UI_21-3 |
| `layer_8_copy4` | 코인아이콘 | image | (426,1612) 36×37 | 에셋 up_Solitare_UI_2-3_v3 |
| `layer_8_copy5` | 다이아아이콘 | image | (548,1615) 36×31 | 에셋 up_Solitare_UI_2-2_v4 |
| `layer_10` | 매입텍스트 | text | (464,1571) 152×46 | "점포매입" · 크기 근사 |
| `layer_10_copy3` | 매입골드가격 | text | (462,1612) 79×37 | "1.5K" |
| `layer_10_copy4` | 다이아가격 | text | (595,1612) 55×37 | "20" |
| `layer_2_copy2` | 3층 Bean&Bloom | image | (121,690) 832×517 | 에셋 up_Slitare_BG_03_v2 |
| `layer_6_copy2` | Glass 복사 | image | (195,1065) 690×111 | 에셋 up_Slitare_BG_Glass |
| `layer_7_copy2` | 2_캐릭터 복사 | image | (672,904) 119×261 | 에셋 up_Solirare_Chr_03 |
| `layer_3` | Roof | image | (116,411) 849×298 | 에셋 up_Slitare_BG_roof_v2 |
| `layer_8` | 플레이 버튼 | image | (399,2080) 295×104 | 에셋 up_Solitare_UI_21_v2 |
| `layer_9` | 게 | text | (479,2093) 160×48 | "계속하기" · 크기 근사 |
| `layer_5_copy` | 125,250 복사 | text | (176,70) 36×43 | "50" · 크기 근사 |
| `layer_5_copy2` | 125,250 복사 | text | (765,70) 54×43 | "400" · 크기 근사 |
| `layer_11` | 상점 | image | (27,186) 139×164 | 에셋 up_Solitare_UI_15 |
| `layer_13` | t | text | (63,293) 68×41 | "Shop" · 크기 근사 |
| `layer_11_copy` | 패키지 | image | (27,376) 139×166 | 에셋 up_Solitare_UI_16_v2 |
| `layer_13_copy` | t 복사 | text | (63,484) 68×41 | "Pack" · 크기 근사 |
| `layer_11_copy2` | 코인 상점 | image | (27,1045) 165×185 | 에셋 up_Solitare_UI_17_v2 |
| `layer_13_copy2` | t 복사 | text | (61,1165) 98×47 | "59:59" · 크기 근사 |
| `layer_13_copy7` | t 복사 | text | (57,1082) 100×60 | "1200" · 크기 근사 |
| `layer_11_copy3` | 리그 | image | (915,186) 139×164 | 에셋 up_Solitare_UI_18_v2 |
| `layer_13_copy3` | t 복사 | text | (965,215) 34×41 | "15" · 크기 근사 |
| `layer_13_copy6` | t 복사 | text | (926,298) 112×34 | "12:00:00" · 크기 근사 |
| `layer_11_copy4` | 랭킹 | image | (915,376) 139×166 | 에셋 up_Solitare_UI_19_v2 |
| `layer_13_copy4` | t 복사 | text | (948,484) 68×41 | "Rank" · 크기 근사 |
| `layer_11_copy5` | 시즌패스 | image | (915,567) 139×167 | 에셋 up_Solitare_UI_20_v2 |
| `layer_13_copy5` | t 복사 | text | (948,675) 68×41 | "Pass" · 크기 근사 |
| `layer_12` | Lv 4 | text | (531,2143) 54×32 | "Lv 4" · 크기 근사 |
| `layer_15` | 자동차2 | image | (655,2183) 419×184 | 에셋 up_Car_01 |
| `layer_15_copy` | 자동차1 | image | (41,2165) 455×208 | 에셋 up_Car_02 |
| `layer_16` | 부지구입 | image | (-1033,1018) 819×1210 | 에셋 up_Slitare_BG_Ruin_01 |
| `layer_16_copy` | 부지구입1 | image | (1333,1055) 819×1137 | 에셋 up_Slitare_BG_Ruin_05 |
| `layer_17` | 스와이프 좌 | image | (12,1682) 120×145 | 에셋 up_Solitare_UI_21-1 |
| `layer_17_copy` | 스와이프 우 | image | (944,1683) 120×143 | 에셋 up_Solitare_UI_21-2 |
| `layer_18` | 새 레이어 | image | (21,570) 153×152 | 에셋 up_Homerun_UI_13 |

## 구현 시 주의

- 텍스트 14개는 **rect 가 근사값**이다. 배치의 진실은 `at` + `anchorX/anchorY` 이므로 그쪽을 기준으로 구현할 것

