# home_copy — 타워 건설 템플릿

1080×2400 · 노드 34개 · rev `f2869daa`

## 구조

- **상단** (9개) — 하늘, 코인 패널, 125,250, 125,250 복사, 125,250 복사, 상점, t, 리그 …
- **상중단** (9개) — 타워, 패키지, t 복사, 코인 상점, t 복사, 랭킹, t 복사, 시즌패스 …
- **중앙** (2개) — 4층, Glass 복사
- **중하단** (4개) — 배경, 3층 Bean&Bloom, 2_캐릭터 복사, Glass 복사
- **하단** (10개) — 1층 로비, 1_캐릭터, Glass, 2층 GoldenCrust, 2_캐릭터, Glass 복사, 플레이 버튼, 게 …

## 배치도

화면을 10×16 격자로 본 모습(왼쪽 위가 원점). `.` = 빈 곳.

```
11aaah1g11
bbkkkkkk88
44kkkkkk66
55kkkkkk33
ddkkkkkkff
..kkkkkkkk
..kkkkkkkk
..kkkkkkkk
..kkkkkkkk
..kkkkkkkk
..........
..........
..........
..........
..........
...29j2...
```

| 기호 | id | 라벨 | 종류 |
|---|---|---|---|
| `1` | `layer_4` | 코인 패널 | button? |
| `2` | `layer_8` | 플레이 버튼 | button? |
| `3` | `layer_11_copy5` | 시즌패스 | button? |
| `4` | `layer_11_copy` | 패키지 | button? |
| `5` | `layer_11_copy2` | 코인 상점 | button? |
| `6` | `layer_11_copy4` | 랭킹 | button? |
| `7` | `layer_11` | 상점 | button? |
| `8` | `layer_11_copy3` | 리그 | button? |
| `9` | `layer_9` | 게 | text |
| `a` | `layer_5` | 125,250 | text |
| `b` | `layer_13` | t | text |
| `c` | `layer_13_copy` | t 복사 | text |
| `d` | `layer_13_copy2` | t 복사 | text |
| `e` | `layer_13_copy4` | t 복사 | text |
| `f` | `layer_13_copy5` | t 복사 | text |
| `g` | `layer_5_copy2` | 125,250 복사 | text |
| `h` | `layer_5_copy` | 125,250 복사 | text |
| `i` | `layer_13_copy3` | t 복사 | text |
| `j` | `layer_12` | Lv 4 | text |
| `k` | `layer_15` | 타워 | image |

## ⚠ 추정된 상호작용 — 확정이 아닙니다

저작자가 역할을 지정하지 않아 하네스가 **유추한 후보**입니다.
구현에 참고하되 **코드에 `TODO` 로 남겨** 사람이 확인할 수 있게 하세요.
저작된 역할(`action:`)이 있으면 언제나 그쪽이 우선합니다.

| id | 라벨 | 확신 | 추정 동작 | 근거 |
|---|---|---|---|---|
| `layer_8` | 플레이 버튼 | 95% | `play` | 에셋 키가 UI 계열 (up_Solitare_UI_21) · 이름에 버튼/구매 표현 ("플레이 버튼") · 인접 캡션 텍스트 "계속하기" (layer_9) · 이름에서 동작 추정 → "play" |
| `layer_11_copy` | 패키지 | 90% | `package` | 에셋 키가 UI 계열 (up_Solitare_UI_16_v2) · 인접 캡션 텍스트 "Pack" (layer_13_copy) · 같은 크기 아이콘 4개 묶음 = 메뉴/내비 패턴 · 이름에서 동작 추정 → "package" |
| `layer_11_copy2` | 코인 상점 | 90% | `shop` | 에셋 키가 UI 계열 (up_Solitare_UI_17_v2) · 인접 캡션 텍스트 "Gold" (layer_13_copy2) · 같은 크기 아이콘 4개 묶음 = 메뉴/내비 패턴 · 이름에서 동작 추정 → "shop" |
| `layer_11_copy4` | 랭킹 | 90% | `rank` | 에셋 키가 UI 계열 (up_Solitare_UI_19_v2) · 인접 캡션 텍스트 "Rank" (layer_13_copy4) · 같은 크기 아이콘 4개 묶음 = 메뉴/내비 패턴 · 이름에서 동작 추정 → "rank" |
| `layer_11_copy5` | 시즌패스 | 90% | `pass` | 에셋 키가 UI 계열 (up_Solitare_UI_20_v2) · 인접 캡션 텍스트 "Pass" (layer_13_copy5) · 같은 크기 아이콘 4개 묶음 = 메뉴/내비 패턴 · 이름에서 동작 추정 → "pass" |
| `layer_11` | 상점 | 70% | `shop` | 에셋 키가 UI 계열 (up_Solitare_UI_15) · 인접 캡션 텍스트 "Shop" (layer_13) · 이름에서 동작 추정 → "shop" |
| `layer_11_copy3` | 리그 | 70% | `league` | 에셋 키가 UI 계열 (up_Solitare_UI_18_v2) · 인접 캡션 텍스트 "15" (layer_13_copy3) · 이름에서 동작 추정 → "league" |
| `layer_4` | 코인 패널 | 70% | `gold` | 에셋 키가 UI 계열 (up_Solitare_UI_14_v2) · 인접 캡션 텍스트 "125,250" (layer_5) · 이름에서 동작 추정 → "gold" |

