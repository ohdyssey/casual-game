# main

1080×2400 · 노드 67개 · rev `0286a77f`

## 구조

- **상단** (7개) — 적군정보패널, 적군게이지패널, 95, 적군게이지패널 복사, 적군프로필, 프로필 복사, 프로필 복사
- **상중단** (11개) — 캐릭터, 캐릭터, 캐릭터, 캐릭터, 캐릭터, 스킬정보패널, 스킬넘버, 스킬넘버 복사 …
- **중앙** (8개) — 배경, 캐릭터 복사, 패널, 캐릭터카드, 캐릭터카드, 스킬넘버 복사, 스킬넘버 복사, 스킬넘버 복사
- **중하단** (23개) — 캐릭터, 엠블럼1, 캐릭터, 엠블럼2, 캐릭터, 엠블럼3, 캐릭터, 엠블럼4 …
- **하단** (18개) — 스킬넘버 복사, 스킬1, 스킬2, 스킬3, 스킬4, 스킬4 복사, 스킬4 복사, 스킬4 복사 …

## 배치도

화면을 10×16 격자로 본 모습(왼쪽 위가 원점). `.` = 빈 곳.

```
..........
...77777..
..........
666.......
cc6.......
aa........
aa........
88........
99........
99........
11........
bbdeeffghh
bbdeeffghh
..22344555
..22344555
..iij4k555
```

| 기호 | id | 라벨 | 종류 |
|---|---|---|---|
| `1` | `layer_3_copy10` | 패널 | button? |
| `2` | `layer_3_copy20` | 스킬1 | button? |
| `3` | `layer_3_copy21` | 스킬2 | button? |
| `4` | `layer_3_copy22` | 스킬3 | button? |
| `5` | `layer_3_copy23` | 스킬4 | button? |
| `6` | `layer_3_copy26` | 스킬정보패널 | button? |
| `7` | `layer_3_copy29` | 적군게이지패널 | button? |
| `8` | `layer_3_copy13` | 캐릭터카드 | button? |
| `9` | `layer_3_copy14` | 캐릭터카드 | button? |
| `a` | `layer_3_copy12` | 캐릭터카드 | button? |
| `b` | `layer_3_copy39` | 넥스트 | button? |
| `c` | `layer_3_copy11` | 캐릭터카드 | button? |
| `d` | `layer_3_copy15` | 출발점 | button? |
| `e` | `layer_3_copy16` | 출발점 | button? |
| `f` | `layer_3_copy17` | 출발점 | button? |
| `g` | `layer_3_copy18` | 출발점 | button? |
| `h` | `layer_3_copy19` | 출발점 | button? |
| `i` | `layer_3_copy32` | 스킬4 복사 | button? |
| `j` | `layer_3_copy33` | 스킬4 복사 | button? |
| `k` | `layer_3_copy34` | 스킬4 복사 | button? |

## ⚠ 추정된 상호작용 — 확정이 아닙니다

저작자가 역할을 지정하지 않아 하네스가 **유추한 후보**입니다.
구현에 참고하되 **코드에 `TODO` 로 남겨** 사람이 확인할 수 있게 하세요.
저작된 역할(`action:`)이 있으면 언제나 그쪽이 우선합니다.

