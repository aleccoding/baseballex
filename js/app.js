import { LEVELS, DEFAULT_LEVEL } from '../data/levels.js';
import { LEAGUES, DEFAULT_LEAGUE } from '../data/leagues.js';
import { renderMap, renderMapStatic, updateMapPin, reorderMapPins } from './map.js';
import { t, loc, getLocale, setLocale } from './i18n.js';

const $ = (sel) => document.querySelector(sel);

// ---------- 狀態（多聯盟） ----------
const state = {
  activeLeague: DEFAULT_LEAGUE,
  byLeague: {
    cpbl: { levels: {} },
    npb:  { levels: {} },
  },
};
let pickerStadiumId = null;

// 當前聯盟 helpers
const getLeague = ()   => LEAGUES[state.activeLeague];
const getLevels = ()   => state.byLeague[state.activeLeague].levels;
const getStadiums = () => getLeague().stadiums;
const getTeams = ()    => getLeague().teams;

// ---------- localStorage ----------
function loadState() {
  for (const lgKey of Object.keys(LEAGUES)) {
    const league = LEAGUES[lgKey];
    try {
      const raw = localStorage.getItem(league.storageKey);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') continue;
      const validIds = new Set(league.stadiums.map((s) => s.id));
      const validLevels = new Set(LEVELS.map((lv) => lv.id));
      const target = state.byLeague[lgKey].levels;
      for (const [id, lv] of Object.entries(parsed)) {
        const n = Number(lv);
        if (validIds.has(id) && validLevels.has(n) && n !== DEFAULT_LEVEL) {
          target[id] = n;
        }
      }
    } catch (err) {
      console.warn(`localStorage load failed (${lgKey}):`, err);
    }
  }
}

function saveCurrentLeague() {
  const league = getLeague();
  const levels = getLevels();
  try {
    if (Object.keys(levels).length === 0) {
      localStorage.removeItem(league.storageKey);
    } else {
      localStorage.setItem(league.storageKey, JSON.stringify(levels));
    }
  } catch (err) {
    console.warn('localStorage save failed:', err);
  }
}

// ---------- Card / Map data helpers ----------
function teamChip(teamId, { small = false } = {}) {
  const team = getTeams()[teamId];
  if (!team) return '';
  const name = loc(team, 'name');
  if (small) {
    return `<span class="team-chip team-chip--small" style="--chip-bg:${team.color}" title="${name}"></span>`;
  }
  return `<span class="team-chip" style="--chip-bg:${team.color}; --chip-fg:${team.textColor}">${name}</span>`;
}

function cardClasses(s) {
  const cls = ['card'];
  if (s.isShared) cls.push('card--shared');
  else if (s.homeTeams.length === 0) cls.push('card--secondary');
  return cls.join(' ');
}

function cardBandColor(s) {
  if (s.isShared) return null;
  if (s.homeTeams.length > 0) return getTeams()[s.homeTeams[0]].color;
  return null;
}

// 球場位置文字（中職用 city · district、日職用 prefecture · city）
function locationText(s) {
  if (s.prefecture) return `${loc(s, 'prefecture')} · ${loc(s, 'city')}`;
  return `${loc(s, 'city')} · ${loc(s, 'district')}`;
}

// ---------- Legend ----------
function renderLegend() {
  $('#legend-list').innerHTML = LEVELS.map((lv) => `
    <li class="legend__item">
      <span class="legend__dot" style="--swatch: ${lv.color}"></span>
      <span>L${lv.id} ${loc(lv, 'label')}</span>
    </li>
  `).join('');
}

