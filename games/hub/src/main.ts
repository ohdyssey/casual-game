/**
 * 허브 엔트리 — 게임 그리드 + 포털 계정/경제(LiveOps) 바를 마운트.
 */
import { mountGrid } from './grid.js';
import { mountAccountHub } from './account.js';

const grid = document.getElementById('grid');
const foot = document.getElementById('foot');
if (grid && foot) mountGrid(grid, foot);

const accountBar = document.getElementById('account-bar');
if (accountBar) mountAccountHub(accountBar);
