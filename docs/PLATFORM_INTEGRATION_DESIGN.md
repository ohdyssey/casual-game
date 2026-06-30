# PlayPOP — 통합 플랫폼 ↔ 독립 퍼블리싱 양립 설계 (제안)

> **목적:** 허브를 통한 **① 통합 로그인(SSO) ② 공유 게임재화 ③ 게임서버**를 구축하되, **각 게임은 독립 퍼블리싱(자체 로그인·재화·백엔드, 허브 무의존)도 가능**해야 한다.
> **상위 문서:** 서버 인프라/용량/PvP는 `~/.claude/plans/polished-singing-sunbeam.md`(클라우드 네이티브·동접1만 방향). 본 문서는 그 위에 **"플랫폼 계약 + 어댑터" 레이어**를 더해 통합/독립 양립을 설계한다.

---

## 0. 핵심 긴장과 해법 (한 줄 요약)

| 요구 | 긴장 | 해법 |
|---|---|---|
| 통합 로그인·공유 재화 (허브 중심) | ↔ | **하나의 게임 빌드가 두 모드로 동작** |
| 각 게임 독립 퍼블리싱 (허브 무의존) | | 게임은 구체 구현이 아니라 **`PlatformContext` 계약**에만 의존 → 호스트(허브/독립)가 **어댑터를 주입** |

게임은 백엔드·Supabase·허브를 **직접 모른다.** 부팅 시 누가 주입하느냐로 통합/독립이 갈린다. 기존 `setProfileStore()` 패턴(스토리지 주입)을 **전 플랫폼 능력으로 일반화**한 것이 본 설계의 뼈대다.

---

## 1. 현재 상태 (검증된 사실)

- 게임들은 `@casual/core/liveops`를 **직접 import**(store·Archery·ZombieArrow·Logistics가 `loadProfile`/`loadIdentity` 직접 호출). 주입 seam은 `packages/core/src/liveops/store.ts`의 **`ProfileStore` 하나뿐(스토리지만)**. **`PlatformContext` 없음.**
- 식별자=익명 `localStorage`(`playpop_identity_v1`), 지갑=`playpop_profile_v1`. 인증/서버 없음.
- 프로덕션은 **같은 origin 서브패스**(`ryanlogic.kr/hub/`, `/store/`, `/archery/`…) → **localStorage 공유**라 통합모드(공유 재화)가 *부분적으로* 이미 동작.
- 게임서버/멀티플레이 0, 전부 싱글(상위 문서 참조). 홈페이지는 현재 플레이 차단(`PLAY_BLOCKED`).

**결론:** 통합/독립 양립의 *토대(주입 seam)*는 있으나 좁다(스토리지뿐). 이를 **계약(contract)** 으로 넓혀야 한다.

---

## 2. 중심 아이디어 — `PlatformContext` 계약 + 어댑터 주입

게임은 플랫폼 능력을 **하나의 계약**으로만 쓴다. 위치 = 신규 `packages/core/src/platform/`(기존 `portal/`·`net/`의 형제, Phaser-free 계약 + 어댑터 + 리졸버).

```ts
// packages/core/src/platform/context.ts  (v1 — 동결 대상)
export interface PlatformContext {
  readonly mode: 'integrated' | 'standalone';
  readonly env: 'local' | 'remote';            // 백엔드 유무
  auth:    AuthPort;       // 현재 유저/세션, 익명→소셜
  wallet:  WalletPort;     // 잔액/earn/spend (scope 는 어댑터가 결정)
  save:    SavePort;       // 게임 진척 세이브(서버권위 or 로컬)
  board:   LeaderboardPort;// 점수 제출/조회
  liveops: LiveOpsPort;    // 상점·데일리·스핀 config (원격설정)
  iap?:    IapPort;        // 실결제(영수증)
  ads?:    AdsPort;        // 광고
  track:   (e: string, p?: Record<string, unknown>) => void; // 분석
}

export interface WalletPort {
  balance(): Promise<Wallet>;
  earn(amount: Reward, source: string): Promise<Wallet>;  // 서버검증·멱등
  spend(cost: Cost, reason: string): Promise<Wallet | 'insufficient'>;
}
export interface AuthPort {
  current(): Promise<User>;            // 익명이라도 항상 user_id 보유
  token(): Promise<string | null>;     // JWT (없으면 null=로컬모드)
  linkSocial(p: 'kakao'|'google'|'apple'): Promise<User>;
}
```

