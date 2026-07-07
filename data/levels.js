// 共用等級設計（中職、日職、未來其他聯盟皆共用同一套）
// L0 為預設未填，等級越高代表造訪程度越深

export const LEVELS = [
  { id: 0, key: 'never',     label: '從未踏入',       color: '#cbd5e1', short: '未訪' },
  { id: 1, key: 'passedby',  label: '路過附近',       color: '#60a5fa', short: '路過' },
  { id: 2, key: 'outside',   label: '只到球場外',     color: '#15803d', short: '場外' },
  { id: 3, key: 'partial',   label: '進場過但沒看完',  color: '#facc15', short: '進場' },
  { id: 4, key: 'full',      label: '看完整場例行賽',  color: '#f97316', short: '看完' },
  { id: 5, key: 'big',       label: '看過特別賽事（季後賽/總冠軍/明星賽/開幕戰/紀念活動）', color: '#dc2626', short: '特別' },
];

export const DEFAULT_LEVEL = 0;
