# main_copy2 — 김밥말기1

1080×2400 · 노드 40개 · rev `b9a1ebfc`

## 구조

- **상중단** (9개) — 손님2, 손님1, 칼, 새 레이어, 새 레이어 복사, 새 레이어 복사, 새 레이어, 새 레이어 복사 …
- **중앙** (25개) — 배경, 김밥발, 김, 펴진 밥, 밥통, 준비_발, 준비_김, 참기름 …
- **중하단** (6개) — 조리대, 기본재료, 스팸, 게맛살, 참치, 치즈

## 배치도

화면을 10×16 격자로 본 모습(왼쪽 위가 원점). `.` = 빈 곳.

```
..........
..........
1111......
111122....
111122....
111122....
666dddddee
66677774gg
666iiii4gg
ff6jjjj4cc
55558a99bb
55558a99bb
55558a99bb
55558a99bb
....8a99bb
..........
```

| 기호 | id | 라벨 | 종류 |
|---|---|---|---|
| `1` | `layer_14` | 손님1 | image |
| `2` | `layer_15` | 손님2 | image |
| `3` | `layer_3` | 김밥발 | image |
| `4` | `layer_4` | 김 | image |
| `5` | `layer_11` | 기본재료 | image |
| `6` | `layer_7` | 밥통 | image |
| `7` | `layer_5` | 펴진 밥 | image |
| `8` | `layer_12` | 스팸 | image |
| `9` | `layer_12_copy2` | 참치 | image |
| `a` | `layer_12_copy` | 게맛살 | image |
| `b` | `layer_12_copy3` | 치즈 | image |
| `c` | `layer_9` | 준비_김 | image |
| `d` | `layer_6` | 칼 | image |
| `e` | `layer_10` | 참기름 | image |
| `f` | `layer_8` | 준비_발 | image |
| `g` | `layer_10_copy` | 깨소금 | image |
| `h` | `layer_13_copy5` | 김밥재료6_게맛살 | image |
| `i` | `layer_13_copy7` | 김밥재료8_치즈 | image |
| `j` | `layer_13_copy2` | 김밥재료3_당근 | image |
| `k` | `layer_13_copy6` | 김밥재료7_참치 | image |

## 전체 노드 (z 오름차순 — 뒤에서 앞으로)

| id | 라벨 | 타입 | rect (l,t,w,h) | 비고 |
|---|---|---|---|---|
| `layer_1` | 배경 | image | (1,1) 1078×2398 | 에셋 up_KBRM_BG_01_v3 |
| `layer_15` | 손님2 | image | (190,487) 373×833 | 에셋 up_Chr_02 |
| `layer_14` | 손님1 | image | (3,381) 383×1126 | 에셋 up_Chr_01 |
| `layer_2` | 조리대 | image | (-66,859) 1229×1454 | 에셋 up_KBRM_BG_02 |
| `layer_3` | 김밥발 | image | (284,1094) 512×520 | 에셋 up_Item_01_v3 |
| `layer_4` | 김 | image | (322,1132) 437×376 | 에셋 up_Item_03-1_v2 |
| `layer_5` | 펴진 밥 | image | (340,1158) 400×277 | 에셋 up_Item_04-1 |
| `layer_6` | 칼 | image | (291,910) 499×89 | 에셋 up_Item_05_v4 |
| `layer_7` | 밥통 | image | (-27,900) 303×497 | 에셋 up_Item_06 |
| `layer_8` | 준비_발 | image | (19,1399) 193×195 | 에셋 up_Item_01_v4 |
| `layer_9` | 준비_김 | image | (872,1380) 213×222 | 에셋 up_Item_07 |
| `layer_10` | 참기름 | image | (870,970) 189×202 | 에셋 up_Item_08 |
| `layer_10_copy` | 깨소금 | image | (879,1171) 182×174 | 에셋 up_Item_09 |
| `layer_11` | 기본재료 | image | (25,1640) 436×356 | 에셋 up_Item_10-1 |
| `layer_12` | 스팸 | image | (455,1632) 169×481 | 에셋 up_Item_10-2 |
| `layer_12_copy` | 게맛살 | image | (602,1633) 161×483 | 에셋 up_Item_10-6 |
| `layer_12_copy2` | 참치 | image | (746,1631) 167×484 | 에셋 up_Item_10-4 |
| `layer_12_copy3` | 치즈 | image | (899,1629) 157×480 | 에셋 up_Item_10-5 |
| `layer_13` | 김밥재료1_단무지 | image | (349,1453) 382×48 | 에셋 up_Item_10-1-1 |
| `layer_13_copy` | 김밥재료2_시금치 | image | (349,1420) 382×48 | 에셋 up_Item_10-1-2 |
| `layer_13_copy2` | 김밥재료3_당근 | image | (349,1383) 382×57 | 에셋 up_Item_10-1-3 |
| `layer_13_copy3` | 김밥재료4_계란말이 | image | (349,1357) 382×43 | 에셋 up_Item_10-1-4 |
| `layer_13_copy4` | 김밥재료5_스팸 | image | (349,1319) 382×53 | 에셋 up_Item_10-2-1_v2 |
| `layer_13_copy5` | 김밥재료6_게맛살 | image | (349,1273) 382×70 | 에셋 up_Item_10-6-1 |
| `layer_13_copy6` | 김밥재료7_참치 | image | (349,1251) 382×55 | 에셋 up_Item_10-4-1 |
| `layer_13_copy7` | 김밥재료8_치즈 | image | (349,1215) 382×60 | 에셋 up_Item_10-5-1 |
| `layer_16` | 새 레이어 | image | (313,467) 695×363 | 에셋 up_UI_03 |
| `layer_18` | 새 레이어 | image | (335,1409) 411×98 | 에셋 up_Item_11-2 |
| `layer_17` | 새 레이어 | image | (286,1400) 168×130 | 에셋 up_UI_04-1 |
| `layer_17_copy` | 새 레이어 복사 | image | (612,1403) 168×127 | 에셋 up_UI_04-2 |
| `layer_19` | 새 레이어 | image | (314,811) 453×298 | 에셋 up_Item_12 |
| `layer_20_copy4` | 새 레이어 복사 | image | (422,879) 79×80 | 에셋 up_Item_12-3 |
| `layer_20_copy5` | 새 레이어 복사 | image | (501,865) 79×80 | 에셋 up_Item_12-3 |
| `layer_20` | 새 레이어 | image | (578,881) 79×80 | 에셋 up_Item_12-3 |
| `layer_20_copy` | 새 레이어 복사 | image | (555,935) 79×80 | 에셋 up_Item_12-3 |
| `layer_20_copy2` | 새 레이어 복사 | image | (487,963) 79×80 | 에셋 up_Item_12-3 |
| `layer_20_copy3` | 새 레이어 복사 | image | (413,941) 79×80 | 에셋 up_Item_12-3 |
| `layer_20_copy6` | 새 레이어 복사 | image | (460,862) 79×80 | 에셋 up_Item_12-3 |
| `layer_20_copy7` | 새 레이어 복사 | image | (535,875) 79×80 | 에셋 up_Item_12-3 |
| `layer_20_copy8` | 새 레이어 복사 | image | (479,923) 79×80 | 에셋 up_Item_12-3 |

