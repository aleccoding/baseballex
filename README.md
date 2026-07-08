# 棒球場制霸等級 ⚾

> 🌐 **Demo**: https://baseballex.aleccoding.com/

紀錄你進過的中華職棒（CPBL）與日本職棒（NPB）一軍球場，產生分享圖到社群媒體。
靈感來自 [日本制縣等級](https://zhung.com.tw/project/japanex/)。

## 功能

- 雙聯盟：中職 11 座 + 日職 20 座（12 主場 + 8 準主場），頁籤切換、進度各自獨立
- 6 級制霸等級（從未踏入 → 看過特別賽事），兩聯盟共用同一套等級
- 互動式 SVG 地圖（台灣縣市界 / 日本都道府縣界）：拖拉 / 縮放 / 標籤自動避讓
- 卡片或地圖 pin 雙路徑點選等級
- 進度自動儲存到 localStorage（中職與日職各自一把 key）
- 一鍵產生 1080×1350 分享圖
- 多平台分享：LINE、X、Threads、Facebook、Web Share、剪貼簿

## 技術

- 純 HTML / CSS / 原生 JS（ES Modules）
- SVG 地圖：g0v 縣市 GeoJSON、Natural Earth 都道府縣界（皆 Douglas-Peucker 簡化）
- html2canvas（lazy load）做畫面截圖
- 無後端、無建置、無 npm 依賴

## 本地執行

```bash
python3 -m http.server 8000
# 開 http://localhost:8000
```

ES Modules 不支援 `file://` 直接開啟，必須走 HTTP server。

## 結構

```
baseballex/
├── index.html
├── css/style.css
├── data/
│   ├── levels.js            # 共用等級定義
│   ├── leagues.js           # 聯盟設定（LEAGUES 集合）
│   ├── cpbl.js              # 中職球團 / 球場資料
│   ├── npb.js               # 日職球團 / 球場資料
│   ├── stadiums.js          # 相容 shim（re-export）
│   ├── taiwan-outline.json  # 台灣縣市輪廓
│   └── japan-outline.json   # 日本都道府縣輪廓（不含沖繩）
└── js/
    ├── app.js               # 應用主邏輯（多聯盟狀態、分享）
    └── map.js               # SVG 地圖渲染與互動（吃 league config）
```

## License

MIT