| id | 라벨 | 확신 | 추정 동작 | 근거 |
|---|---|---|---|---|
| `layer_3_copy12` | 캐릭터카드 | 75% | — | 에셋 키가 UI 계열 (up_SC_UI_015-02) · 인접 캡션 텍스트 "Tank" (layer_2_copy11) · 같은 크기 아이콘 3개 묶음 = 메뉴/내비 패턴 |
| `layer_3_copy14` | 캐릭터카드 | 75% | — | 에셋 키가 UI 계열 (up_SC_UI_015-05) · 인접 캡션 텍스트 "Healer" (layer_2_copy13) · 같은 크기 아이콘 3개 묶음 = 메뉴/내비 패턴 |
| `layer_3_copy39` | 넥스트 | 75% | — | 에셋 키가 UI 계열 (up_SC_UI_015-02) · 인접 캡션 텍스트 "Tank" (layer_2_copy15) · 같은 크기 아이콘 3개 묶음 = 메뉴/내비 패턴 |
| `layer_3_copy10` | 패널 | 55% | — | 에셋 키가 UI 계열 (up_SC_UI_06) · 인접 캡션 텍스트 "Tank" (layer_2_copy11) |
| `layer_3_copy11` | 캐릭터카드 | 55% | — | 에셋 키가 UI 계열 (up_SC_UI_015-01) · 인접 캡션 텍스트 "Pusher" (layer_2_copy6) |
| `layer_3_copy13` | 캐릭터카드 | 55% | — | 에셋 키가 UI 계열 (up_SC_UI_015-03) · 인접 캡션 텍스트 "Brawler" (layer_2_copy12) |
| `layer_3_copy15` | 출발점 | 55% | — | 에셋 키가 UI 계열 (up_SC_UI_016) · 같은 크기 아이콘 5개 묶음 = 메뉴/내비 패턴 |
| `layer_3_copy16` | 출발점 | 55% | — | 에셋 키가 UI 계열 (up_SC_UI_016) · 같은 크기 아이콘 5개 묶음 = 메뉴/내비 패턴 |
| `layer_3_copy17` | 출발점 | 55% | — | 에셋 키가 UI 계열 (up_SC_UI_016) · 같은 크기 아이콘 5개 묶음 = 메뉴/내비 패턴 |
| `layer_3_copy18` | 출발점 | 55% | — | 에셋 키가 UI 계열 (up_SC_UI_016) · 같은 크기 아이콘 5개 묶음 = 메뉴/내비 패턴 |
| `layer_3_copy19` | 출발점 | 55% | — | 에셋 키가 UI 계열 (up_SC_UI_016) · 같은 크기 아이콘 5개 묶음 = 메뉴/내비 패턴 |
| `layer_3_copy20` | 스킬1 | 55% | — | 에셋 키가 UI 계열 (up_SC_UI_01) · 인접 캡션 텍스트 "Rally" (layer_2_copy14) |
| `layer_3_copy21` | 스킬2 | 55% | — | 에셋 키가 UI 계열 (up_SC_UI_02) · 인접 캡션 텍스트 "Heal Wave" (layer_2_copy7) |
| `layer_3_copy22` | 스킬3 | 55% | — | 에셋 키가 UI 계열 (up_SC_UI_03) · 인접 캡션 텍스트 "Attack Boost" (layer_2_copy8) |
| `layer_3_copy23` | 스킬4 | 55% | — | 에셋 키가 UI 계열 (up_SC_UI_04) · 인접 캡션 텍스트 "Sumo Spirit " (layer_2_copy9) |
| `layer_3_copy26` | 스킬정보패널 | 55% | — | 에셋 키가 UI 계열 (up_SC_UI_05) · 인접 캡션 텍스트 "/10" (layer_2_copy) |
| `layer_3_copy29` | 적군게이지패널 | 55% | — | 에셋 키가 UI 계열 (up_SC_UI_017-1) · 인접 캡션 텍스트 "95" (layer_6) |
| `layer_3_copy32` | 스킬4 복사 | 55% | — | 에셋 키가 UI 계열 (up_SC_UI_018) · 같은 크기 아이콘 4개 묶음 = 메뉴/내비 패턴 |
| `layer_3_copy33` | 스킬4 복사 | 55% | — | 에셋 키가 UI 계열 (up_SC_UI_018) · 같은 크기 아이콘 4개 묶음 = 메뉴/내비 패턴 |
| `layer_3_copy34` | 스킬4 복사 | 55% | — | 에셋 키가 UI 계열 (up_SC_UI_018) · 같은 크기 아이콘 4개 묶음 = 메뉴/내비 패턴 |
| `layer_3_copy35` | 스킬4 복사 | 55% | — | 에셋 키가 UI 계열 (up_SC_UI_018) · 같은 크기 아이콘 4개 묶음 = 메뉴/내비 패턴 |

## 전체 노드 (z 오름차순 — 뒤에서 앞으로)

