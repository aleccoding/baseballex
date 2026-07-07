// 地圖 SVG 渲染 + 互動（拖拉平移 + 按鈕/滾輪縮放）
// 由呼叫端傳入 league config（含 bbox、stadiums、teams、outlinePath），
// 同一份程式可同時為中職、日職等聯盟渲染地圖。

import { LEVELS, DEFAULT_LEVEL } from '../data/levels.js';
import { t, loc } from './i18n.js';

// ---------- 投影 / VB / outline 快取 ----------
function bboxToVB(bbox) {
  return {
    w: Math.round((bbox.maxLng - bbox.minLng) * bbox.vbScale),
    h: Math.round((bbox.maxLat - bbox.minLat) * bbox.vbScale),
  };
}

function makeProjector(bbox, vb) {
  return (lat, lng) => {
    const x = ((lng - bbox.minLng) / (bbox.maxLng - bbox.minLng)) * vb.w;
    const y = ((bbox.maxLat - lat) / (bbox.maxLat - bbox.minLat)) * vb.h;
    return [x, y];
  };
}

// outline cache 以路徑為 key，不同聯盟分開快取
const outlineCaches = {};
async function loadOutline(path) {
  if (outlineCaches[path]) return outlineCaches[path];
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load outline: ${path}`);
  outlineCaches[path] = await res.json();
  return outlineCaches[path];
}

// 取得 outline 內的「區域」陣列。Taiwan 用 counties，Japan 用 prefectures
function getRegions(outline) {
  return outline.regions || outline.counties || outline.prefectures || [];
}

// ---------- 棒球 pin 設計 ----------
// G2 視覺：球永遠是白色棒球，等級用「色環 + 外圈光暈」表現
// 色環走 CSS 變數（--pin-ring / --pin-ring-w），光暈是兩層半透明 SVG 圓
// （html2canvas 畫不出 CSS glow，純 SVG 圓在分享圖也能完整渲染）
const PIN_RING_L0 = '#1a1d24';

function pinRingColor(levelId) {
  return levelId === DEFAULT_LEVEL ? PIN_RING_L0 : LEVELS[levelId].color;
}
function pinRingWidth(levelId) {
  return levelId === DEFAULT_LEVEL ? '1.6' : '2.4';
}
function pinGlowFill(levelId) {
  return levelId === DEFAULT_LEVEL ? 'none' : LEVELS[levelId].color;
}

// 棒球縫線：用程式沿著 seam 自動計算 stitches，保證對齊
const SEAM_LEFT_CTRL  = [[-2.5, -6.5], [-5.5, -3.5], [-5.5, 3.5], [-2.5, 6.5]];
const SEAM_RIGHT_CTRL = [[ 2.5, -6.5], [ 5.5, -3.5], [ 5.5, 3.5], [ 2.5, 6.5]];

function cubicPath(c) {
  return `M ${c[0][0]} ${c[0][1]} C ${c[1][0]} ${c[1][1]} ${c[2][0]} ${c[2][1]} ${c[3][0]} ${c[3][1]}`;
}

function buildStitches([p0, p1, p2, p3], count, halfLen, outwardSign) {
  const segs = [];
  for (let i = 0; i < count; i++) {
    const t = (i + 1) / (count + 1);
    const u = 1 - t;
    const x = u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0];
    const y = u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1];
    const tx = 3*u*u*(p1[0]-p0[0]) + 6*u*t*(p2[0]-p1[0]) + 3*t*t*(p3[0]-p2[0]);
    const ty = 3*u*u*(p1[1]-p0[1]) + 6*u*t*(p2[1]-p1[1]) + 3*t*t*(p3[1]-p2[1]);
    const mag = Math.hypot(tx, ty);
    let nx = -ty / mag;
    let ny =  tx / mag;
    if (Math.sign(nx) !== Math.sign(outwardSign)) { nx = -nx; ny = -ny; }
    const ix = (x - nx*halfLen).toFixed(2);
    const iy = (y - ny*halfLen).toFixed(2);
    const ox = (x + nx*halfLen).toFixed(2);
    const oy = (y + ny*halfLen).toFixed(2);
    segs.push(`M ${ix} ${iy} L ${ox} ${oy}`);
  }
  return segs.join(' ');
}

const SEAM_PATH_D = `${cubicPath(SEAM_LEFT_CTRL)} ${cubicPath(SEAM_RIGHT_CTRL)}`;
const STITCH_PATH_D = [
  buildStitches(SEAM_LEFT_CTRL,  5, 0.85, -1),
  buildStitches(SEAM_RIGHT_CTRL, 5, 0.85,  1),
].join(' ');

// ---------- 互動：拖拉 + 縮放 ----------
class MapInteractor {
  constructor(svg, vb) {
    this.svg = svg;
    this.initVB = { x: 0, y: 0, w: vb.w, h: vb.h };
    this.vb = { ...this.initVB };
    // 縮放範圍：1.0x（初始）~ 8.0x
    this.minVbW = this.initVB.w / 8;
    this.maxVbW = this.initVB.w;
    this.dragging = false;
    this.lastClient = null;
    this.bind();
  }

  apply() {
    const { x, y, w, h } = this.vb;
    this.svg.setAttribute('viewBox', `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`);
    const r = w / this.initVB.w;
    this.svg.style.setProperty('--label-fs', (r * 5).toFixed(2));
    this.svg.style.setProperty('--pin-scale', r.toFixed(3));
    this.updateLabelVisibility();
  }

  // 標籤太靠近 pin 時自動淡出。zoom 越大、threshold 越小，淡出的越少
  // 帶 data-force 屬性的標籤永遠顯示
  updateLabelVisibility() {
    if (!this.pinPositions) return;
    const labels = this.svg.querySelectorAll('.tw-map__label');
    if (!labels.length) return;
    const threshold = this.vb.w * 0.035;
    labels.forEach((label) => {
      if (label.dataset.force === '1') {
        label.style.opacity = '1';
        return;
      }
      const x = parseFloat(label.getAttribute('x'));
      const y = parseFloat(label.getAttribute('y'));
      let minDist = Infinity;
      for (const [px, py] of this.pinPositions) {
        const d = Math.hypot(x - px, y - py);
        if (d < minDist) minDist = d;
      }
      label.style.opacity = minDist < threshold ? '0' : '1';
    });
  }

  clamp() {
    if (this.vb.w > this.maxVbW) {
      const r = this.maxVbW / this.vb.w;
      this.vb.w *= r;
      this.vb.h *= r;
    }
    if (this.vb.w < this.minVbW) {
      const r = this.minVbW / this.vb.w;
      this.vb.w *= r;
      this.vb.h *= r;
    }
    const halfW = this.vb.w / 2;
    const halfH = this.vb.h / 2;
    const cx = this.vb.x + halfW;
    const cy = this.vb.y + halfH;
    if (cx < 0) this.vb.x = -halfW;
    if (cx > this.initVB.w) this.vb.x = this.initVB.w - halfW;
    if (cy < 0) this.vb.y = -halfH;
    if (cy > this.initVB.h) this.vb.y = this.initVB.h - halfH;
  }

  zoomBy(factor, cx, cy) {
    const newW = this.vb.w * factor;
    if (newW < this.minVbW || newW > this.maxVbW) return;
    this.vb.x = cx - (cx - this.vb.x) * factor;
    this.vb.y = cy - (cy - this.vb.y) * factor;
    this.vb.w = newW;
    this.vb.h = this.vb.h * factor;
    this.clamp();
    this.apply();
  }

  zoomCenter(factor) {
    this.zoomBy(factor, this.vb.x + this.vb.w / 2, this.vb.y + this.vb.h / 2);
  }

  panBy(dx, dy) {
    this.vb.x += dx;
    this.vb.y += dy;
    this.clamp();
    this.apply();
  }

  reset() {
    this.vb = { ...this.initVB };
    this.apply();
  }

  clientToVB(clientX, clientY) {
    const rect = this.svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * this.vb.w + this.vb.x;
    const y = ((clientY - rect.top) / rect.height) * this.vb.h + this.vb.y;
    return [x, y];
  }

  bind() {
    const onDown = (e) => {
      if (e.target.closest('.tw-map__pin')) return;
      this.dragging = true;
      this.lastClient = { x: e.clientX, y: e.clientY };
      this.svg.setPointerCapture(e.pointerId);
      this.svg.classList.add('is-panning');
    };
    const onMove = (e) => {
      if (!this.dragging) return;
      const rect = this.svg.getBoundingClientRect();
      const sx = this.vb.w / rect.width;
      const sy = this.vb.h / rect.height;
      const dx = (e.clientX - this.lastClient.x) * sx;
      const dy = (e.clientY - this.lastClient.y) * sy;
      this.lastClient = { x: e.clientX, y: e.clientY };
      this.panBy(-dx, -dy);
    };
    const onUp = (e) => {
      if (!this.dragging) return;
      this.dragging = false;
      try { this.svg.releasePointerCapture(e.pointerId); } catch {}
      this.svg.classList.remove('is-panning');
    };
    this.svg.addEventListener('pointerdown', onDown);
    this.svg.addEventListener('pointermove', onMove);
    this.svg.addEventListener('pointerup', onUp);
    this.svg.addEventListener('pointercancel', onUp);

    this.svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const [cx, cy] = this.clientToVB(e.clientX, e.clientY);
      const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      this.zoomBy(factor, cx, cy);
    }, { passive: false });
  }
}

// ---------- SVG 字串建構（共用） ----------
function buildSvg(outline, levels, league) {
  const { stadiums, teams, bbox } = league;
  const vb = bboxToVB(bbox);
  const project = makeProjector(bbox, vb);
  const regions = getRegions(outline);

  const ringToPath = (ring) => {
    const parts = [ring.outer, ...ring.holes].map((coords) =>
      coords
        .map(([lat, lng], i) => {
          const [x, y] = project(lat, lng);
          return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(' ') + 'Z'
    );
    return parts.join(' ');
  };

  const regionsHtml = regions
    .map((r) => r.rings
      .map((ring) => `<path class="tw-map__county" data-name="${r.name}" fill-rule="evenodd" d="${ringToPath(ring)}"/>`)
      .join('')
    )
    .join('');

  const labelsHtml = regions
    .filter((r) => r.label)
    .map((r) => {
      const [x, y] = project(r.label[0], r.label[1]);
      const force = r.forceShow ? ' data-force="1"' : '';
      return `<text class="tw-map__label"${force} x="${x.toFixed(1)}" y="${y.toFixed(1)}">${r.displayName || r.name}</text>`;
    })
    .join('');

  // 按等級升序排序，讓高等級的 pin 後渲染（在 SVG 畫面上層）
  const sortedStadiums = [...stadiums].sort((a, b) => {
    const la = levels[a.id] ?? DEFAULT_LEVEL;
    const lb = levels[b.id] ?? DEFAULT_LEVEL;
    return la - lb;
  });

  // 用 aria-label 而非 <title>：互動版有自訂 hover tooltip，避免原生 tooltip 重複跳出
  const pinsHtml = sortedStadiums.map((s) => {
    const [x, y] = project(s.lat, s.lng);
    const lv = levels[s.id] ?? DEFAULT_LEVEL;
    return `
      <g class="tw-map__pin" data-id="${s.id}" data-level="${lv}" role="img"
         aria-label="${loc(s, 'name')}（${loc(LEVELS[lv], 'label')}）"
         style="--pin-ring:${pinRingColor(lv)}; --pin-ring-w:${pinRingWidth(lv)}"
         transform="translate(${x.toFixed(2)} ${y.toFixed(2)})">
        <g class="tw-map__pin-scale">
          <circle class="tw-map__pin-glow tw-map__pin-glow--outer" r="13" fill="${pinGlowFill(lv)}" opacity="0.14"/>
          <circle class="tw-map__pin-glow tw-map__pin-glow--inner" r="11" fill="${pinGlowFill(lv)}" opacity="0.28"/>
          <circle class="tw-map__pin-ball" r="8" fill="#ffffff"/>
          <path class="tw-map__pin-halo"     d="${SEAM_PATH_D} ${STITCH_PATH_D}"/>
          <path class="tw-map__pin-seam"     d="${SEAM_PATH_D}"/>
          <path class="tw-map__pin-stitches" d="${STITCH_PATH_D}"/>
        </g>
      </g>
    `;
  }).join('');

  return `
    <svg class="tw-map" viewBox="0 0 ${vb.w} ${vb.h}"
         xmlns="http://www.w3.org/2000/svg"
         role="img" aria-label="${t('mapAriaLabel', { league: loc(league, 'name') })}">
      <rect width="100%" height="100%" class="tw-map__sea"/>
      <g class="tw-map__counties">${regionsHtml}</g>
      <g class="tw-map__pins">${pinsHtml}</g>
      <g class="tw-map__labels">${labelsHtml}</g>
    </svg>
  `;
}

// ---------- Hover tooltip（桌機限定：有滑鼠的裝置才綁定） ----------
const HOVER_CAPABLE = window.matchMedia('(hover: hover) and (pointer: fine)');

function tooltipHtml(stadium, levelId, league) {
  const lv = LEVELS[levelId];
  const locText = stadium.prefecture
    ? `${loc(stadium, 'prefecture')}・${loc(stadium, 'city')}`
    : `${loc(stadium, 'city')}・${loc(stadium, 'district')}`;
  let teamsText;
  if (stadium.isShared) {
    teamsText = t('chipShared');
  } else {
    const ids = stadium.homeTeams.length > 0 ? stadium.homeTeams : (stadium.secondaryHomeTeams || []);
    teamsText = ids.map((id) => loc(league.teams[id], 'name')).join('・');
    if (stadium.homeTeams.length === 0) teamsText = `${t('chipSecondary')}：${teamsText}`;
  }
  return `
    <div class="map-tooltip__head">
      <span class="map-tooltip__name">${loc(stadium, 'name')}</span>
      <span class="map-tooltip__level">
        <span class="map-tooltip__dot" style="--swatch:${lv.color}"></span>L${lv.id} ${loc(lv, 'short')}
      </span>
    </div>
    <div class="map-tooltip__sub">
      <span>${locText}</span>
      <span class="map-tooltip__teams">${teamsText}</span>
    </div>
  `;
}

function setupTooltip(stack, league) {
  if (!HOVER_CAPABLE.matches) return;
  const tip = document.createElement('div');
  tip.className = 'map-tooltip';
  tip.hidden = true;
  stack.appendChild(tip);

  const hide = () => { tip.hidden = true; };

  stack.addEventListener('pointerover', (e) => {
    const pin = e.target.closest('.tw-map__pin[data-id]');
    if (!pin) return;
    const stadium = league.stadiums.find((s) => s.id === pin.dataset.id);
    if (!stadium) return;
    tip.innerHTML = tooltipHtml(stadium, Number(pin.dataset.level || DEFAULT_LEVEL), league);
    tip.hidden = false;

    // 定位：pin 正上方置中；太靠上緣改到下方；水平 clamp 在地圖範圍內
    const pinRect = pin.getBoundingClientRect();
    const stackRect = stack.getBoundingClientRect();
    const cx = pinRect.left + pinRect.width / 2 - stackRect.left;
    const x = Math.min(Math.max(cx - tip.offsetWidth / 2, 6), stackRect.width - tip.offsetWidth - 6);
    tip.style.left = `${x.toFixed(0)}px`;
    const above = pinRect.top - stackRect.top > tip.offsetHeight + 14;
    const y = above
      ? pinRect.top - stackRect.top - tip.offsetHeight - 10
      : pinRect.bottom - stackRect.top + 10;
    tip.style.top = `${y.toFixed(0)}px`;
  });

  stack.addEventListener('pointerout', (e) => {
    if (e.target.closest('.tw-map__pin')) hide();
  });
  stack.addEventListener('pointerdown', hide);   // 開始拖拉 / 點擊時收掉
  stack.addEventListener('wheel', hide, { passive: true });
}

// ---------- 渲染（互動版） ----------
export async function renderMap(container, league, levels = {}) {
  const outline = await loadOutline(league.outlinePath);
  const svgHtml = buildSvg(outline, levels, league);

  // 容器 aspect-ratio 隨聯盟調整（台灣 ~0.81、日本 ~1.17）
  const vb = bboxToVB(league.bbox);
  container.style.setProperty('--map-aspect', `${vb.w} / ${vb.h}`);

  container.innerHTML = `
    <div class="tw-map-stack">
      ${svgHtml}
      <div class="tw-map__controls" role="group" aria-label="${t('zoomGroupLabel')}">
        <button type="button" class="tw-ctrl" data-zoom="in"  aria-label="${t('zoomIn')}" title="${t('zoomIn')}">＋</button>
        <button type="button" class="tw-ctrl" data-zoom="out" aria-label="${t('zoomOut')}" title="${t('zoomOut')}">−</button>
        <button type="button" class="tw-ctrl" data-zoom="reset" aria-label="${t('zoomReset')}" title="${t('zoomReset')}">⊙</button>
      </div>
    </div>
  `;

  const svg = container.querySelector('.tw-map');
  const interactor = new MapInteractor(svg, vb);

  // 提供 pin 位置（viewBox 單位）給標籤遮擋偵測
  const project = makeProjector(league.bbox, vb);
  interactor.pinPositions = league.stadiums.map((s) => project(s.lat, s.lng));
  interactor.apply();

  container.querySelectorAll('.tw-ctrl').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.zoom;
      if (action === 'in')        interactor.zoomCenter(0.7);
      else if (action === 'out')  interactor.zoomCenter(1 / 0.7);
      else if (action === 'reset') interactor.reset();
    });
  });

  setupTooltip(container.querySelector('.tw-map-stack'), league);

  return interactor;
}

// 靜態版：給分享圖使用
export async function renderMapStatic(league, levels = {}) {
  const outline = await loadOutline(league.outlinePath);
  return buildSvg(outline, levels, league);
}

// 重排 pin 順序（高等級在後 = 上層）。等級變更時呼叫
export function reorderMapPins(container, levels) {
  const group = container.querySelector('.tw-map__pins');
  if (!group) return;
  const pins = Array.from(group.querySelectorAll('.tw-map__pin'));
  pins.sort((a, b) => {
    const la = levels[a.dataset.id] ?? DEFAULT_LEVEL;
    const lb = levels[b.dataset.id] ?? DEFAULT_LEVEL;
    return la - lb;
  });
  pins.forEach((p) => group.appendChild(p));
}

export function updateMapPin(container, league, stadiumId, level) {
  const stadium = league.stadiums.find((s) => s.id === stadiumId);
  const node = container.querySelector(`.tw-map__pin[data-id="${stadiumId}"]`);
  if (!node) return;
  node.style.setProperty('--pin-ring', pinRingColor(level));
  node.style.setProperty('--pin-ring-w', pinRingWidth(level));
  node.querySelectorAll('.tw-map__pin-glow').forEach((c) => c.setAttribute('fill', pinGlowFill(level)));
  node.dataset.level = String(level);
  if (stadium) node.setAttribute('aria-label', `${loc(stadium, 'name')}（${loc(LEVELS[level], 'label')}）`);
}
