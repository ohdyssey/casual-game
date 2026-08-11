# main — 메인 화면

1080×2400 · 노드 31개 · rev `58dbea5c`

## 구조

- **상단** (12개) — 새 레이어, 헤더_우_점수, 헤더_우_네임, 헤더_중앙_시간, 헤더_중앙_네임, 헤더_좌_점수, 헤더_좌_네임, 1R Homerun 125 복사 …
- **상중단** (1개) — 전광판 이펙트
- **중앙** (8개) — 배경, 수비수, 수비수 복사, 수비수 복사, 수비수 복사, 수비수 복사, 수비수 복사, 캐릭터: 투수1
- **중하단** (1개) — 캐릭터: 타자1
- **하단** (8개) — 메뉴_우하, 메뉴_우하 복사, 메뉴_아이템_중앙하단, 메뉴_아이템_중앙하단_네임, 메뉴_시즌패스_좌하단, 사각형, 새 레이어, 메뉴_시즌패스_네임
- **기타** (1개) — 영역 설정

## 배치도

화면을 10×16 격자로 본 모습(왼쪽 위가 원점). `.` = 빈 곳.

```
kk89339559
kkb9339aaa
bbb....aaa
...ggggg..
...ggggg..
...ggggg..
..........
...hhhh..j
...hhhh..j
...hhhh...
ffffff....
ffffff....
ffffff....
ffffff..ii
ffffff11ii
ffffff11ii
```

| 기호 | id | 라벨 | 종류 |
|---|---|---|---|
| `1` | `layer_1_copy6` | 메뉴_아이템_중앙하단 | button? |
| `2` | `layer_1_copy5` | 메뉴_시즌패스_좌하단 | button? |
| `3` | `layer_12` | 홈버튼 | button? |
| `4` | `layer_2_copy4` | 헤더_중앙_시간 | data |
| `5` | `layer_2_copy` | 헤더_우_네임 | data |
| `6` | `layer_2_copy2` | 헤더_좌_점수 | data |
| `7` | `layer_2_copy3` | 헤더_우_점수 | data |
| `8` | `layer_2` | 헤더_좌_네임 | data |
| `9` | `layer_1` | 새 레이어 | button? |
| `a` | `layer_9_copy` | 1R Homerun 125 복사 | text |
| `b` | `layer_9_copy2` | 1R Homerun 125 복사 | text |
| `c` | `layer_2_copy5` | 헤더_중앙_네임 | text |
| `d` | `layer_2_copy10` | 메뉴_아이템_중앙하단_네임 | text |
| `e` | `layer_2_copy9` | 메뉴_시즌패스_네임 | text |
| `f` | `layer_4` | 캐릭터: 타자1 | spriteDocClip |
| `g` | `layer_5` | 전광판 이펙트 | polygon |
| `h` | `layer_6` | 캐릭터: 투수1 | spriteDocClip |
| `i` | `layer_1_copy7` | 메뉴_우하 | image |
| `j` | `layer_7_copy` | 수비수 복사 | image |
| `k` | `layer_10` | 프로필 좌 | rect |

## ⚠ 추정된 상호작용 — 확정이 아닙니다

저작자가 역할을 지정하지 않아 하네스가 **유추한 후보**입니다.
구현에 참고하되 **코드에 `TODO` 로 남겨** 사람이 확인할 수 있게 하세요.
저작된 역할(`action:`)이 있으면 언제나 그쪽이 우선합니다.

| id | 라벨 | 확신 | 추정 동작 | 근거 |
|---|---|---|---|---|
| `layer_12` | 홈버튼 | 95% | — | 에셋 키가 UI 계열 (up_Homerun_UI_11) · 이름에 버튼/구매 표현 ("홈버튼") · 인접 캡션 텍스트 "ROUND" (layer_2_copy5) |
| `layer_1_copy5` | 메뉴_시즌패스_좌하단 | 70% | `pass` | 에셋 키가 UI 계열 (up_Homerun_UI_08_v2) · 인접 캡션 텍스트 "SEASON PASS" (layer_2_copy9) · 이름에서 동작 추정 → "pass" |
| `layer_1` | 새 레이어 | 55% | — | 에셋 키가 UI 계열 (up_Homerun_UI_00) · 인접 캡션 텍스트 "ROUND" (layer_2_copy5) |
| `layer_1_copy6` | 메뉴_아이템_중앙하단 | 55% | — | 에셋 키가 UI 계열 (up_Homerun_UI_09_v3) · 인접 캡션 텍스트 "HIT 5 HOMRUNS" (layer_2_copy10) |

## 데이터 바인딩 (런타임 값으로 교체)