| id | 라벨 | 타입 | rect (l,t,w,h) | 비고 |
|---|---|---|---|---|
| `layer_1` | 배경 | image | (-132,1) 1213×2401 | 에셋 up_SUMO_BG_01-1 |
| `layer_3` | 캐릭터 | image | (158,1517) 146×214 | 에셋 up_SC_Chr_me_01 |
| `layer_7` | 엠블럼1 | image | (246,1595) 56×60 | 에셋 up_SC_Chr_Stl_01 |
| `layer_3_copy` | 캐릭터 | image | (414,486) 120×153 | 에셋 up_SC_Chr_em_02 |
| `layer_3_copy2` | 캐릭터 | image | (542,478) 120×169 | 에셋 up_SC_Chr_em_03 |
| `layer_3_copy3` | 캐릭터 | image | (667,475) 120×175 | 에셋 up_SC_Chr_em_04 |
| `layer_3_copy4` | 캐릭터 | image | (792,481) 120×162 | 에셋 up_SC_Chr_em_06 |
| `layer_3_copy5` | 캐릭터 | image | (347,1535) 146×196 | 에셋 up_SC_Chr_me_02 |
| `layer_7_copy` | 엠블럼2 | image | (442,1593) 56×62 | 에셋 up_SC_Chr_Stl_02 |
| `layer_3_copy6` | 캐릭터 | image | (543,1527) 146×204 | 에셋 up_SC_Chr_me_03 |
| `layer_7_copy2` | 엠블럼3 | image | (635,1594) 56×61 | 에셋 up_SC_Chr_Stl_05 |
| `layer_3_copy7` | 캐릭터 | image | (730,1497) 146×234 | 에셋 up_SC_Chr_me_04 |
| `layer_7_copy3` | 엠블럼4 | image | (829,1580) 56×60 | 에셋 up_SC_Chr_Stl_03_v2 |
| `layer_3_copy8` | 캐릭터 | image | (913,1511) 146×220 | 에셋 up_SC_Chr_me_05 |
| `layer_7_copy4` | 엠블럼5 | image | (1009,1579) 56×62 | 에셋 up_SC_Chr_Stl_04 |
| `layer_3_copy9` | 캐릭터 | image | (282,475) 120×174 | 에셋 up_SC_Chr_em_01_v3 |
| `layer_3_copy36` | 캐릭터 복사 | image | (547,930) 120×147 | 에셋 up_SC_UI_020 |
| `layer_3_copy10` | 패널 | image | (20,613) 173×892 | 에셋 up_SC_UI_06 |
| `layer_3_copy26` | 스킬정보패널 | image | (17,466) 217×145 | 에셋 up_SC_UI_05 |
| `layer_2` | 스킬넘버 | text | (100,485) 25×60 | "6" · 크기 근사 |
| `layer_2_copy` | 스킬넘버 복사 | text | (133,498) 54×43 | "/10" · 크기 근사 |
| `layer_3_copy11` | 캐릭터카드 | image | (41,642) 129×195 | 에셋 up_SC_UI_015-01 |
| `layer_2_copy10` | 스킬넘버 복사 | text | (307,2226) 75×36 | "Rally" · 크기 근사 |
| `layer_3_copy12` | 캐릭터카드 | image | (41,849) 129×204 | 에셋 up_SC_UI_015-02 |
| `layer_3_copy13` | 캐릭터카드 | image | (41,1061) 129×206 | 에셋 up_SC_UI_015-03 |
| `layer_3_copy14` | 캐릭터카드 | image | (41,1274) 129×205 | 에셋 up_SC_UI_015-05 |
| `layer_3_copy15` | 출발점 | image | (144,1735) 129×106 | 에셋 up_SC_UI_016 |
| `layer_3_copy16` | 출발점 | image | (354,1744) 129×106 | 에셋 up_SC_UI_016 |
| `layer_3_copy17` | 출발점 | image | (553,1749) 129×106 | 에셋 up_SC_UI_016 |
| `layer_3_copy18` | 출발점 | image | (759,1738) 129×106 | 에셋 up_SC_UI_016 |
| `layer_3_copy19` | 출발점 | image | (959,1718) 129×106 | 에셋 up_SC_UI_016 |
| `layer_3_copy20` | 스킬1 | image | (243,2051) 181×293 | 에셋 up_SC_UI_01 |
| `layer_3_copy21` | 스킬2 | image | (443,2051) 181×292 | 에셋 up_SC_UI_02 |
| `layer_3_copy22` | 스킬3 | image | (643,2053) 181×289 | 에셋 up_SC_UI_03 |
| `layer_3_copy23` | 스킬4 | image | (843,2054) 181×286 | 에셋 up_SC_UI_04 |
| `layer_5` | 사각형 | rect | (36,1693) 138×212 | — |
| `layer_3_copy39` | 넥스트 | image | (41,1697) 129×204 | 에셋 up_SC_UI_015-02 |
| `layer_2_copy11` | 스킬넘버 복사 | text | (75,1011) 60×36 | "Tank" · 크기 근사 |
| `layer_2_copy12` | 스킬넘버 복사 | text | (53,1225) 105×36 | "Brawler" · 크기 근사 |
| `layer_2_copy13` | 스킬넘버 복사 | text | (60,1434) 90×36 | "Healer" · 크기 근사 |
| `layer_2_copy6` | 스킬넘버 복사 | text | (60,796) 90×36 | "Pusher" · 크기 근사 |
| `layer_3_copy32` | 스킬4 복사 | image | (301,2253) 31×46 | 에셋 up_SC_UI_018 |
| `layer_3_copy33` | 스킬4 복사 | image | (492,2253) 31×46 | 에셋 up_SC_UI_018 |
| `layer_3_copy34` | 스킬4 복사 | image | (693,2253) 31×46 | 에셋 up_SC_UI_018 |
| `layer_3_copy35` | 스킬4 복사 | image | (897,2253) 31×46 | 에셋 up_SC_UI_018 |
| `layer_2_copy2` | 스킬넘버 복사 | text | (342,2252) 20×48 | "3" · 크기 근사 |
| `layer_2_copy3` | 스킬넘버 복사 | text | (530,2252) 20×48 | "4" · 크기 근사 |
| `layer_2_copy4` | 스킬넘버 복사 | text | (739,2252) 20×48 | "3" · 크기 근사 |
| `layer_2_copy5` | 스킬넘버 복사 | text | (941,2252) 20×48 | "5" · 크기 근사 |
| `layer_4` | 적군정보패널 | rect | (376,136) 182×79 | — |
| `layer_3_copy29` | 적군게이지패널 | image | (372,189) 475×63 | 에셋 up_SC_UI_017-1 |
| `layer_6` | 95 | text | (787,203) 36×43 | "95" · 크기 근사 |
| `layer_3_copy38` | 적군게이지패널 복사 | image | (376,208) 380×31 | 에셋 up_SC_UI_017-3 |
| `layer_3_copy24` | 적군프로필 | image | (246,113) 149×139 | 에셋 up_SC_UI_07 |
| `layer_4_copy` | 아군정보패널 | rect | (363,1925) 182×79 | — |
| `layer_3_copy30` | 아군게이지 패널 | image | (373,1879) 475×57 | 에셋 up_SC_UI_017-2_v2 |
| `layer_3_copy37` | 아군게이지 패널 복사 | image | (385,1894) 385×31 | 에셋 up_SC_UI_017-4 |
| `layer_3_copy25` | 아군프로필 | image | (246,1884) 149×139 | 에셋 up_SC_UI_07 |
| `layer_3_copy28` | 프로필 복사 | image | (949,229) 100×237 | 에셋 up_SC_UI_09 |
| `layer_3_copy27` | 프로필 복사 | image | (137,226) 90×241 | 에셋 up_SC_UI_08_v2 |
| `layer_3_copy31` | 스킬1 복사 | image | (64,2069) 150×155 | 에셋 up_SC_UI_014 |
| `layer_2_copy14` | 스킬넘버 복사 | text | (299,2217) 75×36 | "Rally" · 크기 근사 |
| `layer_2_copy7` | 스킬넘버 복사 | text | (467,2214) 135×36 | "Heal Wave" · 크기 근사 |
| `layer_2_copy9` | 스킬넘버 복사 | text | (848,2214) 180×36 | "Sumo Spirit " · 크기 근사 |
| `layer_2_copy8` | 스킬넘버 복사 | text | (645,2214) 180×36 | "Attack Boost" · 크기 근사 |
| `layer_2_copy15` | 스킬넘버 복사 | text | (75,1857) 60×36 | "Tank" · 크기 근사 |
| `layer_2_copy16` | 스킬넘버 복사 | text | (40,1661) 105×36 | "NEXT >>" · 크기 근사 |

## 구현 시 주의

- 텍스트 18개는 **rect 가 근사값**이다. 배치의 진실은 `at` + `anchorX/anchorY` 이므로 그쪽을 기준으로 구현할 것

