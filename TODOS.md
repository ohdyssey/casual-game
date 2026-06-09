# TODOS — 캐쥬얼게임 플랫폼

CEO 리뷰(`/plan-ceo-review`, 2026-06-02)에서 의도적으로 보류한 항목.
우선순위: P1=다음, P2=코어 동결 후, P3=양산 단계.

---

## P2 — 코어 동결 시점

### [D7] 앵커 기반 레이아웃 시스템 (전면)
- **What**: 코어에 anchor(top/bottom/center + px/% 오프셋) + safe-area 헬퍼 추가. 피싱의 수동 from-bottom 오프셋 픽셀 하드코딩 대체.
- **Why**: 7게임 × 수십 UI 요소로 좌표 하드코딩이 곱해지면 유지보수 지옥.
- **Context(H4 보정)**: 파일럿(grid 게임)용 `gridLayout(cols,rows,box)`는 **P1에 즉시 작성**(피싱 픽셀 오프셋이 grid엔 부적합). 여기 보류 대상은 **전면 앵커 시스템**으로, 2번째 게임에서 HUD/버튼 배치 고통 체감 후 도입.
- **Effort**: human ~1일 / CC ~20분 · **Priority**: P2~P3 · **Depends on**: 2게임 UI(고통 측정).

### [M3] 에셋 파이프라인 툴링
- **What**: 매니페스트 자동생성 + WebP 변환 + 아틀라스 NEAREST 필터 규칙 공용화(피싱 `resize-bg`·per-key 필터 핵을 7× 반복하지 않도록).
- **Why**: 7게임 × 수십 에셋 → 핸드핵 7중복.
- **Priority**: P2 (코어 수확과 동시).

### [H5] 공유 경제 — 단일 origin 또는 백엔드
- **What**: 게임 간 재화 공유(교차프로모·통합 지갑). 현재 D9(게임별 독립 배포)는 localStorage가 origin별 분리라 **공유 불가**.
- **Why**: §9 비전("공유 LiveOps")을 실제로 하려면 (a) 전 게임 단일 origin(경로 기반) 또는 (b) 백엔드 지갑 필요.
- **Context**: P0~P3는 게임별 지갑 수용. 2~3종 출시 후 교차프로모 가치 입증되면 결정.
- **Priority**: P3+ · **Depends on**: 배포 origin 전략 / 백엔드(R3).

### [D8] 코어 단위 테스트 (수락됨, 여기 기록)
- **What**: Vitest로 save·currency·level/state 리듀서·레이아웃 계산 80%+.
- **Priority**: P2 (코어 hoist와 동시).

### [D6] 원클릭 신작 스캐폴딩 CLI
- **What**: `npm run new-game <id>` → 게임 골격(GameModule + config + 에셋 폴더) 생성.
- **Why**: "공장"을 실제로 — 3번째 게임부터 양산 체감.
- **Context**: 코어 동결(P2) 전엔 템플릿이 유동적이라 조기 구현은 재작업. P2 이후.
- **Effort**: human ~1일 / CC ~20분 · **Priority**: P2~P3.

---

## P3+ — 양산/수익화 단계

### [R3] 서버 권위 세이브 + IAP 영수증 검증
- **What**: 재화/진척을 서버 검증. IAP 영수증 서버 검증, 광고 보상 서버 발급.
- **Why**: 클라 localStorage 세이브는 조작 가능. 실결제 도입 시 매출 보호 필수.
- **Context**: 파일럿/초기엔 클라 권위로 충분. 수익화 본격화 시점에 백엔드 도입.
- **Effort**: human ~1주 / CC ~2시간 · **Priority**: P3 · **Depends on**: 백엔드 선택(서버리스 vs BaaS).

### 구조화 로깅 + 에러 리포팅
- **What**: 코어 구조화 로그 + Sentry류 에러 리포팅.
- **Why**: D4(제품 분석)는 커버하나 개발/크래시 관측은 별개. 3주 후 버그 재현 가능해야.
- **Priority**: P3.

### 중앙 허브 앱 (D9 대안)
- **What**: 7게임 선택 허브 앱(교차프로모·통합 재화).
- **Why**: 현재 D9=게임별 독립 배포 선택. 포트폴리오 교차프로모 가치가 입증되면 재고.
- **Priority**: P3+ · **Depends on**: 2~3종 출시 후 데이터.

### 레벨 에디터/데이터 툴
- **What**: match3/store/tileconnect 레벨을 JSON/비주얼로 저작.
- **Why**: 레벨 콘텐츠 볼륨이 큰 장르의 콘텐츠 생산성.
- **Priority**: P3+.