- 게임은 `ctx.wallet.spend(...)`만 호출 — **공유지갑인지 게임격리인지, 백엔드인지 로컬인지 모른다.**
- 부팅 시 호스트가 `PlatformContext` 구현을 주입(기존 `setProfileStore` → `setPlatform(ctx)`로 승격).

### 두 호스트(어댑터 세트)
| 호스트 | 주입하는 어댑터 | 쓰는 곳 |
|---|---|---|
| **Hub-Integrated** | 허브 SSO 토큰 + **공유 지갑(platform scope)** + 플랫폼 백엔드(tenant=platform) | 허브에서 실행(서브패스/포털) |
| **Standalone** | 게임 자체 익명·소셜 + **게임 지갑(game scope)** + (선택)자체 백엔드(tenant=game) or 로컬 | 독립 도메인/네이티브 앱 |
| **Local 폴백(공통)** | 전부 localStorage(현재 동작 보존) | 백엔드 없는 데모·오프라인 |

**동일 게임 빌드, 주입만 다름.**

---

## 3. 모드 판별 & 부팅 (빌드 1개 → 양 모드)

```
game boot → resolvePlatform():
  ?portal=<hubOrigin> 있음 + 같은/허용 origin  → Integrated 어댑터
  VITE_PLATFORM_MODE=standalone (+백엔드 URL)   → Standalone 어댑터
  그 외 / 백엔드 미설정                          → Local 폴백(localStorage)
→ setPlatform(ctx) → game-shell 이 ctx 를 GameModule 에 전달 → 씬 시작
```

- `?portal=` 신호는 **이미 존재**(런처가 부착). 독립 퍼블리싱은 같은 dist + `.env`(모드·백엔드·게임 테넌트 키)만 다르게 배포.
- `game-shell.ts`(`createCasualGame`)가 부팅 직전 `resolvePlatform()`을 호출해 주입 — 게임 코드는 모드에 무지.

---

## 4. 통합 로그인 (SSO)

토큰 기반(JWT, 익명 우선 → 소셜 링크). **단일 신원 키**를 통합·독립·네이티브·PvP가 공유(같은 공개키 신뢰).

**Integrated (허브가 세션 제공):**
- **같은 origin 서브패스**(현재 prod 구조)면 → 허브가 심은 세션 토큰을 **공유 쿠키(HttpOnly·Secure·SameSite)** 또는 공유 storage로 게임이 그대로 사용 → **추가 로그인 0**. (현재 localStorage 공유의 정식 후신.)
- **다른 origin/팝업**이면 → **포털 핸드오프로 단기 scoped 토큰 push**: 현재 포털 프로토콜(`hello/ready/started`)에 **`auth` 메시지 추가**(hub→game, 짧은 수명 토큰) + OIDC식 silent SSO 폴백.

**Standalone:** 게임 자체 익명(디바이스)→소셜 로그인. **같은 user_id 체계** → 나중에 플랫폼 편입 시 **계정 링크**로 진척·재화 승계(데이터 이관 불필요).

---

## 5. 게임 재화 (공유 ↔ 격리 양립)

서버 권위 **append-only `wallet_ledger`**(상위 문서). 양립의 열쇠 = **wallet scope**:

