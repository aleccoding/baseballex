// 站台設定：作者導流連結 + 流量統計
// 社群平台決定後，在 links 加一行即可全站生效（頁尾、About、分享圖 byline）

export const AUTHOR = {
  name: 'Alec',
  // 社群帳號決定後填入（顯示在分享圖 byline），例如 '@aleccoding'
  handle: '',
  // 主要個人連結（About 的「Alec」會連到第一個）
  links: [
    { label: 'GitHub', url: 'https://github.com/aleccoding' },
    // { label: 'Threads', url: 'https://www.threads.net/@xxx' },
    // { label: 'X',       url: 'https://x.com/xxx' },
    // { label: 'Instagram', url: 'https://www.instagram.com/xxx' },
  ],
};

// GoatCounter 代碼（如 'baseballex' → https://baseballex.goatcounter.com）
// 留空 = 完全不載入統計腳本
export const GOATCOUNTER_CODE = 'baseballex';
