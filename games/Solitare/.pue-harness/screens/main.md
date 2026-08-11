# main — 플레이 화면

1080×2400 · 노드 35개 · rev `7421e494`

## 구조

- **상단** (12개) — 리워드, 리워드 복사, 사각형, 리워드 복사, 리워드 복사, 10m30s, 리워드 복사, 리워드 복사 …
- **상중단** (9개) — 스토어, 새 레이어, 사각형, 새 레이어 복사, +2, +2 복사, 새 레이어 복사, 새 레이어 …
- **중앙** (6개) — 배경, 새 레이어, 새 레이어, 새 레이어 복사, 새 레이어 복사, 2
- **중하단** (3개) — 매장, 새 레이어, 투명막
- **하단** (5개) — 새 레이어, 새 레이어 복사, 새 레이어, +1, 동선

## 배치도

화면을 10×16 격자로 본 모습(왼쪽 위가 원점). `.` = 빈 곳.

```
..........
..kkeff11.
.jkkggk11.
.jjjjjjjj.
3333993333
3333hhccb3
..........
..467884..
..467884..
..4aaaa4..
..iiiii...
..iiiii...
..iiiii...
..iiiii...
..iiiii.dd
..iiiii.dd
```

| 기호 | id | 라벨 | 종류 |
|---|---|---|---|
| `1` | `layer_20` | 닫기 버튼 | button? |
| `2` | `layer_13_copy6` | 리워드 복사 | button? |
| `3` | `layer_9` | 새 레이어 | button? |
| `4` | `layer_14` | 새 레이어 | button? |
| `5` | `layer_10` | 새 레이어 | button? |
| `6` | `layer_15` | 새 레이어 | button? |
| `7` | `layer_15_copy` | 새 레이어 복사 | button? |
| `8` | `layer_15_copy2` | 새 레이어 복사 | button? |
| `9` | `layer_5` | 새 레이어 | button? |
| `a` | `layer_16` | 2 | text |
| `b` | `layer_8` | +2 | text |
| `c` | `layer_8_copy2` | +2 복사 | text |
| `d` | `layer_12` | +1 | text |
| `e` | `layer_8_copy4` | +2 복사 | text |
| `f` | `layer_8_copy5` | +2 복사 | text |
| `g` | `layer_19` | 10m30s | text |
| `h` | `layer_8_copy` | +2 복사 | text |
| `i` | `layer_18` | 동선 | path |
| `j` | `layer_2` | 스토어 | image |
| `k` | `layer_13` | 리워드 | image |

## ⚠ 추정된 상호작용 — 확정이 아닙니다

저작자가 역할을 지정하지 않아 하네스가 **유추한 후보**입니다.
구현에 참고하되 **코드에 `TODO` 로 남겨** 사람이 확인할 수 있게 하세요.
저작된 역할(`action:`)이 있으면 언제나 그쪽이 우선합니다.

| id | 라벨 | 확신 | 추정 동작 | 근거 |
|---|---|---|---|---|
| `layer_14` | 새 레이어 | 70% | `gold` | 에셋 키가 UI 계열 (up_Solitare_UI_04) · 인접 캡션 텍스트 "+2,000 Coin" (layer_16) · 이름에서 동작 추정 → "gold" |
| `layer_10` | 새 레이어 | 55% | — | 에셋 키가 UI 계열 (up_Solitare_UI_08) · 인접 캡션 텍스트 "+1" (layer_12) |
| `layer_13_copy6` | 리워드 복사 | 55% | — | 에셋 키가 UI 계열 (up_Solitare_UI_2-2_v3) · 인접 캡션 텍스트 "X10" (layer_8_copy5) |
| `layer_15` | 새 레이어 | 55% | — | 에셋 키가 UI 계열 (up_Solitare_UI_02_v2) · 같은 크기 아이콘 3개 묶음 = 메뉴/내비 패턴 |
| `layer_15_copy` | 새 레이어 복사 | 55% | — | 에셋 키가 UI 계열 (up_Solitare_UI_02_v2) · 같은 크기 아이콘 3개 묶음 = 메뉴/내비 패턴 |
| `layer_15_copy2` | 새 레이어 복사 | 55% | — | 에셋 키가 UI 계열 (up_Solitare_UI_02_v2) · 같은 크기 아이콘 3개 묶음 = 메뉴/내비 패턴 |
| `layer_20` | 닫기 버튼 | 55% | `close` | 이름에 버튼/구매 표현 ("닫기 버튼") · 이름에서 동작 추정 → "close" |
| `layer_5` | 새 레이어 | 55% | — | 에셋 키가 UI 계열 (up_Solitare_UI_2-2_v2) · 인접 캡션 텍스트 "+2" (layer_8_copy) |
| `layer_9` | 새 레이어 | 55% | — | 에셋 키가 UI 계열 (up_Solitare_UI_10-1_v4) · 인접 캡션 텍스트 "+2" (layer_8_copy) |

