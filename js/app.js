import { STADIUMS, TEAMS, LEVELS, DEFAULT_LEVEL } from '../data/stadiums.js';
import { renderMap, renderMapStatic, updateMapPin, reorderMapPins } from './map.js';

const $ = (sel) => document.querySelector(sel);

// ---------- 狀態 ----------
const state = {
  levels: {}, // { stadiumId: levelId }
};
let pickerStadiumId = null;

// ---------- localStorage ----------
const STORAGE_KEY = 'baseballex_levels_v1';

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;
    // 只保留合法的 stadiumId 與 levelId（避免舊資料或被竄改）
    const validIds = new Set(STADIUMS.map((s) => s.id));
    const validLevels = new Set(LEVELS.map((lv) => lv.id));
    for (const [id, lv] of Object.entries(parsed)) {
      const n = Number(lv);
      if (validIds.has(id) && validLevels.has(n) && n !== DEFAULT_LEVEL) {
        state.levels[id] = n;
      }
    }
  } catch (err) {
    console.warn('localStorage load failed:', err);
  }
}

function saveState() {
  try {
    if (Object.keys(state.levels).length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.levels));
    }
  } catch (err) {
    // 配額爆掉、隱私模式等情況靜默處理（功能上不影響當下使用）
    console.warn('localStorage save failed:', err);
  }
}

// ---------- Card / Map data helpers ----------
function teamChip(teamId, { small = false } = {}) {
  const t = TEAMS[teamId];
  if (!t) return '';
  if (small) {
    return `<span class="team-chip team-chip--small" style="--chip-bg:${t.color}" title="${t.name}"></span>`;
  }
  return `<span class="team-chip" style="--chip-bg:${t.color}; --chip-fg:${t.textColor}">${t.name}</span>`;
}

function cardClasses(s) {
  const cls = ['card'];
  if (s.isShared) cls.push('card--shared');
  else if (s.homeTeams.length === 0) cls.push('card--secondary');
  return cls.join(' ');
}

function cardBandColor(s) {
  if (s.isShared) return null;
  if (s.homeTeams.length > 0) return TEAMS[s.homeTeams[0]].color;
  return null;
}

// ---------- Legend ----------
function renderLegend() {
  $('#legend-list').innerHTML = LEVELS.map((lv) => `
    <li class="legend__item">
      <span class="legend__dot" style="--swatch: ${lv.color}"></span>
      <span>L${lv.id} ${lv.label}</span>
    </li>
  `).join('');
}

// ---------- Cards ----------
function renderCard(s) {
  const level = state.levels[s.id] ?? DEFAULT_LEVEL;
  const lv = LEVELS[level];
  const band = cardBandColor(s);

  const homeTeamHtml = s.isShared
    ? `<span class="card__teams">
         <span class="team-chip" style="--chip-bg:#fff5d1; --chip-fg:#1a1d24">六隊共用</span>
       </span>`
    : s.homeTeams.length > 0
      ? `<span class="card__teams">${s.homeTeams.map((t) => teamChip(t)).join('')}</span>`
      : `<span class="card__teams">
           <span class="team-chip" style="--chip-bg:#eee; --chip-fg:#666">移地賽</span>
           ${s.secondaryHomeTeams.map((t) => teamChip(t, { small: true })).join('')}
         </span>`;

  return `
    <li>
      <button type="button" class="${cardClasses(s)}"
              data-level="${level}"
              data-id="${s.id}"
              ${band ? `style="--card-band-color:${band}"` : ''}>
        <div class="card__head">
          <h3 class="card__title">${s.name}</h3>
          <div class="card__loc">${s.city} · ${s.district}</div>
        </div>
        ${homeTeamHtml}
        <p class="card__note">${s.note}</p>
        <div class="card__meta">${s.year} 啟用 · 容納 ${s.capacity.toLocaleString()}</div>
        <span class="card__level" style="background:${lv.color}; color:#1a1d24">
          L${lv.id} ${lv.short}
        </span>
      </button>
    </li>
  `;
}

function renderCards() {
  $('#card-grid').innerHTML = STADIUMS.map(renderCard).join('');
}

