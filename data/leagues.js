// 聯盟集合：把 cpbl/npb 的資料統一以 LEAGUES 物件提供
// app.js / map.js 透過 league key 切換要渲染的資料

import {
  CPBL_TEAMS, CPBL_STADIUMS, CPBL_BBOX, CPBL_OUTLINE_PATH,
} from './cpbl.js';
import {
  NPB_TEAMS, NPB_STADIUMS, NPB_BBOX, NPB_OUTLINE_PATH,
} from './npb.js';

export const LEAGUES = {
  cpbl: {
    id: 'cpbl',
    name: '中華職棒',
    shortName: '中職',
    fullTitle: '中華職棒球場制霸等級',
    season: '2026 賽季',
    teams: CPBL_TEAMS,
    stadiums: CPBL_STADIUMS,
    bbox: CPBL_BBOX,
    outlinePath: CPBL_OUTLINE_PATH,
    storageKey: 'baseballex_levels_v1',  // 沿用既有 key，相容舊紀錄
  },
  npb: {
    id: 'npb',
    name: '日本職棒',
    shortName: '日職',
    fullTitle: '日本職棒球場制霸等級',
    season: '2026 賽季',
    teams: NPB_TEAMS,
    stadiums: NPB_STADIUMS,
    bbox: NPB_BBOX,
    outlinePath: NPB_OUTLINE_PATH,
    storageKey: 'baseballex_levels_v1_npb',
  },
};

export const DEFAULT_LEAGUE = 'cpbl';
