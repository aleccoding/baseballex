# 中華職棒球場制霸等級 ⚾

紀錄你進過的中華職棒一軍球場，產生分享圖到社群媒體。  
靈感來自 [日本制縣等級](https://zhung.com.tw/project/japanex/)。

## 功能

- 11 座 2026 中職一軍主場與準主場
- 6 級制霸等級（從未踏入 → 看過特別賽事）
- 互動式台灣地圖：拖拉 / 縮放 / 19 縣市標籤自動避讓
- 卡片或地圖 pin 雙路徑點選等級
- 進度自動儲存到 localStorage
- 一鍵產生 1080×1350 分享圖
- 多平台分享：LINE、X、Threads、Facebook、Web Share、剪貼簿

## 技術

- 純 HTML / CSS / 原生 JS（ES Modules）
- SVG 地圖：g0v 縣市 GeoJSON 簡化版（Douglas-Peucker 至 1957 點）
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
│   ├── stadiums.js          # 球場、球團、等級資料
│   └── taiwan-outline.json  # 台灣縣市輪廓
└── js/
    ├── app.js               # 應用主邏輯
    └── map.js               # SVG 地圖渲染與互動
```

## License

MIT
