# main_copy2_copy — 김밥말기2

1080×2400 · 노드 25개 · rev `e8ce1d72`

## 구조

- **상중단** (4개) — 손님2, 손님1, 칼, 새 레이어
- **중앙** (15개) — 배경, 김밥발, 김, 펴진 밥, 밥통, 준비_발, 준비_김, 참기름 …
- **중하단** (6개) — 조리대, 기본재료, 스팸, 게맛살, 참치, 치즈

## 배치도

화면을 10×16 격자로 본 모습(왼쪽 위가 원점). `.` = 빈 곳.

```
..........
..........
1111......
11jjjjjjjj
11jjjjjjjj
11jjjjjjjj
555dddddee
555bbbbagg
55kkkkkkgg
ff533333cc
4444687799
4444687799
4444687799
4444687799
....687799
..........
```

| 기호 | id | 라벨 | 종류 |
|---|---|---|---|
| `1` | `layer_14` | 손님1 | image |
| `2` | `layer_15` | 손님2 | image |
| `3` | `layer_3` | 김밥발 | image |
| `4` | `layer_11` | 기본재료 | image |
| `5` | `layer_7` | 밥통 | image |
| `6` | `layer_12` | 스팸 | image |
| `7` | `layer_12_copy2` | 참치 | image |
| `8` | `layer_12_copy` | 게맛살 | image |
| `9` | `layer_12_copy3` | 치즈 | image |
| `a` | `layer_4` | 김 | image |
| `b` | `layer_5` | 펴진 밥 | image |
| `c` | `layer_9` | 준비_김 | image |
| `d` | `layer_6` | 칼 | image |
| `e` | `layer_10` | 참기름 | image |
| `f` | `layer_8` | 준비_발 | image |
| `g` | `layer_10_copy` | 깨소금 | image |
| `h` | `layer_13_copy7` | 김밥재료8_치즈 | image |
| `i` | `layer_13_copy6` | 김밥재료7_참치 | image |
| `j` | `layer_16` | 새 레이어 | image |
| `k` | `layer_18_copy` | 새 레이어 복사 | image |

## 전체 노드 (z 오름차순 — 뒤에서 앞으로)

| id | 라벨 | 타입 | rect (l,t,w,h) | 비고 |
|---|---|---|---|---|
| `layer_1` | 배경 | image | (1,1) 1078×2398 | 에셋 up_KBRM_BG_01_v3 |
| `layer_15` | 손님2 | image | (190,487) 373×833 | 에셋 up_Chr_02 |
| `layer_14` | 손님1 | image | (3,381) 383×1126 | 에셋 up_Chr_01 |
| `layer_2` | 조리대 | image | (-66,859) 1229×1454 | 에셋 up_KBRM_BG_02 |
| `layer_3` | 김밥발 | image | (284,1094) 512×520 | 에셋 up_Item_01_v3 |
| `layer_4` | 김 | image | (322,1129) 437×168 | 에셋 up_Item_03-2 |
| `layer_5` | 펴진 밥 | image | (340,1166) 400×150 | 에셋 up_Item_04-2 |
| `layer_6` | 칼 | image | (291,910) 499×89 | 에셋 up_Item_05_v4 |
| `layer_7` | 밥통 | image | (-27,900) 303×497 | 에셋 up_Item_06 |
| `layer_8` | 준비_발 | image | (19,1399) 193×195 | 에셋 up_Item_01_v4 |
| `layer_9` | 준비_김 | image | (872,1380) 213×222 | 에셋 up_Item_07 |
| `layer_10` | 참기름 | image | (870,970) 189×202 | 에셋 up_Item_08 |
| `layer_10_copy` | 깨소금 | image | (879,1171) 182×174 | 에셋 up_Item_09 |
| `layer_11` | 기본재료 | image | (25,1640) 436×356 | 에셋 up_Item_10-1 |
| `layer_12` | 스팸 | image | (455,1632) 169×481 | 에셋 up_Item_10-2 |
| `layer_12_copy` | 게맛살 | image | (602,1630) 165×483 | 에셋 up_Item_10-3 |
| `layer_12_copy2` | 참치 | image | (746,1631) 167×484 | 에셋 up_Item_10-4 |
| `layer_12_copy3` | 치즈 | image | (899,1629) 157×480 | 에셋 up_Item_10-5 |
| `layer_13_copy6` | 김밥재료7_참치 | image | (349,1251) 382×55 | 에셋 up_Item_10-4-1 |
| `layer_13_copy7` | 김밥재료8_치즈 | image | (349,1215) 382×60 | 에셋 up_Item_10-5-1 |
| `layer_16` | 새 레이어 | image | (313,467) 695×363 | 에셋 up_UI_03 |
| `layer_18_copy` | 새 레이어 복사 | image | (288,1205) 504×118 | 에셋 up_Item_11_v2 |
| `layer_17_copy2` | 새 레이어 복사 | image | (629,1392) 168×127 | 에셋 up_UI_04-2 |
| `layer_17_copy` | 새 레이어 복사 | image | (615,1206) 168×127 | 에셋 up_UI_04-2 |
| `layer_17` | 새 레이어 | image | (293,1201) 168×130 | 에셋 up_UI_04-1 |