## 전체 노드 (z 오름차순 — 뒤에서 앞으로)

| id | 라벨 | 타입 | rect (l,t,w,h) | 비고 |
|---|---|---|---|---|
| `layer_14` | 하늘 | image | (-176,-4272) 1438×7012 | 에셋 up_Slitare_BG_Back01-1 |
| `layer_1` | 배경 | image | (-176,58) 1438×3197 | 에셋 up_Slitare_BG_Back01_v2 |
| `layer_15` | 타워 | image | (305,176) 843×1200 | 에셋 up_Slitare_BG_Crane_v8 |
| `layer_4` | 코인 패널 | image | (31,41) 1018×98 | 에셋 up_Solitare_UI_14_v2 |
| `layer_5` | 125,250 | text | (322,69) 126×43 | "125,250" · 크기 근사 |
| `layer_2` | 1층 로비 | image | (124,2394) 858×513 | 에셋 up_Slitare_BG_01_v3 |
| `layer_7` | 1_캐릭터 | image | (643,2629) 150×233 | 에셋 up_Solirare_Chr_01 |
| `layer_6` | Glass | image | (198,2766) 690×111 | 에셋 up_Slitare_BG_Glass |
| `layer_2_copy` | 2층 GoldenCrust | image | (124,1882) 859×518 | 에셋 up_Slitare_BG_02_v2 |
| `layer_7_copy` | 2_캐릭터 | image | (300,2119) 142×238 | 에셋 up_Solirare_Chr_02 |
| `layer_6_copy` | Glass 복사 | image | (198,2261) 690×111 | 에셋 up_Slitare_BG_Glass |
| `layer_2_copy2` | 3층 Bean&Bloom | image | (112,1377) 832×517 | 에셋 up_Slitare_BG_03_v2 |
| `layer_7_copy2` | 2_캐릭터 복사 | image | (663,1591) 119×261 | 에셋 up_Solirare_Chr_03 |
| `layer_6_copy2` | Glass 복사 | image | (186,1752) 690×111 | 에셋 up_Slitare_BG_Glass |
| `layer_8` | 플레이 버튼 | image | (410,2758) 266×94 | 에셋 up_Solitare_UI_21 |
| `layer_9` | 게 | text | (482,2770) 156×47 | "계속하기" · 크기 근사 |
| `layer_10` | Level | rect | (491,2816) 144×25 | — |
| `layer_5_copy` | 125,250 복사 | text | (594,69) 36×43 | "50" · 크기 근사 |
| `layer_5_copy2` | 125,250 복사 | text | (771,70) 54×43 | "400" · 크기 근사 |
| `layer_11` | 상점 | image | (27,186) 139×164 | 에셋 up_Solitare_UI_15 |
| `layer_13` | t | text | (63,293) 68×41 | "Shop" · 크기 근사 |
| `layer_11_copy` | 패키지 | image | (27,376) 139×166 | 에셋 up_Solitare_UI_16_v2 |
| `layer_13_copy` | t 복사 | text | (63,484) 68×41 | "Pack" · 크기 근사 |
| `layer_11_copy2` | 코인 상점 | image | (27,567) 139×166 | 에셋 up_Solitare_UI_17_v2 |
| `layer_13_copy2` | t 복사 | text | (63,675) 68×41 | "Gold" · 크기 근사 |
| `layer_11_copy3` | 리그 | image | (915,186) 139×164 | 에셋 up_Solitare_UI_18_v2 |
| `layer_13_copy3` | t 복사 | text | (965,328) 34×41 | "15" · 크기 근사 |
| `layer_11_copy4` | 랭킹 | image | (915,376) 139×166 | 에셋 up_Solitare_UI_19_v2 |
| `layer_13_copy4` | t 복사 | text | (948,484) 68×41 | "Rank" · 크기 근사 |
| `layer_11_copy5` | 시즌패스 | image | (915,567) 139×167 | 에셋 up_Solitare_UI_20_v2 |
| `layer_13_copy5` | t 복사 | text | (948,675) 68×41 | "Pass" · 크기 근사 |
| `layer_12` | Lv 4 | text | (540,2817) 44×26 | "Lv 4" · 크기 근사 |
| `layer_16` | 4층 | image | (112,871) 856×516 | 에셋 up_Slitare_BG_04_v3 |
| `layer_6_copy3` | Glass 복사 | image | (183,1243) 690×111 | 에셋 up_Slitare_BG_Glass |

## 구현 시 주의

- 텍스트 11개는 **rect 가 근사값**이다. 배치의 진실은 `at` + `anchorX/anchorY` 이므로 그쪽을 기준으로 구현할 것