// ---------- Cards ----------
function renderCard(s) {
  const levels = getLevels();
  const level = levels[s.id] ?? DEFAULT_LEVEL;
  const lv = LEVELS[level];
  const band = cardBandColor(s);

  const homeTeamHtml = s.isShared
    ? `<span class="card__teams">
         <span class="team-chip" style="--chip-bg:#fff5d1; --chip-fg:#1a1d24">${t('chipShared')}</span>
       </span>`
    : s.homeTeams.length > 0
      ? `<span class="card__teams">${s.homeTeams.map((id) => teamChip(id)).join('')}</span>`
      : `<span class="card__teams">
           <span class="team-chip" style="--chip-bg:#eee; --chip-fg:#666">${t('chipSecondary')}</span>
           ${(s.secondaryHomeTeams || []).map((id) => teamChip(id, { small: true })).join('')}
         </span>`;

  return `
    <li>
      <button type="button" class="${cardClasses(s)}"
              data-level="${level}"
              data-id="${s.id}"
              ${band ? `style="--card-band-color:${band}"` : ''}>
        <div class="card__head">
          <h3 class="card__title">${loc(s, 'name')}</h3>
          <div class="card__loc">${locationText(s)}</div>
        </div>
        ${homeTeamHtml}
        <p class="card__note">${loc(s, 'note')}</p>
        <div class="card__meta">${t('cardMeta', { year: s.year, cap: s.capacity.toLocaleString() })}</div>
        <span class="card__level" style="--swatch:${lv.color}">
          L${lv.id} ${loc(lv, 'short')}
        </span>
      </button>
    </li>
  `;
}

function renderCards() {
  $('#card-grid').innerHTML = getStadiums().map(renderCard).join('');
}

// ---------- Apply level ----------
function applyLevel(stadiumId, levelId) {
  const levels = getLevels();
  // L0 = 預設值，從 state 移除以保持儲存內容精簡
  if (levelId === DEFAULT_LEVEL) {
    delete levels[stadiumId];
  } else {
    levels[stadiumId] = levelId;
  }
  updateCard(stadiumId);
  const mapStack = document.querySelector('.tw-map-stack');
  if (mapStack) {
    updateMapPin(mapStack, getLeague(), stadiumId, levelId);
    reorderMapPins(mapStack, levels);
  }
  renderStats();
  saveCurrentLeague();
  invalidateShareCache();
}

function updateCard(stadiumId) {
  const card = $(`.card[data-id="${stadiumId}"]`);
  if (!card) return;
  const levelId = getLevels()[stadiumId] ?? DEFAULT_LEVEL;
  const lv = LEVELS[levelId];
  card.dataset.level = String(levelId);
  const badge = card.querySelector('.card__level');
  if (badge) {
    badge.style.setProperty('--swatch', lv.color);
    badge.innerHTML = `L${lv.id} ${loc(lv, 'short')}`;
  }
}

// ---------- Level picker (dialog) ----------
function openLevelPicker(stadiumId) {
  const stadium = getStadiums().find((s) => s.id === stadiumId);
  if (!stadium) return;
  pickerStadiumId = stadiumId;
  $('#level-picker-title').textContent = loc(stadium, 'name');

  const current = getLevels()[stadiumId] ?? DEFAULT_LEVEL;
  $('#level-picker-list').innerHTML = LEVELS.map((lv) => `
    <li class="level-picker__item">
      <button type="button" data-lv="${lv.id}" ${lv.id === current ? 'aria-current="true"' : ''}>
        <span class="level-picker__swatch" style="--swatch:${lv.color}"></span>
        <span class="level-picker__text">L${lv.id} ${loc(lv, 'label')}</span>
      </button>
    </li>
  `).join('');

  const dialog = $('#level-picker');
  dialog.showModal();
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
  const stadiums = getStadiums();
  const levels = getLevels();
  const items = [...LEVELS].reverse().map((lv) => {
    const count = stadiums.filter((s) => (levels[s.id] ?? 0) === lv.id).length;
    return `
      <li class="map-side__item">
        <span class="map-side__dot" style="--swatch:${lv.color}"></span>
        <span class="map-side__lv">L${lv.id}</span>
        <span class="map-side__count" data-zero="${count === 0 ? 1 : 0}">${t('distCount', { n: count })}</span>
      </li>
    `;
  }).join('');
  side.innerHTML = `
    <div class="map-side__title">${t('distTitle')}</div>
    <ul class="map-side__list">${items}</ul>
  `;
}