## 전체 노드 (z 오름차순 — 뒤에서 앞으로)

| id | 라벨 | 타입 | rect (l,t,w,h) | 비고 |
|---|---|---|---|---|
| `layer_1` | 배경 | image | (0,0) 1080×2400 | 에셋 up_Solitaire_BG_Back01 |
| `layer_2` | 스토어 | image | (127,314) 798×540 | 에셋 up_Slitare_BG_01_v2 |
| `layer_3` | 매장 | image | (-13,785) 1107×2193 | 에셋 up_Slitare_BG_01-1_v2 |
| `layer_6` | 새 레이어 | image | (6,812) 1068×1951 | 에셋 up_Slitare_BG_01-7_v4 |
| `layer_4` | 투명막 | rect | (-13,739) 1106×1771 | — |
| `layer_10` | 새 레이어 | image | (921,2144) 99×138 | 에셋 up_Solitare_UI_08 |
| `layer_10_copy` | 새 레이어 복사 | image | (778,2163) 112×119 | 에셋 up_Solitare_UI_07-1 |
| `layer_11` | 새 레이어 | image | (72,2159) 130×123 | 에셋 up_Solitare_UI_06-1 |
| `layer_12` | +1 | text | (953,2215) 56×67 | "+1" · 크기 근사 |
| `layer_9` | 새 레이어 | image | (-14,638) 1108×212 | 에셋 up_Solitare_UI_10-1_v4 |
| `layer_14` | 새 레이어 | image | (320,1187) 440×197 | 에셋 up_Solitare_UI_04 |
| `layer_15` | 새 레이어 | image | (377,1195) 114×114 | 에셋 up_Solitare_UI_02_v2 |
| `layer_15_copy` | 새 레이어 복사 | image | (483,1195) 114×114 | 에셋 up_Solitare_UI_02_v2 |
| `layer_15_copy2` | 새 레이어 복사 | image | (588,1195) 114×114 | 에셋 up_Solitare_UI_02_v2 |
| `layer_7` | 사각형 | rect | (47,734) 177×58 | — |
| `layer_16` | 2 | text | (405,1375) 270×59 | "+2,000 Coin" · 크기 근사 |
| `layer_18` | 동선 | path | (225,1593) 523×1038 | — |
| `layer_15_copy3` | 새 레이어 복사 | image | (79,737) 51×51 | 에셋 up_Solitare_UI_02_v2 |
| `layer_8` | +2 | text | (834,774) 91×63 | "+2" |
| `layer_8_copy2` | +2 복사 | text | (709,783) 126×43 | "combo" |
| `layer_8_copy3` | 새 레이어 복사 | image | (924,766) 50×68 | 에셋 up_Solitare_UI_08-2_v2 |
| `layer_5` | 새 레이어 | image | (516,733) 57×50 | 에셋 up_Solitare_UI_2-2_v2 |
| `layer_8_copy` | +2 복사 | text | (507,753) 67×46 | "+2" |
| `layer_13` | 리워드 | image | (303,180) 474×135 | 에셋 up_Rewards_01_v2 |
| `layer_13_copy` | 리워드 복사 | image | (426,149) 229×91 | 에셋 up_Rewards_03 |
| `layer_17` | 사각형 | rect | (395,231) 187×43 | — |
| `layer_13_copy2` | 리워드 복사 | image | (344,211) 79×80 | 에셋 up_Rewards_02 |
| `layer_13_copy4` | 리워드 복사 | image | (451,284) 179×41 | 에셋 up_Rewards_04_v3 |
| `layer_19` | 10m30s | text | (512,287) 90×36 | "10m30s" · 크기 근사 |
| `layer_13_copy5` | 리워드 복사 | image | (353,197) 63×101 | 에셋 up_Item_01_01-4 |
| `layer_13_copy3` | 리워드 복사 | image | (662,211) 79×80 | 에셋 up_Rewards_02 |
| `layer_13_copy6` | 리워드 복사 | image | (671,219) 63×55 | 에셋 up_Solitare_UI_2-2_v3 |
| `layer_8_copy4` | +2 복사 | text | (480,237) 121×29 | "15/35" |
| `layer_8_copy5` | +2 복사 | text | (638,259) 121×29 | "X10" |
| `layer_20` | 닫기 버튼 | image | (819,270) 102×103 | 에셋 up_DailyMission_08-1_v3 |

## 구현 시 주의

- 텍스트 3개는 **rect 가 근사값**이다. 배치의 진실은 `at` + `anchorX/anchorY` 이므로 그쪽을 기준으로 구현할 것
- `layer_18` — 동선 — points 를 Catmull-Rom(tension) 스플라인으로 이어 만든 곡선. 다른 노드가 follow 로 이동. rect 는 경계상자일 뿐이므로 points 를 쓸 것

