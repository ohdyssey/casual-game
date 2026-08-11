# blank — 로비

1080×2400 · 노드 27개 · rev `ae6a3242`

## 구조

- **상단** (4개) — 비행선, 비행선, 비행선, 클럽 팝업 복사
- **상중단** (15개) — 새 레이어, 축포, 축포, 축포, 축포, 축포, 다각형, 클럽 팝업 …
- **중앙** (4개) — 하늘, 야구장, 보상 : 복사, 보상 : 복사
- **하단** (4개) — 캐릭터: 여성캐릭터 아이들, 캐릭터: 남성 아이들 동작, start버튼, Play Ball

## 배치도

화면을 10×16 격자로 본 모습(왼쪽 위가 원점). `.` = 빈 곳.

```
kk.......i
kccjjjjcci
.cc2222cci
.cc2222ccg
.cc6688ccg
.cc7755ccg
.cc9944ccg
.ccccccccf
.cccccccc.
..........
..........
aaaaaabbbb
aaaaaabbbb
aaaaaa1331
aaaaaa1111
aaaaaabbbb
```

| 기호 | id | 라벨 | 종류 |
|---|---|---|---|
| `1` | `layer_10` | start버튼 | button? |
| `2` | `layer_8_copy7` | 보상 : 복사 | text |
| `3` | `layer_11` | Play Ball | text |
| `4` | `layer_8_copy` | 보상 : 복사 | text |
| `5` | `layer_8_copy5` | 보상 : 복사 | text |
| `6` | `layer_8_copy2` | 보상 : 복사 | text |
| `7` | `layer_8_copy3` | 보상 : 복사 | text |
| `8` | `layer_8_copy4` | 보상 : 복사 | text |
| `9` | `layer_8_copy6` | 보상 : 복사 | text |
| `a` | `layer_8` | 캐릭터: 남성 아이들 동작 | spriteDocClip |
| `b` | `layer_7` | 캐릭터: 여성캐릭터 아이들 | spriteDocClip |
| `c` | `layer_6` | 클럽 팝업 | image |
| `d` | `layer_3_copy5` | 축포 | image |
| `e` | `layer_3_copy2` | 축포 | image |
| `f` | `layer_3_copy3` | 축포 | image |
| `g` | `layer_5` | 다각형 | polygon |
| `h` | `layer_3_copy` | 축포 | image |
| `i` | `layer_3_copy4` | 축포 | image |
| `j` | `layer_6_copy` | 클럽 팝업 복사 | image |
| `k` | `layer_4_copy` | 비행선 | image |

## ⚠ 추정된 상호작용 — 확정이 아닙니다

저작자가 역할을 지정하지 않아 하네스가 **유추한 후보**입니다.
구현에 참고하되 **코드에 `TODO` 로 남겨** 사람이 확인할 수 있게 하세요.
저작된 역할(`action:`)이 있으면 언제나 그쪽이 우선합니다.

| id | 라벨 | 확신 | 추정 동작 | 근거 |
|---|---|---|---|---|
| `layer_10` | start버튼 | 95% | `play` | 에셋 키가 UI 계열 (up_Solitare_UI_21-3) · 이름에 버튼/구매 표현 ("start버튼") · 인접 캡션 텍스트 "Play Ball" (layer_11) · 이름에서 동작 추정 → "play" |

## 전체 노드 (z 오름차순 — 뒤에서 앞으로)

| id | 라벨 | 타입 | rect (l,t,w,h) | 비고 |
|---|---|---|---|---|
| `layer_2` | 하늘 | image | (-495,-98) 2411×2411 | 에셋 up_ChatGPT_Image_2026__7__30_____06_01_54 |
| `layer_3` | 새 레이어 | image | (89,193) 296×1024 | 에셋 up_Homerun_BG_Loby_01-1 |
| `layer_3_copy5` | 축포 | image | (1411,23) 296×1024 | 에셋 up_Homerun_BG_Loby_01-1 |
| `layer_3_copy2` | 축포 | image | (346,178) 264×988 | 에셋 up_Homerun_BG_Loby_01-2_v2 |
| `layer_3_copy3` | 축포 | image | (1173,82) 264×988 | 에셋 up_Homerun_BG_Loby_01-2_v2 |
| `layer_3_copy` | 축포 | image | (243,241) 251×887 | 에셋 up_Homerun_BG_Loby_01-3 |
| `layer_3_copy4` | 축포 | image | (1317,116) 251×887 | 에셋 up_Homerun_BG_Loby_01-3 |
| `layer_4_copy2` | 비행선 | image | (561,184) 187×113 | 에셋 up_Homerun_BG_Loby_01-8_v2 |
| `layer_4_copy` | 비행선 | image | (-97,111) 244×169 | 에셋 up_Homerun_BG_Loby_01-7 |
| `layer_4` | 비행선 | image | (898,14) 152×224 | 에셋 up_Homerun_BG_Loby_01-5 |
| `layer_1` | 야구장 | image | (-495,-5) 2411×2411 | 에셋 up_Homerun_BG_Loby_01 |
| `layer_5` | 다각형 | polygon | (616,526) 555×464 | — |
| `layer_6` | 클럽 팝업 | image | (180,286) 695×925 | 에셋 up_Card_01_v5 |
| `layer_6_copy` | 클럽 팝업 복사 | image | (400,186) 280×197 | 에셋 up_Card_01-1 |
| `layer_8_copy2` | 보상 : 복사 | text | (418,727) 108×43 | "접속중" · 크기 근사 |
| `layer_8_copy4` | 보상 : 복사 | text | (634,718) 75×60 | "879" · 크기 근사 |
| `layer_8_copy7` | 보상 : 복사 | text | (420,406) 240×72 | "클럽리그" · 크기 근사 |
| `layer_8_copy5` | 보상 : 복사 | text | (607,840) 125×60 | "2,500" · 크기 근사 |
| `layer_8_copy` | 보상 : 복사 | text | (607,968) 125×60 | "2,500" · 크기 근사 |
| `layer_8_copy3` | 보상 : 복사 | text | (418,849) 108×43 | "입장료" · 크기 근사 |
| `layer_8_copy6` | 보상 : 복사 | text | (418,977) 72×43 | "보상" · 크기 근사 |
| `layer_7` | 캐릭터: 여성캐릭터 아이들 | spriteDocClip | (522,1732) 647×1166 | — |
| `layer_8` | 캐릭터: 남성 아이들 동작 | spriteDocClip | (-23,1654) 667×1232 | — |
| `layer_9` | 좌이동 | image | (23,648) 120×145 | 에셋 up_Solitare_UI_21-1 |
| `layer_9_copy` | 우이동 | image | (942,649) 120×143 | 에셋 up_Solitare_UI_21-2 |
| `layer_10` | start버튼 | image | (686,1980) 341×138 | 에셋 up_Solitare_UI_21-3 |
| `layer_11` | Play Ball | text | (767,2025) 180×48 | "Play Ball" · 크기 근사 |

## 구현 시 주의

- 텍스트 8개는 **rect 가 근사값**이다. 배치의 진실은 `at` + `anchorX/anchorY` 이므로 그쪽을 기준으로 구현할 것
- `layer_7` — 저작된 스프라이트 애니메이션 클립 — 게임이 자체 재생 구현
- `layer_8` — 저작된 스프라이트 애니메이션 클립 — 게임이 자체 재생 구현

