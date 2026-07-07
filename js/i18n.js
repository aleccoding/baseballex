// i18n：zh（繁中，預設）/ ja（日文）
// - UI 字串集中在 UI 字典，t(key, params) 取用
// - 資料物件（球場/球團/等級/聯盟）用 loc(obj, 'field')：
//   ja 時優先取 obj.fieldJa，沒有就 fallback 回 obj.field

const STORAGE_KEY = 'baseballex_locale';
export const LOCALES = ['zh', 'ja'];

function detectLocale() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (LOCALES.includes(saved)) return saved;
  } catch { /* 隱私模式等 */ }
  const nav = navigator.language || '';
  return nav.toLowerCase().startsWith('ja') ? 'ja' : 'zh';
}

let locale = detectLocale();

export function getLocale() {
  return locale;
}

export function setLocale(l) {
  if (!LOCALES.includes(l)) return;
  locale = l;
  try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
}

// ja 時取 fieldJa（若存在），否則回 field
export function loc(obj, field) {
  if (!obj) return '';
  if (locale === 'ja') {
    const ja = obj[field + 'Ja'];
    if (ja != null && ja !== '') return ja;
  }
  return obj[field] ?? '';
}

export function t(key, params) {
  const dict = UI[locale] || UI.zh;
  let s = dict[key] ?? UI.zh[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}

const UI = {
  zh: {
    htmlLang: 'zh-Hant',
    metaDescription: '紀錄你進過的中華職棒、日本職棒一軍球場，產生分享圖到社群媒體。',
    langToggleLabel: '日本語',        // 顯示「可切換到的語言」

    scoreLabel: '制霸等級',
    // 「點亮」而非「進過」：L1 路過、L2 場外沒有進場，但都會讓地圖上的球亮起來
    statsLine: '點亮 {v} / {t} 座球場',
    heroSubtitle: '{season}・全 {n} 座一軍球場',
    docTitle: '{title} {season} ⚾️',
    tabAriaLabel: '聯盟切換',

    mapTitle: '地圖',
    legendTitle: '等級',
    stadiumsTitle: '球場',
    distTitle: '等級分布',
    distCount: '{n} 座',
    mapLoadFailed: '地圖載入失敗',
    mapAriaLabel: '{league}球場分布地圖',
    zoomGroupLabel: '地圖縮放',
    zoomIn: '放大',
    zoomOut: '縮小',
    zoomReset: '重置視角',

    chipShared: '六隊共用',
    chipSecondary: '移地賽',
    cardMeta: '{year} 啟用 · 容納 {cap}',

    btnReset: '重置',
    btnDownload: '下載 PNG',
    btnSocial: '分享到社群',
    resetConfirm: '確定要重置 {league} 所有球場等級嗎？',
    generating: '產生中…',
    genFailed: '產生失敗：',

    pickerTitle: '選擇等級',
    pickerCancel: '取消',

    shareModalTitle: '分享你的成績',
    sharePreviewAlt: '分享圖預覽',
    shareToLabel: '分享到',
    shareSelfLabel: '或複製・下載',
    shareDownload: '⬇️ 下載 PNG',
    shareNative: '📱 系統分享',
    shareCopyImg: '📋 複製圖片',
    shareCopyImgNA: '📋 複製圖片（不支援）',
    shareCopyText: '📝 複製文字',
    shareCopied: '✅ 已複製',
    shareCopyFailed: '複製失敗，可能瀏覽器不允許',
    shareHint: '部分平台無法直接帶圖，請先「複製圖片」或「下載 PNG」再貼到貼文。',
    shareText: '我在{title}拿到 {score} / {max} 分，點亮 {visited} / {total} 座一軍球場！⚾️ 你也來試試：{url}',
    shareStatsLine: '點亮 {v} / {t} 座球場・還有 {r} 座待點亮',
    shareCta: '你也來點亮你的球場地圖 ⚾️ {url}',

    close: '關閉',
    footerAbout: '關於',
    footerPrivacy: '隱私說明',
    aboutTitle: '關於這個工具',
    privacyTitle: '隱私說明',
  },

  ja: {
    htmlLang: 'ja',
    metaDescription: '行ったことのある台湾プロ野球・日本プロ野球の一軍球場を記録して、シェア画像を作れるツールです。',
    langToggleLabel: '中文',

    scoreLabel: '制覇レベル',
    statsLine: '{v} / {t} 球場をアンロック',
    heroSubtitle: '{season}・全{n}球場（一軍）',
    docTitle: '{title} {season} ⚾️',
    tabAriaLabel: 'リーグ切替',

    mapTitle: '地図',
    legendTitle: 'レベル',
    stadiumsTitle: '球場',
    distTitle: 'レベル分布',
    distCount: '{n}ヶ所',
    mapLoadFailed: '地図の読み込みに失敗しました',
    mapAriaLabel: '{league}球場マップ',
    zoomGroupLabel: '地図ズーム',
    zoomIn: '拡大',
    zoomOut: '縮小',
    zoomReset: 'リセット',

    chipShared: '6球団共用',
    chipSecondary: '地方開催',
    cardMeta: '{year}年開場 · 収容 {cap}人',

    btnReset: 'リセット',
    btnDownload: 'PNG保存',
    btnSocial: 'SNSでシェア',
    resetConfirm: '{league}の全球場のレベルをリセットしますか？',
    generating: '作成中…',
    genFailed: '作成に失敗しました：',

    pickerTitle: 'レベルを選択',
    pickerCancel: 'キャンセル',

    shareModalTitle: '成績をシェア',
    sharePreviewAlt: 'シェア画像プレビュー',
    shareToLabel: 'シェア先',
    shareSelfLabel: 'またはコピー・保存',
    shareDownload: '⬇️ PNG保存',
    shareNative: '📱 端末でシェア',
    shareCopyImg: '📋 画像をコピー',
    shareCopyImgNA: '📋 画像をコピー（非対応）',
    shareCopyText: '📝 テキストをコピー',
    shareCopied: '✅ コピーしました',
    shareCopyFailed: 'コピーできませんでした（ブラウザの制限の可能性）',
    shareHint: '一部のプラットフォームは画像を直接添付できません。先に「画像をコピー」または「PNG保存」してから投稿に貼り付けてください。',
    shareText: '{title}で {score} / {max} 点、{visited} / {total} 球場をアンロック！⚾️ あなたも→ {url}',
    shareStatsLine: '{v} / {t} 球場をアンロック・残り {r} 球場',
    shareCta: 'あなたも球場マップを点けてみよう ⚾️ {url}',

    close: '閉じる',
    footerAbout: 'このツールについて',
    footerPrivacy: 'プライバシー',
    aboutTitle: 'このツールについて',
    privacyTitle: 'プライバシーポリシー',
  },
};