| 모드 | scope | 효과 |
|---|---|---|
| Integrated | `platform:<userId>` | **전 게임 공유 잔액** = 크로스프로모·스위칭코스트 **해자** |
| Standalone | `game:<gameId>:<userId>` | 게임별 **격리** 잔액 |
| Local | localStorage | 데모/오프라인 |

- 게임은 `wallet.earn/spend`만 호출(scope는 어댑터 결정) → **동일 코드**.
- earn/spend는 서버 검증(멱등·서버시간·치팅방어). 공유지갑이라도 **출처 태깅**(ledger에 `game_id`) → 게임별 적립/소비 분석·정산.
- **편입 머지 정책(결정 포인트):** 독립 게임을 플랫폼에 편입할 때 `game:` 잔액 → `platform:` 합산/환산/보너스 규칙.

---

## 6. 게임서버 (멀티테넌트 백엔드)

상위 문서의 클라우드 네이티브 백엔드를 **멀티테넌트**로 확장. tenant = `platform`(통합) 또는 `game:<id>`(독립). **같은 코드·인프라, 테넌트로 데이터 격리**(RLS + `tenant_id`). API 계약 동일(`/api/profile`·`/wallet`·`/scores`…), 토큰/헤더의 tenant로 분기.

**배포 토폴로지 3옵션:**
1. **공유 백엔드 멀티테넌트 (권장 기본):** 한 백엔드가 platform + 각 game 테넌트 서빙. 운영·비용 효율. 독립 퍼블리싱도 같은 백엔드의 `game:` 테넌트로.
2. **독립 게임 = 별도 백엔드 인스턴스:** 완전 격리(매각·라이선스·퍼블리셔 요구 시). **같은 코드 다른 배포** — PlatformContext 덕에 게임 코드 불변.
3. **혼합:** 핵심은 공유, 특정 건만 격리.

---

## 7. 능력별 어댑터 매트릭스

| 능력 | Integrated | Standalone | Local 폴백 |
|---|---|---|---|
| **auth** | 허브 SSO 토큰 | 자체 익명·소셜 | 익명 device id |
| **wallet** | 공유 `platform` scope | 게임 `game` scope | localStorage |
| **save** | 서버 권위 | 자체 서버 or 로컬 | localStorage |
| **board** | 플랫폼 글로벌(게임별 보드) | 게임 자체 보드 | 로컬/시드 NPC(현재) |
| **liveops** | 허브 원격설정 | 게임 번들 기본+자체 원격 | 번들 기본값 |
| **iap** | 플랫폼 통합 결제 | 스토어별 자체 IAP | 비활성 |
| **ads** | 플랫폼 미디에이션 | 게임 자체 SDK | 비활성 |
| **track** | 플랫폼 파이프 | 자체 or noop | noop |

**불변식:** 백엔드가 없어도(데모/오프라인) **Local 폴백으로 게임 단독 실행** — 현재 동작을 절대 깨지 않는다.

---

## 8. 계약 동결 & 버전

- `PlatformContext`를 **버전드 인터페이스(v1)** 로 동결. 게임은 v1에 컴파일 → 플랫폼 진화는 **어댑터 뒤**에서. 독립 게임이 임의의 v1-호환 백엔드와도 동작.
- 변경은 **확장만(옵셔널 추가)**, 파괴는 v2로. 게임 재작업 최소화.

---

## 9. 마이그레이션 (현 코드 → 계약)

브라운필드 다리 = 이미 있는 `setProfileStore`. 점진 적용:
1. `platform/` 패키지에 `PlatformContext` v1 + **Local 어댑터**(현 liveops/localStorage 그대로 래핑) → **동작 동일**(무회귀).
2. `game-shell`이 `resolvePlatform()`로 주입, `GameModule`에 `ctx` 전달.
3. 게임의 직접 `loadProfile()` 호출을 `ctx.wallet/save`로 점진 교체(한 게임씩, store부터).
4. Integrated/Standalone 원격 어댑터 추가.

