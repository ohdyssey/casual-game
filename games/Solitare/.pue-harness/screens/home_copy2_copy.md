# home_copy2_copy — 판매건물

1080×2400 · 노드 40개 · rev `8cdb04a1`

## 구조

- **상단** (9개) — 코인 패널, 125,250, 125,250 복사, 125,250 복사, 상점, t, 리그, t 복사 …
- **상중단** (9개) — 하늘, 패키지, t 복사, 코인 상점, t 복사, 랭킹, t 복사, 시즌패스 …
- **중앙** (6개) — 원경, 중경, 중경 복사, 간판, 고수익 경쟁부지, 고수익 경쟁부지 복사
- **중하단** (9개) — 자동차3, 가로등, 가로등 복사, 소화전, 소화전 복사, 부지구입1, 부지구입, 스와이프 좌 …
- **하단** (7개) — 도로, 도로 복사, 도로 복사, 화분, 화분 복사, 자동차2, 자동차1

## 배치도

화면을 10×16 격자로 본 모습(왼쪽 위가 원점). `.` = 빈 곳.

```
44fff44444
hh......gg
66......88
77......55
jj......55
..333333..
1.dddddd..
12dddddd2.
122222222.
122222222.
122222222.
bb222222cc
bb222222cc
122222222.
122222222.
..........
```

| 기호 | id | 라벨 | 종류 |
|---|---|---|---|
| `1` | `layer_16` | 부지구입 | button? |
| `2` | `layer_16_copy` | 부지구입1 | button? |
| `3` | `layer_16_copy2` | 간판 | button? |
| `4` | `layer_4` | 코인 패널 | button? |
| `5` | `layer_11_copy5` | 시즌패스 | button? |
| `6` | `layer_11_copy` | 패키지 | button? |
| `7` | `layer_11_copy2` | 코인 상점 | button? |
| `8` | `layer_11_copy4` | 랭킹 | button? |
| `9` | `layer_11` | 상점 | button? |
| `a` | `layer_11_copy3` | 리그 | button? |
| `b` | `layer_17` | 스와이프 좌 | button? |
| `c` | `layer_17_copy` | 스와이프 우 | button? |
| `d` | `layer_2_copy` | 고수익 경쟁부지 복사 | text |
| `e` | `layer_2` | 고수익 경쟁부지 | text |
| `f` | `layer_5` | 125,250 | text |
| `g` | `layer_13_copy6` | t 복사 | text |
| `h` | `layer_13` | t | text |
| `i` | `layer_13_copy` | t 복사 | text |
| `j` | `layer_13_copy2` | t 복사 | text |
| `k` | `layer_13_copy4` | t 복사 | text |

## ⚠ 추정된 상호작용 — 확정이 아닙니다

저작자가 역할을 지정하지 않아 하네스가 **유추한 후보**입니다.
구현에 참고하되 **코드에 `TODO` 로 남겨** 사람이 확인할 수 있게 하세요.
저작된 역할(`action:`)이 있으면 언제나 그쪽이 우선합니다.

| id | 라벨 | 확신 | 추정 동작 | 근거 |
|---|---|---|---|---|
| `layer_11_copy` | 패키지 | 90% | `package` | 에셋 키가 UI 계열 (up_Solitare_UI_16_v2) · 인접 캡션 텍스트 "Pack" (layer_13_copy) · 같은 크기 아이콘 4개 묶음 = 메뉴/내비 패턴 · 이름에서 동작 추정 → "package" |
| `layer_11_copy2` | 코인 상점 | 90% | `shop` | 에셋 키가 UI 계열 (up_Solitare_UI_17_v2) · 인접 캡션 텍스트 "Gold" (layer_13_copy2) · 같은 크기 아이콘 4개 묶음 = 메뉴/내비 패턴 · 이름에서 동작 추정 → "shop" |
| `layer_11_copy4` | 랭킹 | 90% | `rank` | 에셋 키가 UI 계열 (up_Solitare_UI_19_v2) · 인접 캡션 텍스트 "Rank" (layer_13_copy4) · 같은 크기 아이콘 4개 묶음 = 메뉴/내비 패턴 · 이름에서 동작 추정 → "rank" |
| `layer_11_copy5` | 시즌패스 | 90% | `pass` | 에셋 키가 UI 계열 (up_Solitare_UI_20_v2) · 인접 캡션 텍스트 "Pass" (layer_13_copy5) · 같은 크기 아이콘 4개 묶음 = 메뉴/내비 패턴 · 이름에서 동작 추정 → "pass" |
| `layer_11` | 상점 | 70% | `shop` | 에셋 키가 UI 계열 (up_Solitare_UI_15) · 인접 캡션 텍스트 "Shop" (layer_13) · 이름에서 동작 추정 → "shop" |
| `layer_11_copy3` | 리그 | 70% | `league` | 에셋 키가 UI 계열 (up_Solitare_UI_18_v2) · 인접 캡션 텍스트 "15" (layer_13_copy3) · 이름에서 동작 추정 → "league" |
| `layer_4` | 코인 패널 | 70% | `gold` | 에셋 키가 UI 계열 (up_Solitare_UI_14_v2) · 인접 캡션 텍스트 "125,250" (layer_5) · 이름에서 동작 추정 → "gold" |
| `layer_16_copy2` | 간판 | 55% | — | 에셋 키가 UI 계열 (up_Solitare_UI_25-1) · 인접 캡션 텍스트 "고수익 경쟁부지" (layer_2) |
| `layer_17` | 스와이프 좌 | 50% | `swipe` | 에셋 키가 UI 계열 (up_Solitare_UI_21-1) · 이름에서 동작 추정 → "swipe" |
| `layer_17_copy` | 스와이프 우 | 50% | `swipe` | 에셋 키가 UI 계열 (up_Solitare_UI_21-2) · 이름에서 동작 추정 → "swipe" |
| `layer_16_copy` | 부지구입1 | 45% ⚠ | `buy` | 에셋 키가 배경·캐릭터 계열 (up_Slitare_BG_Ruin_05) · 이름에 버튼/구매 표현 ("부지구입1") · ⚠ 신호 충돌 — 이름은 버튼인데 에셋은 배경 계열. 사람 확인 필요 · 인접 캡션 텍스트 "수익은 높지만 공격시 강제 경매됩니다." (layer_2_copy) · 이름에서 동작 추정 → "buy" |
| `layer_16` | 부지구입 | 25% ⚠ | `buy` | 에셋 키가 배경·캐릭터 계열 (up_Slitare_BG_Ruin_01) · 이름에 버튼/구매 표현 ("부지구입") · ⚠ 신호 충돌 — 이름은 버튼인데 에셋은 배경 계열. 사람 확인 필요 · 이름에서 동작 추정 → "buy" |

