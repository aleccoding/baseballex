// DEPRECATED：已拆分為 cpbl.js / npb.js / levels.js / leagues.js
// 此檔保留為 re-export shim，維持舊 import 路徑相容
// 新程式請改用：
//   import { LEVELS, DEFAULT_LEVEL } from './levels.js';
//   import { LEAGUES } from './leagues.js';

export { LEVELS, DEFAULT_LEVEL } from './levels.js';
export { CPBL_TEAMS as TEAMS, CPBL_STADIUMS as STADIUMS } from './cpbl.js';
