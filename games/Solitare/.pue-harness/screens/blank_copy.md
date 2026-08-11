# blank_copy — 데일리미션

720×1600 · 노드 37개 · rev `e35f36bb`

## 구조

- **상중단** (16개) — 새 레이어 복사, 새 레이어 복사, 새 레이어 복사, 새 레이어 복사, 새 레이어 복사, 새 레이어 복사, 새 레이어, 새 레이어 복사 …
- **중앙** (11개) — 새 레이어, 새 레이어, 텍스트 복사, 텍스트 복사, 텍스트 복사, 새 레이어 복사, 새 레이어 복사, 새 레이어 복사 …
- **중하단** (9개) — 새 레이어 복사, 새 레이어 복사, 새 레이어 복사, 새 레이어 복사, 새 레이어 복사, 새 레이어 복사, 새 레이어 복사, 5 …
- **하단** (1개) — 새 레이어 복사

## 배치도

화면을 10×16 격자로 본 모습(왼쪽 위가 원점). `.` = 빈 곳.

```
..........
dddddddddd
dddddddddd
deeeeeeeed
.f6655aaf.
.f66ffaaf.
.f88bbfcf.
.ffffffff.
..........
.iiiiiiii.
.kkkkkkkk.
.33gggggg.
.44hhhhhh.
.44hhhhhh.
..........
..........
```

| 기호 | id | 라벨 | 종류 |
|---|---|---|---|
| `1` | `layer_4` | 새 레이어 | button? |
| `2` | `layer_4_copy` | 새 레이어 복사 | button? |
| `3` | `layer_5` | 5 | text |
| `4` | `layer_5_copy` | 5 복사 | text |
| `5` | `layer_3_copy3` | 텍스트 복사 | text |
| `6` | `layer_3_copy12` | 텍스트 복사 | text |
| `7` | `layer_3_copy13` | 텍스트 복사 | text |
| `8` | `layer_3_copy16` | 텍스트 복사 | text |
| `9` | `layer_3_copy11` | 텍스트 복사 | text |
| `a` | `layer_3_copy14` | 텍스트 복사 | text |
| `b` | `layer_3_copy17` | 텍스트 복사 | text |
| `c` | `layer_3_copy18` | 텍스트 복사 | text |
| `d` | `layer_7_copy` | 새 레이어 복사 | image |
| `e` | `layer_3_copy4` | 새 레이어 복사 | image |
| `f` | `layer_3_copy20` | 새 레이어 복사 | image |
| `g` | `layer_3_copy22` | 새 레이어 복사 | image |
| `h` | `layer_3_copy23` | 새 레이어 복사 | image |
| `i` | `layer_3_copy6` | 새 레이어 복사 | image |
| `j` | `layer_3_copy7` | 새 레이어 복사 | image |
| `k` | `layer_3_copy8` | 새 레이어 복사 | image |

## ⚠ 추정된 상호작용 — 확정이 아닙니다

저작자가 역할을 지정하지 않아 하네스가 **유추한 후보**입니다.
구현에 참고하되 **코드에 `TODO` 로 남겨** 사람이 확인할 수 있게 하세요.
저작된 역할(`action:`)이 있으면 언제나 그쪽이 우선합니다.

| id | 라벨 | 확신 | 추정 동작 | 근거 |
|---|---|---|---|---|
| `layer_4` | 새 레이어 | 55% | — | 에셋 키가 UI 계열 (up_Solitare_UI_2-3) · 인접 캡션 텍스트 "5,000" (layer_3_copy16) |
| `layer_4_copy` | 새 레이어 복사 | 55% | — | 에셋 키가 UI 계열 (up_Solitare_UI_2-2) · 인접 캡션 텍스트 "20" (layer_3_copy17) |

## 전체 노드 (z 오름차순 — 뒤에서 앞으로)

