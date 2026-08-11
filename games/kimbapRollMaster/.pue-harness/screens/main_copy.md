# main_copy — 김밥썰기

1080×2400 · 노드 25개 · rev `31cc06bf`

## 구조

- **상중단** (3개) — 손님2, 손님1, 새 레이어
- **중앙** (16개) — 배경, 밥통, 준비_발, 준비_김, 참기름, 깨소금, 김밥, 새 레이어 …
- **중하단** (6개) — 조리대, 기본재료, 스팸, 게맛살, 참치, 치즈

## 배치도

화면을 10×16 격자로 본 모습(왼쪽 위가 원점). `.` = 빈 곳.

```
..........
..........
1111......
11eeeeeeee
11eeeeeeee
11eeeeeeee
444122..bb
44412ffffd
4499kffffd
cc999ffffa
33335ffff8
3333576688
3333576688
3333576688
....576688
..........
```

| 기호 | id | 라벨 | 종류 |
|---|---|---|---|
| `1` | `layer_14` | 손님1 | image |
| `2` | `layer_15` | 손님2 | image |
| `3` | `layer_11` | 기본재료 | image |
| `4` | `layer_7` | 밥통 | image |
| `5` | `layer_12` | 스팸 | image |
| `6` | `layer_12_copy2` | 참치 | image |
| `7` | `layer_12_copy` | 게맛살 | image |
| `8` | `layer_12_copy3` | 치즈 | image |
| `9` | `layer_3` | 김밥 | image |
| `a` | `layer_9` | 준비_김 | image |
| `b` | `layer_10` | 참기름 | image |
| `c` | `layer_8` | 준비_발 | image |
| `d` | `layer_10_copy` | 깨소금 | image |
| `e` | `layer_16` | 새 레이어 | image |
| `f` | `layer_17_copy` | 새 레이어 복사 | image |
| `g` | `layer_4` | 새 레이어 | image |
| `h` | `layer_4_copy` | 새 레이어 복사 | image |
| `i` | `layer_4_copy2` | 새 레이어 복사 | image |
| `j` | `layer_4_copy3` | 새 레이어 복사 | image |
| `k` | `layer_4_copy4` | 새 레이어 복사 | image |

## 전체 노드 (z 오름차순 — 뒤에서 앞으로)

| id | 라벨 | 타입 | rect (l,t,w,h) | 비고 |
|---|---|---|---|---|
| `layer_1` | 배경 | image | (1,1) 1078×2398 | 에셋 up_KBRM_BG_01_v3 |
| `layer_15` | 손님2 | image | (190,487) 373×833 | 에셋 up_Chr_02 |
| `layer_14` | 손님1 | image | (3,381) 383×1126 | 에셋 up_Chr_01 |
| `layer_2` | 조리대 | image | (-66,859) 1229×1454 | 에셋 up_KBRM_BG_02 |
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
| `layer_16` | 새 레이어 | image | (313,467) 695×363 | 에셋 up_UI_03 |
| `layer_3` | 김밥 | image | (291,1235) 499×117 | 에셋 up_Item_11 |
| `layer_4` | 새 레이어 | image | (679,1248) 22×95 | 에셋 up_Item_11-1 |
| `layer_4_copy` | 새 레이어 복사 | image | (636,1248) 22×95 | 에셋 up_Item_11-1 |
| `layer_4_copy2` | 새 레이어 복사 | image | (593,1248) 22×95 | 에셋 up_Item_11-1 |
| `layer_4_copy3` | 새 레이어 복사 | image | (550,1248) 22×95 | 에셋 up_Item_11-1 |
| `layer_4_copy4` | 새 레이어 복사 | image | (507,1248) 22×95 | 에셋 up_Item_11-1 |
| `layer_4_copy5` | 새 레이어 복사 | image | (464,1248) 22×95 | 에셋 up_Item_11-1 |
| `layer_4_copy6` | 새 레이어 복사 | image | (421,1248) 22×95 | 에셋 up_Item_11-1 |
| `layer_4_copy7` | 새 레이어 복사 | image | (378,1248) 22×95 | 에셋 up_Item_11-1 |
| `layer_17_copy` | 새 레이어 복사 | image | (613,1185) 276×360 | 에셋 up_Item_05-1_v2 |