// ---------- Stats ----------
function getStateScore() {
  const stadiums = getStadiums();
  const levels = getLevels();
  return stadiums.reduce((sum, s) => sum + (levels[s.id] ?? 0), 0);
}
function getVisitedCount() {
  const stadiums = getStadiums();
  const levels = getLevels();
  return stadiums.filter((s) => (levels[s.id] ?? 0) > 0).length;
}
function getMaxScore() {
  return getStadiums().length * 5;
}
function getStadiumCount() {
  return getStadiums().length;
}

function renderStats() {
  const visited = getVisitedCount();
  const score = getStateScore();
  $('#hero-stats').innerHTML = t('statsLine', {
    v: `<span class="stats__num" id="stats-visited">${visited}</span>`,
    t: `<span id="stats-total">${getStadiumCount()}</span>`,
  });
  $('#score-num').textContent = String(score);
  $('#score-max').textContent = `/ ${getMaxScore()}`;
  const noData = visited === 0;
  $('#btn-share').disabled = noData;
  $('#btn-social').disabled = noData;
  renderLevelDistribution();
}

// ---------- Hero（標題 / 副標題 隨聯盟 + 語系更新） ----------
function renderHero() {
  const league = getLeague();
  const title = loc(league, 'fullTitle');
  const season = loc(league, 'season');
  $('#hero-title-text').textContent = title;
  $('#hero-subtitle').textContent = t('heroSubtitle', { season, n: league.stadiums.length });
  document.title = t('docTitle', { title, season });

  // tab 狀態 + 文字（語系）
  document.querySelectorAll('.league-tab').forEach((btn) => {
    const isActive = btn.dataset.league === state.activeLeague;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
    const lg = LEAGUES[btn.dataset.league];
    btn.textContent = `${lg.flag} ${loc(lg, 'shortName')}`;
  });
}

// ---------- 靜態文字（data-i18n / data-locale） ----------
function applyStaticText() {
  document.documentElement.lang = t('htmlLang');
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute('content', t('metaDescription'));

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  // 雙語內容區塊（About / 隱私 / credit）
  document.querySelectorAll('[data-locale]').forEach((el) => {
    el.hidden = el.dataset.locale !== getLocale();
  });
  // 語言切換鈕顯示「可切換到的語言」
  $('#lang-toggle').textContent = `🌐 ${t('langToggleLabel')}`;
  $('#league-tabs').setAttribute('aria-label', t('tabAriaLabel'));
  $('#share-preview-img').setAttribute('alt', t('sharePreviewAlt'));
}