| id | 라벨 | 타입 | rect (l,t,w,h) | 비고 |
|---|---|---|---|---|
| `layer_1` | 새 레이어 | image | (28,239) 666×1245 | 에셋 up_DailyMission_02-1 |
| `layer_7_copy` | 새 레이어 복사 | image | (39,109) 643×288 | 에셋 up_DailyMission_01-1 |
| `layer_3` | 새 레이어 | image | (204,693) 312×40 | 에셋 up_DailyMission_05 |
| `layer_3_copy4` | 새 레이어 복사 | image | (105,396) 511×349 | 에셋 up_DailyMission_02-2 |
| `layer_3_copy9` | 새 레이어 복사 | image | (241,523) 239×22 | 에셋 up_DailyMission_04_v2 |
| `layer_3_copy20` | 새 레이어 복사 | image | (127,456) 466×250 | 에셋 up_DailyMission_02-3 |
| `layer_3_copy10` | 새 레이어 복사 | image | (142,590) 437×94 | 에셋 up_DailyMission_17 |
| `layer_3_copy21` | 새 레이어 복사 | image | (185,548) 350×32 | 에셋 up_DailyMission_02-4 |
| `layer_4` | 새 레이어 | image | (183,605) 55×56 | 에셋 up_Solitare_UI_2-3 |
| `layer_4_copy` | 새 레이어 복사 | image | (333,609) 55×48 | 에셋 up_Solitare_UI_2-2 |
| `layer_4_copy2` | 새 레이어 복사 | image | (486,613) 55×53 | 에셋 up_DailyMission_16 |
| `layer_3_copy3` | 텍스트 복사 | text | (180,425) 360×24 | "Score higher to earn big" · 크기 근사 |
| `layer_3_copy11` | 텍스트 복사 | text | (178,484) 56×17 | "My SCORE" · 크기 근사 |
| `layer_3_copy12` | 텍스트 복사 | text | (178,495) 70×34 | "2,450" · 크기 근사 |
| `layer_3_copy13` | 텍스트 복사 | text | (482,495) 70×34 | "5,000" · 크기 근사 |
| `layer_3_copy14` | 텍스트 복사 | text | (483,484) 42×17 | "TARGET" · 크기 근사 |
| `layer_3_copy15` | 새 레이어 복사 | image | (426,517) 32×52 | 에셋 up_DailyMission_03-1 |
| `layer_3_copy16` | 텍스트 복사 | text | (187,649) 45×22 | "5,000" · 크기 근사 |
| `layer_3_copy17` | 텍스트 복사 | text | (351,650) 18×22 | "20" · 크기 근사 |
| `layer_3_copy18` | 텍스트 복사 | text | (511,649) 9×22 | "1" · 크기 근사 |
| `layer_6` | 새 레이어 | image | (195,380) 330×44 | 에셋 up_DailyMission_02-1-1 |
| `layer_3_copy2` | 새 레이어 복사 | image | (96,803) 529×47 | 에셋 up_DailyMission_05-1 |
| `layer_3_copy5` | 새 레이어 복사 | image | (134,758) 452×45 | 에셋 up_DailyMission_02-6 |
| `layer_3_copy` | 새 레이어 복사 | image | (96,852) 529×78 | 에셋 up_DailyMission_06-1 |
| `layer_3_copy6` | 새 레이어 복사 | image | (96,929) 529×86 | 에셋 up_DailyMission_07-1 |
| `layer_3_copy7` | 새 레이어 복사 | image | (96,1009) 529×86 | 에셋 up_DailyMission_07-1 |
| `layer_3_copy8` | 새 레이어 복사 | image | (96,1090) 529×86 | 에셋 up_DailyMission_07-1 |
| `layer_3_copy22` | 새 레이어 복사 | image | (96,1170) 529×86 | 에셋 up_DailyMission_07-1 |
| `layer_3_copy23` | 새 레이어 복사 | image | (96,1251) 529×86 | 에셋 up_DailyMission_07-1 |
| `layer_2` | 새 레이어 | image | (111,860) 55×62 | 에셋 up_DailyMission_09 |
| `layer_2_copy` | 새 레이어 복사 | image | (112,938) 55×63 | 에셋 up_DailyMission_10 |
| `layer_2_copy2` | 새 레이어 복사 | image | (112,1020) 55×63 | 에셋 up_DailyMission_11 |
| `layer_2_copy3` | 새 레이어 복사 | image | (111,1098) 55×63 | 에셋 up_DailyMission_12 |
| `layer_2_copy4` | 새 레이어 복사 | image | (99,1176) 85×77 | 에셋 up_DailyMission_13 |
| `layer_5` | 5 | text | (130,1197) 17×41 | "5" · 크기 근사 |
| `layer_5_copy` | 5 복사 | text | (130,1270) 17×41 | "6" · 크기 근사 |
| `layer_3_copy19` | 새 레이어 복사 | image | (294,1334) 132×133 | 에셋 up_DailyMission_08-1 |

## 구현 시 주의

- 텍스트 10개는 **rect 가 근사값**이다. 배치의 진실은 `at` + `anchorX/anchorY` 이므로 그쪽을 기준으로 구현할 것

