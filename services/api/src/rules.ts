/**
 * 공유 게임 규칙 재노출 — **이 파일만** 규칙 패키지의 실제 경로를 안다.
 *
 * ⚠️ 왜 `@casual/ttt-rules` 라는 패키지 이름 대신 상대경로를 쓰는가:
 *
 * `packages/ttt-rules` 는 빌드 단계가 없어서 `exports` 가 TypeScript 소스(`./src/*.ts`)를
 * 그대로 가리킨다. 브라우저 쪽(Vite)은 번들러가 알아서 처리하지만, Vercel 서버리스 함수는
 * 각 파일을 개별 변환한 뒤 **import 문을 그대로 남긴다**. 그러면 실행 시점에 Node 가
 * `node_modules/@casual/ttt-rules/src/index.ts` 를 그대로 불러오려다 죽는다.
 * (2026-08-11 실제 발생: `ERR_MODULE_NOT_FOUND ... /src/index.ts`)
 *
 * 상대경로로 쓰면 Vercel 이 이 파일들을 **자기 소스 트리의 일부로 보고 함께 변환**하므로
 * 실행 시점에도 정상적인 `.js` 가 존재한다.
 *
 * 규칙 본체를 복사하지 않는다는 원칙은 그대로다 — 클라이언트와 서버는 여전히 같은 코드를 쓴다.
 */
export * from '../../../packages/ttt-rules/src/index.js';