| id | 키 | 기본 표시 |
|---|---|---|
| `layer_2_copy3` | `value` | 1,620 |
| `layer_2_copy` | `name` | SLUGGER89 |
| `layer_2_copy4` | `time` | 2R |
| `layer_2_copy2` | `value` | 1,835 |
| `layer_2` | `name` | ROOKIE27 |

## 전체 노드 (z 오름차순 — 뒤에서 앞으로)

| id | 라벨 | 타입 | rect (l,t,w,h) | 비고 |
|---|---|---|---|---|
| `layer_3` | 배경 | image | (-667,-7) 2415×2415 | 에셋 up_Homerun_BG_06_v3 |
| `layer_8` | 영역 설정 | zone | — | — |
| `layer_5` | 전광판 이펙트 | polygon | (327,549) 441×311 | — |
| `layer_1_copy7` | 메뉴_우하 | image | (872,2099) 147×195 | 에셋 up_Homerun_UI_10_v2 |
| `layer_1_copy` | 메뉴_우하 복사 | image | (877,2253) 39×40 | 에셋 up_Homerun_UI_10-1 |
| `layer_1_copy6` | 메뉴_아이템_중앙하단 | image | (431,2180) 361×114 | 에셋 up_Homerun_UI_09_v3 |
| `layer_2_copy10` | 메뉴_아이템_중앙하단_네임 | text | (456,2192) 169×31 | "HIT 5 HOMRUNS" |
| `layer_1_copy5` | 메뉴_시즌패스_좌하단 | image | (43,2179) 323×114 | 에셋 up_Homerun_UI_08_v2 |
| `layer_11` | 사각형 | rect | (96,2228) 130×31 | — |
| `layer_9` | 새 레이어 | image | (54,2189) 91×89 | 에셋 up_Homerun_UI_08-1 |
| `layer_2_copy9` | 메뉴_시즌패스_네임 | text | (144,2191) 133×28 | "SEASON PASS" |
| `layer_1` | 새 레이어 | image | (25,90) 1024×199 | 에셋 up_Homerun_UI_00 |
| `layer_7` | 수비수 | image | (-438,1185) 99×126 | 에셋 up_Ch-3-04 |
| `layer_7_copy` | 수비수 복사 | image | (1249,1183) 99×130 | 에셋 up_Ch-3-02 |
| `layer_7_copy2` | 수비수 복사 | image | (597,1146) 69×93 | 에셋 up_Ch-3-03 |
| `layer_7_copy3` | 수비수 복사 | image | (149,1154) 74×93 | 에셋 up_Ch-3-01 |
| `layer_7_copy4` | 수비수 복사 | image | (919,1157) 35×47 | 에셋 up_Ch-3-05 |
| `layer_7_copy5` | 수비수 복사 | image | (288,1157) 29×38 | 에셋 up_Ch-3-08 |
| `layer_2_copy3` | 헤더_우_점수 | text | (795,160) 100×48 | "1,620" · 바인딩 value · 크기 근사 |
| `layer_2_copy` | 헤더_우_네임 | text | (764,125) 135×36 | "SLUGGER89" · 바인딩 name · 크기 근사 |
| `layer_2_copy4` | 헤더_중앙_시간 | text | (481,205) 118×45 | "2R" · 바인딩 time |
| `layer_2_copy5` | 헤더_중앙_네임 | text | (435,162) 211×55 | "ROUND" |
| `layer_2_copy2` | 헤더_좌_점수 | text | (174,160) 100×48 | "1,835" · 바인딩 value · 크기 근사 |
| `layer_2` | 헤더_좌_네임 | text | (178,128) 120×36 | "ROOKIE27" · 바인딩 name · 크기 근사 |
| `layer_6` | 캐릭터: 투수1 | spriteDocClip | (419,1174) 242×224 | — |
| `layer_9_copy2` | 1R Homerun 125 복사 | text | (29,285) 280×48 | "2R Homerun 110" · 크기 근사 |
| `layer_9_copy` | 1R Homerun 125 복사 | text | (757,285) 280×48 | "2R Homerun 110" · 크기 근사 |
| `layer_10` | 프로필 좌 | rect | (54,116) 98×128 | — |
| `layer_10_copy` | 프로필 우 | rect | (920,116) 98×128 | — |
| `layer_12` | 홈버튼 | image | (485,37) 110×119 | 에셋 up_Homerun_UI_11 |
| `layer_4` | 캐릭터: 타자1 | spriteDocClip | (-185,1574) 814×814 | — |

## 구현 시 주의

- 텍스트 6개는 **rect 가 근사값**이다. 배치의 진실은 `at` + `anchorX/anchorY` 이므로 그쪽을 기준으로 구현할 것
- `layer_8` — 크기 미지정
- `layer_6` — 저작된 스프라이트 애니메이션 클립 — 게임이 자체 재생 구현
- `layer_4` — 저작된 스프라이트 애니메이션 클립 — 게임이 자체 재생 구현