**단계(상위 문서 P0~P3와 정렬):**
| 단계 | 내용 |
|---|---|
| **P0** | `PlatformContext` v1 + Local 어댑터(현 동작 동일) + `resolvePlatform` 골격. store 1종 무변경 동작 |
| **P1** | 허브 SSO 토큰(포털 `auth` 메시지/공유 쿠키) + **공유지갑(platform scope)** 원격 어댑터 + 진짜 랭킹 |
| **P2** | 멀티테넌트 백엔드 + **독립 퍼블리싱 패키지**(game scope·자체 익명로그인) + 서버권위 경제 |
| **P3** | IAP/ads, 네이티브 래핑(Capacitor), 계정 링크/편입 머지, (선택)별도 백엔드 인스턴스 |

---

## 10. 독립 퍼블리싱 패키지 (게임별)

산출물 = **게임 dist + standalone `.env`(모드·백엔드·테넌트 키) + (옵션)자체 백엔드 테넌트 프로비저닝 + 스토어 메타 + Capacitor 네이티브 래핑**(영구 캐시는 상위 문서 §9-B). 허브 의존 0: 포털 파라미터 없으면 standalone, 자체 로그인·재화·랭킹. **게임 코드 변경 없이** 퍼블리싱.

---

## 11. 보안 · 식별 일관성

- 양 모드 **서버 권위**(earn/spend/score). 토큰 검증 공통 공개키. 테넌트 격리(RLS).
- 독립↔통합 **계정 링크** 시 충돌/머지 규칙(같은 소셜계정이 양쪽에 있을 때).
- 단기 scoped 토큰(포털 핸드오프)·CORS/origin 허용목록.

---

## 12. 결정 포인트 (사용자 확인 필요)

1. **prod 배포 토폴로지:** 통합 게임을 **서브패스**(현행, SSO=공유쿠키로 간단) vs **서브도메인**(격리↑, SSO=토큰 핸드오프 필요) 중 무엇으로 표준화?
2. **독립 게임 백엔드:** 공유 멀티테넌트(기본) vs 게임별 별도 인스턴스(매각/라이선스 대비) — 기본 정책?
3. **공유↔격리 지갑 머지 정책:** 편입 시 합산/환산/보너스?
4. **계약 동결 시점:** 게임이 많아지기 전 v1 동결 권장(늦으면 전 게임 재작업). 언제?
5. **소셜 로그인 제공자:** 카카오/구글/애플 중 1차 범위?

---

## 13. PoC 게이트 (방향 검증)

1. `PlatformContext` v1 + Local 어댑터로 **store 무변경 동작**(타입체크+headless).
2. 허브가 SSO 토큰을 포털 `auth` 메시지로 게임에 전달 → 게임이 **공유지갑 잔액** 표시.
3. **같은 게임 빌드**를 standalone `.env`로 독립 실행 → 자체 익명로그인 + `game` scope 지갑(공유와 격리 확인).
4. 멀티테넌트 백엔드에서 platform vs game 테넌트 데이터 격리(RLS) 검증.

---

## 14. 건드릴/신규 핵심 파일

- **신규** `packages/core/src/platform/{context.ts(계약 v1), resolve.ts(모드판별·주입), adapters/{local,integrated,standalone}.ts}` — `portal/`·`net/` 형제.
- `packages/core/src/liveops/store.ts` — `setProfileStore` → `PlatformContext.save/wallet`로 흡수(Local 어댑터가 현 liveops 래핑).
- `packages/core/src/portal/protocol.ts` — hub→game **`auth` 메시지(scoped 토큰)** 추가.
- `packages/core/src/game-shell.ts` — `createCasualGame`에서 `resolvePlatform()` 주입 + `GameModule`에 `ctx` 전달.
- `games/hub/src/{account,launcher}.ts` — 허브가 세션 발급·포털로 토큰 전달, 공유지갑 표시.
- 게임들(store부터) — 직접 `loadProfile` → `ctx.wallet/save` 점진 교체.
