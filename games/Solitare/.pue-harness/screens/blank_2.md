# blank_2 — 결과화면

1080×2400 · 노드 22개 · rev `448098c3`

## 구조

- **상중단** (6개) — 별, 별, 별, 별, 별, 잘했어요!
- **중앙** (12개) — 팝업창, 새 레이어, 새 레이어 복사, 새 레이어 복사, z, 카드, 카드, +1 …
- **중하단** (4개) — 홈버튼, 넥스트레벨, +1 복사, +1 복사

## 배치도

화면을 10×16 격자로 본 모습(왼쪽 위가 원점). `.` = 빈 곳.

```
..........
..........
...ccc....
biigghjjjb
bii2222jjb
bbb2222bbb
bbb3333bbb
bbbeeffbbb
bbb77f8bbb
bbkkbbbbbb
b144aa99db
b1151d66db
bbbbbbbbbb
..........
..........
..........
```

| 기호 | id | 라벨 | 종류 |
|---|---|---|---|
| `1` | `layer_5` | 홈버튼 | button? |
| `2` | `layer_3` | 잘했어요! | text |
| `3` | `layer_4` | z | text |
| `4` | `layer_8_copy2` | +1 복사 | text |
| `5` | `layer_8_copy3` | +1 복사 | text |
| `6` | `layer_8_copy6` | +1 복사 | text |
| `7` | `layer_8` | +1 | text |
| `8` | `layer_8_copy` | +1 복사 | text |
| `9` | `layer_8_copy5` | +1 복사 | text |
| `a` | `layer_8_copy4` | +1 복사 | text |
| `b` | `layer_1` | 팝업창 | image |
| `c` | `layer_2` | 별 | image |
| `d` | `layer_5_copy` | 넥스트레벨 | image |
| `e` | `layer_7` | 카드 | image |
| `f` | `layer_7_copy` | 카드 | image |
| `g` | `layer_2_copy` | 별 | image |
| `h` | `layer_2_copy2` | 별 | image |
| `i` | `layer_2_copy3` | 별 | image |
| `j` | `layer_2_copy4` | 별 | image |
| `k` | `layer_6` | 새 레이어 | image |

## ⚠ 추정된 상호작용 — 확정이 아닙니다

저작자가 역할을 지정하지 않아 하네스가 **유추한 후보**입니다.
구현에 참고하되 **코드에 `TODO` 로 남겨** 사람이 확인할 수 있게 하세요.
저작된 역할(`action:`)이 있으면 언제나 그쪽이 우선합니다.

| id | 라벨 | 확신 | 추정 동작 | 근거 |
|---|---|---|---|---|
| `layer_5` | 홈버튼 | 60% | — | 이름에 버튼/구매 표현 ("홈버튼") · 인접 캡션 텍스트 "HOME" (layer_8_copy3) |

## 전체 노드 (z 오름차순 — 뒤에서 앞으로)

| id | 라벨 | 타입 | rect (l,t,w,h) | 비고 |
|---|---|---|---|---|
| `layer_1` | 팝업창 | image | (28,501) 1024×1371 | 에셋 up_Resurt_01 |
| `layer_5` | 홈버튼 | image | (191,1641) 337×115 | 에셋 up_Resurt_02 |
| `layer_5_copy` | 넥스트레벨 | image | (542,1639) 337×120 | 에셋 up_Resurt_03 |
| `layer_6` | 새 레이어 | image | (273,1367) 107×111 | 에셋 up_Solitare_UI_2-3_v5 |
| `layer_6_copy` | 새 레이어 복사 | image | (487,1376) 107×94 | 에셋 up_Solitare_UI_2-2_v5 |
| `layer_6_copy2` | 새 레이어 복사 | image | (708,1369) 107×107 | 에셋 up_Solitare_UI_02_v6 |
| `layer_2` | 별 | image | (418,396) 212×212 | 에셋 up_Solitare_UI_02_v5 |
| `layer_2_copy` | 별 | image | (284,455) 154×154 | 에셋 up_Solitare_UI_02_v5 |
| `layer_2_copy2` | 별 | image | (615,455) 154×154 | 에셋 up_Solitare_UI_02_v5 |
| `layer_2_copy3` | 별 | image | (178,514) 122×122 | 에셋 up_Solitare_UI_02_v5 |
| `layer_2_copy4` | 별 | image | (755,514) 122×122 | 에셋 up_Solitare_UI_02_v5 |
| `layer_3` | 잘했어요! | text | (338,725) 405×108 | "잘했어요!" · 크기 근사 |
| `layer_4` | z | text | (393,960) 300×48 | "컬렉션카드 획득" · 크기 근사 |
| `layer_7` | 카드 | image | (339,1060) 161×241 | 에셋 up_02_v2 |
| `layer_7_copy` | 카드 | image | (574,1060) 161×241 | 에셋 up_06_v2 |
| `layer_8` | +1 | text | (428,1232) 50×60 | "+1" · 크기 근사 |
| `layer_8_copy2` | +1 복사 | text | (277,1503) 92×55 | "4500" · 크기 근사 |
| `layer_8_copy4` | +1 복사 | text | (528,1503) 23×55 | "2" · 크기 근사 |
| `layer_8_copy5` | +1 복사 | text | (745,1503) 46×55 | "15" · 크기 근사 |
| `layer_8_copy3` | +1 복사 | text | (345,1672) 80×48 | "HOME" · 크기 근사 |
| `layer_8_copy6` | +1 복사 | text | (691,1672) 80×48 | "NEXT" · 크기 근사 |
| `layer_8_copy` | +1 복사 | text | (671,1232) 50×60 | "+1" · 크기 근사 |

## 구현 시 주의

- 텍스트 9개는 **rect 가 근사값**이다. 배치의 진실은 `at` + `anchorX/anchorY` 이므로 그쪽을 기준으로 구현할 것

