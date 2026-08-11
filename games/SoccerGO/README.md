# SoccerGO

> 프리킥/페널티킥 슛 대결. 슬링샷처럼 공을 당겼다 놓으면 발사 — 수비벽과 골키퍼를 넘어 골을 노린다.
> 허브 등록 id `soccergo`, devPort **6210**, accent `#2EA84F`.

**상태(2026-08-01): 구조 스캐폴드 — 에셋 디자인 착수 전.** 필드/공/수비벽/골키퍼는 전부
Graphics 플레이스홀더지만 핵심 게임 루프(조준→발사→판정→카메라 연출→다음 시도)는 동작한다.
`npm run dev:soccergo`(포트 6210) 또는 허브에서 실행.

---

## 1. 게임 구조

- **입력**: 공을 화면 아무 곳에서나 눌러 아래로 당기면(슬링샷) 반대 방향(위=골)으로 발사.
  당김이 곧을수록 로프트(칩샷)가 높고, 비스듬할수록 커브(감아차기)가 커진다 — `src/logic/aim.ts`.
- **판정**: 파워/커브/로프트 + 수비벽 간격 + 골키퍼 다이빙으로 GOAL / SAVED / WALL_BLOCK /
  POST / WIDE / SHORT 를 결정하는 순수 함수 — `src/logic/judge.ts` (vitest 로 케이스 검증).
- **연출**: 키커 시점 의사원근(퍼스펙티브) 좌표계로 공/수비벽/골키퍼를 배치·스케일하고,
  슛 순간 카메라가 착지점 쪽으로 팬+줌인한다 — `src/scenes/PlayScene.ts`.
- **화면**: UI 에디터(phaser-ui-editor) `public/ui/layouts/main.json` 을 SSOT 로 HUD/배경을
  얹을 예정(현재는 빈 문서 — 채워지면 코드 변경 없이 자동 렌더). 게임플레이 오브젝트(필드·공·
  수비수·골키퍼)는 레이아웃 노드가 아니라 런타임 좌표라 계속 코드에서 그린다.

## 2. 남은 작업

- 에셋 디자인(필드/공/수비수/골키퍼/골대 아트 + main.json HUD) → 에디터로 착수.
- 로딩 화면(`public/loading/{bg,logo,start_on,start_off}.png`) 준비되면 `game.ts` 에
  `makePortalLoading` 을 다시 붙인다(현재는 형제 게임 Pickmeup 패턴대로 곧장 PlayScene 부팅).
- 난이도 커브(수비벽 배치 다양화, 골키퍼 스킬 성장, 시도 횟수/라운드 설계)는 미정 — 현재
  상수(`KEEPER_STATE`, `ATTEMPTS_PER_GAME` 등)는 구조 검증용 임시값.