// ---------- Apply level (single source of truth) ----------
function applyLevel(stadiumId, levelId) {
  // L0 = 預設值，從 state 移除以保持儲存內容精簡
  if (levelId === DEFAULT_LEVEL) {
    delete state.levels[stadiumId];
  } else {
    state.levels[stadiumId] = levelId;
  }
  updateCard(stadiumId);
  const mapStack = document.querySelector('.tw-map-stack');
  if (mapStack) {
    updateMapPin(mapStack, stadiumId, levelId);
    reorderMapPins(mapStack, state.levels);
  }
  renderStats();
  saveState();
  invalidateShareCache();
}

function updateCard(stadiumId) {
  const card = $(`.card[data-id="${stadiumId}"]`);
  if (!card) return;
  const levelId = state.levels[stadiumId] ?? DEFAULT_LEVEL;
  const lv = LEVELS[levelId];
  card.dataset.level = String(levelId);
  const badge = card.querySelector('.card__level');
  if (badge) {
    badge.style.background = lv.color;
    badge.innerHTML = `L${lv.id} ${lv.short}`;
  }
}

// ---------- Level picker (dialog) ----------
function openLevelPicker(stadiumId) {
  const stadium = STADIUMS.find((s) => s.id === stadiumId);
  if (!stadium) return;
  pickerStadiumId = stadiumId;
  $('#level-picker-title').textContent = stadium.name;

  const current = state.levels[stadiumId] ?? DEFAULT_LEVEL;
  $('#level-picker-list').innerHTML = LEVELS.map((lv) => `
    <li class="level-picker__item">
      <button type="button" data-lv="${lv.id}" ${lv.id === current ? 'aria-current="true"' : ''}>
        <span class="level-picker__swatch" style="background:${lv.color}"></span>
        <span class="level-picker__text">L${lv.id} ${lv.label}</span>
      </button>
    </li>
  `).join('');

  const dialog = $('#level-picker');
  dialog.showModal();
  // 聚焦目前選項，方便鍵盤操作
  const focused = $('#level-picker-list').querySelector('button[aria-current="true"]') ||
                  $('#level-picker-list').querySelector('button');
  if (focused) focused.focus();
}

function closeLevelPicker() {
  pickerStadiumId = null;
  $('#level-picker').close();
}

// ---------- 等級分布側邊面板 ----------
function renderLevelDistribution() {
  const side = $('#map-side');
  if (!side) return;
  // 從高等級到低等級顯示
  const items = [...LEVELS].reverse().map((lv) => {
    const count = STADIUMS.filter((s) => (state.levels[s.id] ?? 0) === lv.id).length;
    return `
      <li class="map-side__item">
        <span class="map-side__dot" style="background:${lv.color}"></span>
        <span class="map-side__lv">L${lv.id}</span>
        <span class="map-side__count" data-zero="${count === 0 ? 1 : 0}">${count} 座</span>
      </li>
    `;
  }).join('');
  side.innerHTML = `
    <div class="map-side__title">等級分布</div>
    <ul class="map-side__list">${items}</ul>
  `;
}

// ---------- Stats ----------
function renderStats() {
  const visited = STADIUMS.filter((s) => (state.levels[s.id] ?? 0) > 0).length;
  // 制霸等級分數 = 各球場等級總和（最高 11 × 5 = 55）
  const score = STADIUMS.reduce((sum, s) => sum + (state.levels[s.id] ?? 0), 0);
  $('#stats-visited').textContent = String(visited);
  $('#score-num').textContent = String(score);
  const noData = visited === 0;
  $('#btn-share').disabled = noData;
  $('#btn-social').disabled = noData;
  renderLevelDistribution();
}

// ---------- Share image (html2canvas) ----------
async function loadHtml2Canvas() {
  if (window.html2canvas) return window.html2canvas;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    // 本地化避免 CDN 風險（被劫持/竄改/離線無法用）
    s.src = './js/vendor/html2canvas.min.js';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return window.html2canvas;
}

// 圖片快取（同樣狀態不重複產生）
let cachedBlob = null;
let cachedKey = null;

function invalidateShareCache() {
  cachedBlob = null;
  cachedKey = null;
}

