# Casual Game Platform

피싱게임(`D:\Dev\fishing`)의 검증된 Phaser3 셸 ~25% 유틸을 수확한 **TypeScript 모노레포**.
7종 캐쥬얼게임을 공용 코어 위에서 양산한다. 설계: [PLAN.md](PLAN.md) · [DESIGN.md](DESIGN.md) · [TODOS.md](TODOS.md).

## 구조
```
packages/core/   @casual/core — 공용 엔진(TS 소스, 빌드단계 없음, alias로 소비)
games/store/     열정편의점(파일럿) — 그룹 정렬 퍼즐
shared-assets/   디자인 에셋 원본(Store)
```

## 실행 (P0)
```bash
npm install
npm run dev:store      # http://localhost:5181
npm run build:store
npm run typecheck
npm test
```

## 현재 상태: P0 (모노레포 토대 + 빈 데모 부팅)
- npm workspaces + TS + Vite, Phaser 3.90.0 루트 단일 버전(H3).
- core: scale(반응형 contain)·ui(strokeText/capsule)·tokens·systems(haptics/pwa)·game-shell(GameModule 계약).
- games/store: BootScene→PlayScene 빈 데모(편의점 배경 + HUD 토큰 검증).

다음(P1): `storeMachine`(그룹 정렬 상태머신) + StoreScene + 메타/분석 게임-로컬, watersort 인터리브.
