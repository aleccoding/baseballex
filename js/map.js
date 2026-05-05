// 台灣地圖 SVG 渲染 + 互動（拖拉平移 + 按鈕/滾輪縮放）

import { STADIUMS, LEVELS, DEFAULT_LEVEL, TEAMS } from '../data/stadiums.js';

const BBOX = {
  minLng: 119.25, maxLng: 122.10,
  minLat: 21.85,  maxLat: 25.35,
};

const VB = {
  w: Math.round((BBOX.maxLng - BBOX.minLng) * 100),  // 285
  h: Math.round((BBOX.maxLat - BBOX.minLat) * 100),  // 350
};

function project(lat, lng) {
  const x = ((lng - BBOX.minLng) / (BBOX.maxLng - BBOX.minLng)) * VB.w;
  const y = ((BBOX.maxLat - lat) / (BBOX.maxLat - BBOX.minLat)) * VB.h;
  return [x, y];
}

function pointsAttr(latLngList) {
  return latLngList
    .map(([lat, lng]) => project(lat, lng).map((n) => n.toFixed(2)).join(','))
    .join(' ');
}

// 把一個 ring（含 outer + holes）轉成 SVG path d 字串
// 用 evenodd 規則時，外圈與洞圈方向不重要
function ringToPath(ring) {
  const parts = [ring.outer, ...ring.holes].map((coords) => {
    return coords
      .map(([lat, lng], i) => {
        const [x, y] = project(lat, lng);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ') + 'Z';
  });
  return parts.join(' ');
}

let outlineCache = null;
async function loadOutline() {
  if (outlineCache) return outlineCache;
  const res = await fetch('./data/taiwan-outline.json');
  if (!res.ok) throw new Error('Failed to load taiwan-outline.json');
  outlineCache = await res.json();
  return outlineCache;
}

function pinStrokeColor(s) {
  if (s.isShared) return '#1a1d24';
  if (s.homeTeams.length > 0) return TEAMS[s.homeTeams[0]].color;
  return '#5a5f6b';
}

// 球的填色：L0 用純白（像真實棒球），L1+ 用該等級色
// 等級顯示（卡片 badge、legend、share view 等）仍使用 LEVELS[].color（灰）
function pinFillColor(levelId) {
  return levelId === DEFAULT_LEVEL ? '#ffffff' : LEVELS[levelId].color;
}

// 棒球縫線：用程式沿著 seam 自動計算 stitches，保證對齊。
// Seam 弧度 "()"：從上下端往兩側外凸（參考真實棒球俯視）
const SEAM_LEFT_CTRL  = [[-2.5, -6.5], [-5.5, -3.5], [-5.5, 3.5], [-2.5, 6.5]];
const SEAM_RIGHT_CTRL = [[ 2.5, -6.5], [ 5.5, -3.5], [ 5.5, 3.5], [ 2.5, 6.5]];

function cubicPath(c) {
  return `M ${c[0][0]} ${c[0][1]} C ${c[1][0]} ${c[1][1]} ${c[2][0]} ${c[2][1]} ${c[3][0]} ${c[3][1]}`;
}

// 沿 cubic bezier 等距取點，產生垂直於切線的 stitch 短線
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
  constructor(svg) {
    this.svg = svg;
    this.initVB = { x: 0, y: 0, w: VB.w, h: VB.h };
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
    // 標籤、pin 尺寸隨 zoom 縮放（在 viewBox 單位上反向），讓螢幕尺寸維持不變
    const r = w / this.initVB.w;
    this.svg.style.setProperty('--label-fs', (r * 5).toFixed(2));
    this.svg.style.setProperty('--pin-scale', r.toFixed(3));

    this.updateLabelVisibility();
  }

  // 縣市標籤太靠近 pin 時自動淡出。zoom 越大、threshold 越小，淡出的越少。
  // 帶 data-force 屬性的標籤永遠顯示（如嘉義市）。
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
    // 限制 viewBox 寬度
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
    // 限制位置：保證 viewBox 中心點在初始範圍內（允許邊緣半屏）
    const halfW = this.vb.w / 2;
    const halfH = this.vb.h / 2;
    const cx = this.vb.x + halfW;
    const cy = this.vb.y + halfH;
    const minCx = 0;
    const maxCx = this.initVB.w;
    const minCy = 0;
    const maxCy = this.initVB.h;
    if (cx < minCx) this.vb.x = minCx - halfW;
    if (cx > maxCx) this.vb.x = maxCx - halfW;
    if (cy < minCy) this.vb.y = minCy - halfH;
    if (cy > maxCy) this.vb.y = maxCy - halfH;
  }

  zoomBy(factor, cx, cy) {
    // factor < 1 = zoom in, > 1 = zoom out
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
      // 點 pin 時不啟動拖拉
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

// 共用：建構 SVG 字串
function buildSvg(outline, levels) {
  const countiesHtml = outline.counties
    .map((c) => c.rings
      .map((ring) => `<path class="tw-map__county" data-name="${c.name}" fill-rule="evenodd" d="${ringToPath(ring)}"/>`)
      .join('')
    )
    .join('');

  const labelsHtml = outline.counties
    .filter((c) => c.label)
    .map((c) => {
      const [x, y] = project(c.label[0], c.label[1]);
      const force = c.forceShow ? ' data-force="1"' : '';
      return `<text class="tw-map__label"${force} x="${x.toFixed(1)}" y="${y.toFixed(1)}">${c.displayName || c.name}</text>`;
    })
    .join('');

  // 按等級升序排序，讓高等級的 pin 後渲染（在 SVG 畫面上層），重疊時不會被低等級遮擋
  const sortedStadiums = [...STADIUMS].sort((a, b) => {
    const la = levels[a.id] ?? DEFAULT_LEVEL;
    const lb = levels[b.id] ?? DEFAULT_LEVEL;
    return la - lb;
  });
  const pinsHtml = sortedStadiums.map((s) => {
    const [x, y] = project(s.lat, s.lng);
    const lv = levels[s.id] ?? DEFAULT_LEVEL;
    return `
      <g class="tw-map__pin" data-id="${s.id}" transform="translate(${x.toFixed(2)} ${y.toFixed(2)})">
        <g class="tw-map__pin-scale">
          <circle class="tw-map__pin-ball" r="8" fill="${pinFillColor(lv)}"/>
          <path class="tw-map__pin-halo"     d="${SEAM_PATH_D} ${STITCH_PATH_D}"/>
          <path class="tw-map__pin-seam"     d="${SEAM_PATH_D}"/>
          <path class="tw-map__pin-stitches" d="${STITCH_PATH_D}"/>
        </g>
        <title>${s.name}（${LEVELS[lv].label}）</title>
      </g>
    `;
  }).join('');

  return `
    <svg class="tw-map" viewBox="0 0 ${VB.w} ${VB.h}"
         xmlns="http://www.w3.org/2000/svg"
         role="img" aria-label="台灣地圖與中職球場分布">
      <rect width="100%" height="100%" class="tw-map__sea"/>
      <g class="tw-map__counties">${countiesHtml}</g>
      <g class="tw-map__pins">${pinsHtml}</g>
      <g class="tw-map__labels">${labelsHtml}</g>
    </svg>
  `;
}

// ---------- 渲染（互動版） ----------
export async function renderMap(container, levels = {}) {
  const outline = await loadOutline();
  const svgHtml = buildSvg(outline, levels);

  container.innerHTML = `
    <div class="tw-map-stack">
      ${svgHtml}
      <div class="tw-map__controls" role="group" aria-label="地圖縮放">
        <button type="button" class="tw-ctrl" data-zoom="in"  aria-label="放大" title="放大">＋</button>
        <button type="button" class="tw-ctrl" data-zoom="out" aria-label="縮小" title="縮小">−</button>
        <button type="button" class="tw-ctrl" data-zoom="reset" aria-label="重置視角" title="重置視角">⊙</button>
      </div>
    </div>
  `;

  // 互動初始化
  const svg = container.querySelector('.tw-map');
  const interactor = new MapInteractor(svg);
  // 提供 pin 位置（viewBox 單位）給標籤遮擋偵測
  interactor.pinPositions = STADIUMS.map((s) => project(s.lat, s.lng));
  interactor.apply();

  container.querySelectorAll('.tw-ctrl').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.zoom;
      if (action === 'in')        interactor.zoomCenter(0.7);
      else if (action === 'out')  interactor.zoomCenter(1 / 0.7);
      else if (action === 'reset') interactor.reset();
    });
  });

  return interactor;
}

// 靜態版：給分享圖使用，不含互動控制、不含縮放
// 回傳 SVG 字串，呼叫端可塞進任何容器
export async function renderMapStatic(levels = {}) {
  const outline = await loadOutline();
  return buildSvg(outline, levels);
}

// 重新排列 pin 在 DOM 中的順序：高等級在後（=畫面上層）
// 等級變更時呼叫，避免低等級壓住高等級的視覺問題
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

export function updateMapPin(container, stadiumId, level) {
  const stadium = STADIUMS.find((s) => s.id === stadiumId);
  const node = container.querySelector(`.tw-map__pin[data-id="${stadiumId}"]`);
  if (!node) return;
  const ball = node.querySelector('.tw-map__pin-ball');
  if (ball) ball.setAttribute('fill', pinFillColor(level));
  const title = node.querySelector('title');
  if (title && stadium) title.textContent = `${stadium.name}（${LEVELS[level].label}）`;
}