function getStateScore() {
  return STADIUMS.reduce((sum, s) => sum + (state.levels[s.id] ?? 0), 0);
}
function getVisitedCount() {
  return STADIUMS.filter((s) => (state.levels[s.id] ?? 0) > 0).length;
}
function buildShareText() {
  const score = getStateScore();
  const visited = getVisitedCount();
  return `我在中華職棒球場制霸等級拿到 ${score} / 55 分，進過 ${visited} / 11 座一軍球場！⚾`;
}

async function generateShareBlob() {
  const key = JSON.stringify(state.levels);
  if (cachedKey === key && cachedBlob) return cachedBlob;

  // 同步當前狀態到 share view
  $('#share-score-num').textContent = String(getStateScore());
  $('#share-visited').textContent = String(getVisitedCount());

  const mapHtml = await renderMapStatic(state.levels);
  $('#share-map').innerHTML = mapHtml;
  const shareSvg = $('#share-map .tw-map');
  if (shareSvg) {
    shareSvg.style.setProperty('--pin-scale', '1');
    shareSvg.style.setProperty('--label-fs', '5');
  }

  $('#share-legend').innerHTML = STADIUMS.map((s) => {
    const lv = LEVELS[state.levels[s.id] ?? 0];
    return `
      <div class="share-view__legend-item">
        <span class="share-view__legend-dot" style="background:${lv.color}"></span>
        <span>${s.shortName} L${lv.id}</span>
      </div>
    `;
  }).join('');

  await new Promise((r) => requestAnimationFrame(r));

  const html2canvas = await loadHtml2Canvas();
  const canvas = await html2canvas($('#share-view'), {
    width: 1080, height: 1350,
    windowWidth: 1080, windowHeight: 1350,
    scale: 2,
    useCORS: true,
    logging: false,
  });

  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, 'image/png')
  );

  cachedBlob = blob;
  cachedKey = key;
  return blob;
}

