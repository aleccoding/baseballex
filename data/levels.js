// 共用等級設計（中職、日職、未來其他聯盟皆共用同一套）
// L0 為預設未填，等級越高代表造訪程度越深
// labelJa / shortJa 為日文版顯示文字（js/i18n.js 的 loc() 依語系取用）

export const LEVELS = [
  { id: 0, key: 'never',     label: '從未踏入',       labelJa: '行ったことがない',   color: '#9aa1ad', short: '未訪', shortJa: '未踏' },
  { id: 1, key: 'passedby',  label: '路過附近',       labelJa: '近くを通った',       color: '#4d9fe6', short: '路過', shortJa: '通過' },
  { id: 2, key: 'outside',   label: '只到球場外',     labelJa: '球場の外まで行った', color: '#3f9d63', short: '場外', shortJa: '場外' },
  { id: 3, key: 'partial',   label: '進場過但沒看完',  labelJa: '入場したが途中まで', color: '#dfa815', short: '進場', shortJa: '入場' },
  { id: 4, key: 'full',      label: '看完整場例行賽',  labelJa: '公式戦をフル観戦',   color: '#e05c17', short: '看完', shortJa: '観戦' },
  { id: 5, key: 'big',       label: '看過特別賽事（季後賽/總冠軍/明星賽/開幕戰/紀念活動）', labelJa: '特別な試合を観戦（ポストシーズン/優勝決定戦/オールスター/開幕戦/記念試合）', color: '#9c2323', short: '特別', shortJa: '特別' },
];

export const DEFAULT_LEVEL = 0;
