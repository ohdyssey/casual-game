/**
 * solveWorker.ts — Web Worker용 솔버 스크립트.
 * generate.ts의 solvePathAsync 에서 new Worker(new URL('./solveWorker.ts', import.meta.url)) 로 호출됨.
 *
 * 솔버 로직은 solver-core(순수, 워커/Phaser 무관)에서 import — generate.ts 를 import 하면
 * 워커 스폰 코드까지 워커 번들에 끌려오므로 일부러 generate 를 거치지 않는다.
 */

import { solvePath, type Stacks } from './solver-core.js';

interface SolveRequest {
  state: Stacks;
  capacity: number;
  maxMoves: number;
  nodeCap: number;
}

// Web Worker 메시지 핸들러
self.addEventListener('message', (e: MessageEvent<SolveRequest>) => {
  const { state, capacity, maxMoves, nodeCap } = e.data;
  try {
    const path = solvePath(state, capacity, maxMoves, nodeCap);
    (self as unknown as Worker).postMessage({ path });
  } catch (err) {
    (self as unknown as Worker).postMessage({ path: null, error: (err as Error).message });
  }
});