async function downloadShareImage() {
  const btn = $('#btn-share');
  if (btn.disabled) return;
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = '產生中…';
  try {
    const blob = await generateShareBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cpbl-stadium-${getStateScore()}_${new Date().toISOString().slice(0, 10)}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error(err);
    alert('產生失敗：' + (err?.message || err));
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

// ---------- Social share modal ----------
async function openSocialShare() {
  const btn = $('#btn-social');
  if (btn.disabled) return;
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = '產生中…';
  try {
    const blob = await generateShareBlob();
    const text = buildShareText();

    // 預覽圖
    const previewUrl = URL.createObjectURL(blob);
    const img = $('#share-preview-img');
    img.onload = () => URL.revokeObjectURL(previewUrl);
    img.src = previewUrl;

    $('#share-text').textContent = text;
    setupSocialButtons(text, blob);

    $('#share-modal').showModal();
  } catch (err) {
    console.error(err);
    alert('產生失敗：' + (err?.message || err));
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

function setupSocialButtons(text, blob) {
  const url = window.location.href;
  const t = encodeURIComponent(text);
  const u = encodeURIComponent(url);

  // 平台分享連結
  $('#share-line').href    = `https://line.me/R/share?text=${t}`;
  $('#share-x').href       = `https://twitter.com/intent/tweet?text=${t}&url=${u}`;
  $('#share-threads').href = `https://www.threads.net/intent/post?text=${t}`;
  $('#share-fb').href      = `https://www.facebook.com/sharer/sharer.php?u=${u}`;

  // Web Share API（手機系統分享，可帶圖）
  const nativeBtn = $('#share-native');
  const file = new File([blob], 'cpbl-share.png', { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    nativeBtn.hidden = false;
    nativeBtn.onclick = async () => {
      try {
        await navigator.share({
          title: '中華職棒球場制霸等級',
          text,
          files: [file],
        });
      } catch (err) {
        if (err.name !== 'AbortError') console.error(err);
      }
    };
  } else {
    nativeBtn.hidden = true;
  }

  // 複製圖片到剪貼簿
  const copyImgBtn = $('#share-copy');
  if (navigator.clipboard?.write && window.ClipboardItem) {
    copyImgBtn.disabled = false;
    copyImgBtn.onclick = async () => {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        copyImgBtn.textContent = '✅ 已複製';
        setTimeout(() => { copyImgBtn.textContent = '📋 複製圖片'; }, 1800);
      } catch (err) {
        console.error(err);
        alert('複製失敗，可能瀏覽器不允許');
      }
    };
  } else {
    copyImgBtn.disabled = true;
    copyImgBtn.textContent = '📋 複製圖片（不支援）';
  }

  // 複製文字
  $('#share-copy-text').onclick = async () => {
    try {
      await navigator.clipboard.writeText(text);
      const b = $('#share-copy-text');
      b.textContent = '✅ 已複製';
      setTimeout(() => { b.textContent = '📝 複製文字'; }, 1800);
    } catch (err) {
      console.error(err);
    }
  };
}

// ---------- Reset ----------
function resetAll() {
  if (Object.keys(state.levels).length === 0) return;
  if (!confirm('確定要重置所有球場等級嗎？')) return;
  state.levels = {};
  const mapStack = document.querySelector('.tw-map-stack');
  STADIUMS.forEach((s) => {
    updateCard(s.id);
    if (mapStack) updateMapPin(mapStack, s.id, DEFAULT_LEVEL);
  });
  renderStats();
  saveState();
  invalidateShareCache();
}

// ---------- Wire-up ----------
function bindEvents() {
  // 卡片點擊 → 開等級選擇器
  $('#card-grid').addEventListener('click', (e) => {
    const card = e.target.closest('.card[data-id]');
    if (card) openLevelPicker(card.dataset.id);
  });

  // 等級選擇器：選等級
  $('#level-picker-list').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-lv]');
    if (!btn || !pickerStadiumId) return;
    applyLevel(pickerStadiumId, parseInt(btn.dataset.lv, 10));
    closeLevelPicker();
  });

  // 等級選擇器：取消 / 點擊 backdrop
  $('#level-picker-close').addEventListener('click', closeLevelPicker);
  $('#level-picker').addEventListener('click', (e) => {
    if (e.target === $('#level-picker')) closeLevelPicker();
  });

  // 工具列
  $('#btn-reset').addEventListener('click', resetAll);
  $('#btn-share').addEventListener('click', downloadShareImage);
  $('#btn-social').addEventListener('click', openSocialShare);

  // Share modal 關閉
  $('#share-modal-close').addEventListener('click', () => $('#share-modal').close());
  $('#share-modal').addEventListener('click', (e) => {
    if (e.target === $('#share-modal')) $('#share-modal').close();
  });

  // 關於 / 隱私說明 modals
  $('#open-about').addEventListener('click', () => $('#about-modal').showModal());
  $('#about-close').addEventListener('click', () => $('#about-modal').close());
  $('#about-modal').addEventListener('click', (e) => {
    if (e.target === $('#about-modal')) $('#about-modal').close();
  });
  $('#open-privacy').addEventListener('click', () => $('#privacy-modal').showModal());
  $('#privacy-close').addEventListener('click', () => $('#privacy-modal').close());
  $('#privacy-modal').addEventListener('click', (e) => {
    if (e.target === $('#privacy-modal')) $('#privacy-modal').close();
  });
}

// ---------- Init ----------
loadState();          // 從 localStorage 載入上次紀錄（須在 render 之前）
renderLegend();
renderCards();        // card 會讀 state.levels 顯示等級
renderStats();        // 計分讀 state.levels
bindEvents();

// renderMap 接受 levels 參數，初始 pin 顏色就會反映已儲存的等級
renderMap($('#map-wrap'), state.levels)
  .then(() => {
    // 地圖 pin 點擊 → 開等級選擇器（在地圖載入後綁定）
    document.querySelector('.tw-map-stack').addEventListener('click', (e) => {
      const pin = e.target.closest('.tw-map__pin[data-id]');
      if (pin) openLevelPicker(pin.dataset.id);
    });
  })
  .catch((err) => {
    console.error('renderMap failed:', err);
    $('#map-wrap').innerHTML = '<div class="map-placeholder">地圖載入失敗</div>';
  });