// ---------- Share image (html2canvas) ----------
async function loadHtml2Canvas() {
  if (window.html2canvas) return window.html2canvas;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
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
let previewObjectUrl = null;

function invalidateShareCache() {
  cachedBlob = null;
  cachedKey = null;
}

// 分享圖上顯示的短網址（無協定）與文字訊息用的完整網址
function siteDisplayUrl() {
  return `${window.location.host}${window.location.pathname}`.replace(/\/$/, '');
}

function buildShareText() {
  return t('shareText', {
    title: loc(getLeague(), 'fullTitle'),
    score: getStateScore(),
    max: getMaxScore(),
    visited: getVisitedCount(),
    total: getStadiumCount(),
    url: window.location.href,
  });
}

// 分享圖清單：依地理分區（由北到南）分組，塞進 4 欄
// 只有色環點 + 球場名——看的人不需要懂等級規則，有顏色 = 去過
function buildShareLegend(league, levels) {
  const blocks = (league.regions || []).map((rg) => {
    const items = league.stadiums.filter((s) => s.region === rg.id);
    return items.length ? { rg, items, lines: items.length + 1 } : null;
  }).filter(Boolean);

  // 依序裝欄，每欄行數盡量平均（保持由北到南的閱讀順序）
  const COLS = 4;
  const totalLines = blocks.reduce((sum, b) => sum + b.lines, 0);
  const target = Math.ceil(totalLines / COLS);
  const cols = [[]];
  let curLines = 0;
  for (const b of blocks) {
    if (curLines > 0 && curLines + b.lines > target + 1 && cols.length < COLS) {
      cols.push([]);
      curLines = 0;
    }
    cols[cols.length - 1].push(b);
    curLines += b.lines;
  }

  return cols.map((col) => `
    <div class="share-view__legend-col">
      ${col.map((b) => `
        <div class="share-view__legend-region">
          <div class="share-view__legend-region-name">${loc(b.rg, 'name')}</div>
          ${b.items.map((s) => {
            const lv = LEVELS[levels[s.id] ?? 0];
            return `
              <div class="share-view__legend-item" data-lv="${lv.id}">
                <span class="share-view__legend-dot" style="--swatch:${lv.color}"></span>
                <span>${loc(s, 'shortName')}</span>
              </div>`;
          }).join('')}
        </div>`).join('')}
    </div>`).join('');
}

async function generateShareBlob() {
  const league = getLeague();
  const levels = getLevels();
  // cache key 含聯盟 + 語系，切換後需重新產生
  const key = getLocale() + ':' + state.activeLeague + ':' + JSON.stringify(levels);
  if (cachedKey === key && cachedBlob) return cachedBlob;

  // 同步當前狀態到 share view
  $('#share-title').textContent = `⚾️ ${loc(league, 'fullTitle')}`;
  $('#share-subtitle').textContent = t('heroSubtitle', { season: loc(league, 'season'), n: league.stadiums.length });
  $('#share-score-num').textContent = String(getStateScore());
  $('#share-score-max').textContent = `/ ${getMaxScore()}`;
  $('#share-visited-line').innerHTML = t('shareStatsLine', {
    v: `<span id="share-visited">${getVisitedCount()}</span>`,
    t: `<span id="share-visited-total">${getStadiumCount()}</span>`,
    r: getStadiumCount() - getVisitedCount(),
  });

  const mapHtml = await renderMapStatic(league, levels);
  $('#share-map').innerHTML = mapHtml;
  const shareSvg = $('#share-map .tw-map');
  if (shareSvg) {
    shareSvg.style.setProperty('--pin-scale', '1');
    shareSvg.style.setProperty('--label-fs', '5');
  }

  $('#share-legend').innerHTML = buildShareLegend(league, levels);
  $('#share-foot').textContent = t('shareCta', { url: siteDisplayUrl() });

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
  btn.textContent = t('generating');
  try {
    const blob = await generateShareBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.activeLeague}-stadium-${getStateScore()}_${new Date().toISOString().slice(0, 10)}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error(err);
    alert(t('genFailed') + (err?.message || err));
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
  btn.textContent = t('generating');
  try {
    const blob = await generateShareBlob();
    const text = buildShareText();

    // 保留 object URL 直到下次產生才 revoke：
    // 立刻 revoke 的話，下次 html2canvas 複製文件時，複製體裡的 img
    // 仍指向已失效的 blob URL，會噴 ERR_FILE_NOT_FOUND
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = URL.createObjectURL(blob);
    $('#share-preview-img').src = previewObjectUrl;

    $('#share-text').textContent = text;
    setupSocialButtons(text, blob);

    $('#share-modal').showModal();
  } catch (err) {
    console.error(err);
    alert(t('genFailed') + (err?.message || err));
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

function setupSocialButtons(text, blob) {
  // 注意：不可命名為 t，會遮蔽 i18n 的 t()
  const encText = encodeURIComponent(text);
  const encUrl = encodeURIComponent(window.location.href);

  // 文字訊息本身已含網址（buildShareText），X 不再另帶 url 參數避免重複
  $('#share-line').href    = `https://line.me/R/share?text=${encText}`;
  $('#share-x').href       = `https://twitter.com/intent/tweet?text=${encText}`;
  $('#share-threads').href = `https://www.threads.net/intent/post?text=${encText}`;
  $('#share-fb').href      = `https://www.facebook.com/sharer/sharer.php?u=${encUrl}`;

  const nativeBtn = $('#share-native');
  const file = new File([blob], `${state.activeLeague}-share.png`, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    nativeBtn.hidden = false;
    nativeBtn.onclick = async () => {
      try {
        await navigator.share({
          title: loc(getLeague(), 'fullTitle'),
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

  const copyImgBtn = $('#share-copy');
  if (navigator.clipboard?.write && window.ClipboardItem) {
    copyImgBtn.disabled = false;
    copyImgBtn.onclick = async () => {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        copyImgBtn.textContent = t('shareCopied');
        setTimeout(() => { copyImgBtn.textContent = t('shareCopyImg'); }, 1800);
      } catch (err) {
        console.error(err);
        alert(t('shareCopyFailed'));
      }
    };
  } else {
    copyImgBtn.disabled = true;
    copyImgBtn.textContent = t('shareCopyImgNA');
  }

  $('#share-copy-text').onclick = async () => {
    try {
      await navigator.clipboard.writeText(text);
      const b = $('#share-copy-text');
      b.textContent = t('shareCopied');
      setTimeout(() => { b.textContent = t('shareCopyText'); }, 1800);
    } catch (err) {
      console.error(err);
    }
  };
}

// ---------- Reset ----------
function resetAll() {
  const levels = getLevels();
  if (Object.keys(levels).length === 0) return;
  if (!confirm(t('resetConfirm', { league: loc(getLeague(), 'shortName') }))) return;
  state.byLeague[state.activeLeague].levels = {};
  const mapStack = document.querySelector('.tw-map-stack');
  getStadiums().forEach((s) => {
    updateCard(s.id);
    if (mapStack) updateMapPin(mapStack, getLeague(), s.id, DEFAULT_LEVEL);
  });
  renderStats();
  saveCurrentLeague();
  invalidateShareCache();
}

// ---------- 重新渲染（聯盟或語系切換共用） ----------
function renderMapAsync() {
  renderMap($('#map-wrap'), getLeague(), getLevels())
    .then(() => bindMapPinClicks())
    .catch((err) => {
      console.error('renderMap failed:', err);
      $('#map-wrap').innerHTML = `<div class="map-placeholder">${t('mapLoadFailed')}</div>`;
    });
}

function renderAll() {
  renderHero();
  renderLegend();
  renderCards();
  renderStats();
  renderMapAsync();
}

// ---------- League switching ----------
function switchLeague(leagueId) {
  if (!LEAGUES[leagueId]) return;
  if (state.activeLeague === leagueId) return;
  state.activeLeague = leagueId;
  invalidateShareCache();
  renderAll();
}

// ---------- Locale switching ----------
function switchLocale(l) {
  if (l === getLocale()) return;
  setLocale(l);
  invalidateShareCache();
  applyStaticText();
  renderAll();
}

// 地圖 pin 點擊 → 開等級選擇器（每次 renderMap 後須重新綁，因為 SVG 被換掉了）
function bindMapPinClicks() {
  const stack = document.querySelector('.tw-map-stack');
  if (!stack) return;
  stack.addEventListener('click', (e) => {
    const pin = e.target.closest('.tw-map__pin[data-id]');
    if (pin) openLevelPicker(pin.dataset.id);
  });
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

  // 聯盟頁籤
  $('#league-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.league-tab[data-league]');
    if (btn) switchLeague(btn.dataset.league);
  });

  // 語言切換（zh ↔ ja）
  $('#lang-toggle').addEventListener('click', () => {
    switchLocale(getLocale() === 'ja' ? 'zh' : 'ja');
  });

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
loadState();
applyStaticText();   // 依語系套用靜態文字（初次進站依 navigator.language 自動偵測）
bindEvents();
renderAll();