## 전체 노드 (z 오름차순 — 뒤에서 앞으로)

| id | 라벨 | 타입 | rect (l,t,w,h) | 비고 |
|---|---|---|---|---|
| `layer_14` | 하늘 | image | (-263,-937) 1586×2993 | 에셋 up_Slitare_BG_Back01-1 |
| `layer_1_copy` | 원경 | image | (-188,-503) 1420×2933 | 에셋 up_Slitare_BG_Back01-12_v7 |
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
| `layer_4` | 코인 패널 | image | (31,41) 1018×98 | 에셋 up_Solitare_UI_14_v2 |
| `layer_5` | 125,250 | text | (322,69) 126×43 | "125,250" · 크기 근사 |
| `layer_5_copy` | 125,250 복사 | text | (594,69) 36×43 | "50" · 크기 근사 |
| `layer_5_copy2` | 125,250 복사 | text | (771,70) 54×43 | "400" · 크기 근사 |
| `layer_16_copy2` | 간판 | image | (255,825) 597×414 | 에셋 up_Solitare_UI_25-1 |
| `layer_16_copy` | 부지구입1 | image | (144,1055) 819×1137 | 에셋 up_Slitare_BG_Ruin_05 |
| `layer_11` | 상점 | image | (27,186) 139×164 | 에셋 up_Solitare_UI_15 |
| `layer_13` | t | text | (63,293) 68×41 | "Shop" · 크기 근사 |
| `layer_11_copy` | 패키지 | image | (27,376) 139×166 | 에셋 up_Solitare_UI_16_v2 |
| `layer_13_copy` | t 복사 | text | (63,484) 68×41 | "Pack" · 크기 근사 |
| `layer_11_copy2` | 코인 상점 | image | (27,567) 139×166 | 에셋 up_Solitare_UI_17_v2 |
| `layer_13_copy2` | t 복사 | text | (63,675) 68×41 | "Gold" · 크기 근사 |
| `layer_11_copy3` | 리그 | image | (915,186) 139×164 | 에셋 up_Solitare_UI_18_v2 |
| `layer_13_copy3` | t 복사 | text | (965,215) 34×41 | "15" · 크기 근사 |
| `layer_13_copy6` | t 복사 | text | (926,298) 112×34 | "12:00:00" · 크기 근사 |
| `layer_11_copy4` | 랭킹 | image | (915,376) 139×166 | 에셋 up_Solitare_UI_19_v2 |
| `layer_13_copy4` | t 복사 | text | (948,484) 68×41 | "Rank" · 크기 근사 |
| `layer_11_copy5` | 시즌패스 | image | (915,567) 139×167 | 에셋 up_Solitare_UI_20_v2 |
| `layer_13_copy5` | t 복사 | text | (948,675) 68×41 | "Pass" · 크기 근사 |
| `layer_15` | 자동차2 | image | (655,2183) 419×184 | 에셋 up_Car_01 |
| `layer_15_copy` | 자동차1 | image | (41,2165) 455×208 | 에셋 up_Car_02 |
| `layer_16` | 부지��입 | image | (-1033,1018) 819×1210 | 에셋 up_Slitare_BG_Ruin_01 |
| `layer_17` | 스와이프 좌 | image | (12,1682) 120×145 | 에셋 up_Solitare_UI_21-1 |
| `layer_17_copy` | 스와이프 우 | image | (944,1683) 120×143 | 에셋 up_Solitare_UI_21-2 |
| `layer_2` | 고수익 경쟁부지 | text | (420,996) 240×38 | "고수익 경쟁부지" · 크기 근사 |
| `layer_2_copy` | 고수익 경쟁부지 복사 | text | (281,1033) 518×34 | "수익은 높지만 공격시 강제 경매됩니다." · 크기 근사 |

## 구현 시 주의

- 텍스트 12개는 **rect 가 근사값**이다. 배치의 진실은 `at` + `anchorX/anchorY` 이므로 그쪽을 기준으로 구현할 것

