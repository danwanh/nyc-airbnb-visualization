import { loadListings } from './utils/loadListings.js';
import {
  aggregateResponseTimeByBorough,
  aggregateReviewScoresByRoomType,
  aggregatePreferredRoomType,
  aggregateHeatmap,
  filterListings,
  BOROUGHS,
  ROOM_TYPES,
  ROOM_TYPE_COLORS,
  ROOM_TYPE_STACK_ORDER,
  HEATMAP_PRICE_BINS,
  priceBinLabel,
  aggregateRatingDistribution,
  aggregateInstantBookable,
} from './utils/aggregates.js';
import { renderResponseStack } from './pages/responseStackChart.js';
import { renderReviewDotPlot } from './pages/reviewDotPlotChart.js';
import { renderStackBarChart } from './pages/stackBarChart.js';
import { renderHeatmap } from './pages/heatmapChart.js';
import { renderRatingPie } from './pages/ratingPieChart.js';
import { renderInstantBookableChart } from './pages/instantBookableChart.js';
import { chartTooltip } from './components/tooltip.js';

/* Heatmap data is pre-computed once and reused (filters are internal to the component) */
let _heatmapData = null;

const statusEl = document.getElementById('chart-status');
const filterRoomEl = document.getElementById('filter-room');
const filterBoroughEl = document.getElementById('filter-borough');
const filterResetEl = document.getElementById('filter-reset');
const chart2CardEl = document.getElementById('chart2-card');
const chart2HintEl = document.getElementById('chart2-borough-hint');

function setStatus(message, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

function fillFilterSelects() {
  if (filterRoomEl && filterRoomEl.children.length === 0) {
    let html = `<label class="checkbox-label">
      <input type="checkbox" value="all" checked>
      <strong>(All)</strong>
    </label>`;
    for (const rt of ROOM_TYPES) {
      html += `<label class="checkbox-label"><input type="checkbox" value="${rt.csv}" checked> ${rt.label}</label>`;
    }
    filterRoomEl.innerHTML = html;
  }
  if (filterBoroughEl && filterBoroughEl.children.length === 0) {
    let html = `<label class="checkbox-label">
      <input type="checkbox" value="all" checked>
      <strong>(All)</strong>
    </label>`;
    for (const b of BOROUGHS) {
      html += `<label class="checkbox-label"><input type="checkbox" value="${b}" checked> ${b}</label>`;
    }
    filterBoroughEl.innerHTML = html;
  }

  // Heatmap: Accommodates checkbox group
  const filterAccEl = document.getElementById('filter-acc');
  if (filterAccEl && filterAccEl.children.length === 0) {
    const accOptions = ['1 guest', '2 guests', '3-4 guests', '5-6 guests', '7+ guests'];
    let html = `<label class="checkbox-label">
      <input type="checkbox" value="all" checked>
      <strong>(All)</strong>
    </label>`;
    for (const a of accOptions) {
      html += `<label class="checkbox-label"><input type="checkbox" value="${a}" checked> ${a}</label>`;
    }
    filterAccEl.innerHTML = html;
  }

  // Heatmap: Price Bin checkbox group
  const filterPriceBinEl = document.getElementById('filter-price-bin');
  if (filterPriceBinEl && filterPriceBinEl.children.length === 0) {
    let html = `<label class="checkbox-label">
      <input type="checkbox" value="all" checked>
      <strong>(All)</strong>
    </label>`;
    for (const b of HEATMAP_PRICE_BINS) {
      html += `<label class="checkbox-label"><input type="checkbox" value="${b}" checked> ${priceBinLabel(b)}</label>`;
    }
    filterPriceBinEl.innerHTML = html;
  }
}

function handleFilterChange(e, containerEl, callback) {
  if (e.target.tagName !== 'INPUT') return;
  const allCb = containerEl.querySelector('input[value="all"]');
  const otherCbs = containerEl.querySelectorAll('input:not([value="all"])');

  if (e.target === allCb) {
    otherCbs.forEach(cb => cb.checked = e.target.checked);
  } else {
    allCb.checked = Array.from(otherCbs).every(c => c.checked);
  }
  (callback ?? updateCharts)();
}

function getFilters() {
  const getChecked = (el) => Array.from(el?.querySelectorAll('input:not([value="all"]):checked') || []).map(cb => cb.value);
  return {
    roomType: getChecked(filterRoomEl),
    borough: getChecked(filterBoroughEl),
    excludeZero: document.getElementById('filter-exclude-0')?.checked ?? false,
  };
}

let allRows = null;

/** Chart 1 uses room filter only so all boroughs stay visible; chart 2 uses room + borough. */
function rowsForChart1(f) {
  return filterListings(allRows, { roomType: f.roomType, borough: 'all', excludeZero: f.excludeZero });
}

function rowsForChart2(f) {
  return filterListings(allRows, f);
}

function updateCharts() {
  if (!allRows) return;

  chartTooltip.hide();

  const f = getFilters();
  const r1 = rowsForChart1(f);
  const r2 = rowsForChart2(f);

  const parts = [`Chart 2: ${r2.length.toLocaleString()} / ${allRows.length.toLocaleString()} listings`];
  if (f.roomType.length > 0 && f.roomType.length < ROOM_TYPES.length) parts.push(f.roomType.join(', '));
  if (f.borough.length > 0 && f.borough.length < BOROUGHS.length) parts.push(f.borough.join(', '));
  setStatus(parts.join(' · '));

  const hasBoroughFilter = f.borough.length > 0 && f.borough.length < BOROUGHS.length;
  chart2CardEl?.classList.toggle('chart-card--filtered', hasBoroughFilter);

  if (chart2HintEl) {
    chart2HintEl.textContent = !hasBoroughFilter
      ? ''
      : `Chart 2 shows filtered listings only.`;
    chart2HintEl.hidden = !hasBoroughFilter;
  }

  const responseData = aggregateResponseTimeByBorough(r1);
  const selectedBorough = (f.borough.length === 1) ? f.borough[0] : null;

  renderResponseStack('#chart1', responseData, {
    selectedBorough,
    onBoroughClick: (borough) => {
      if (!filterBoroughEl) return;
      const allCb = filterBoroughEl.querySelector('input[value="all"]');
      const otherCbs = filterBoroughEl.querySelectorAll('input:not([value="all"])');
      const currentChecked = Array.from(otherCbs).filter(c => c.checked).map(c => c.value);

      if (currentChecked.length === 1 && currentChecked[0] === borough) {
        otherCbs.forEach(cb => cb.checked = true);
        if (allCb) allCb.checked = true;
      } else {
        otherCbs.forEach(cb => cb.checked = (cb.value === borough));
        if (allCb) allCb.checked = false;
      }
      updateCharts();
    },
  });

  const reviewData = aggregateReviewScoresByRoomType(r2);
  renderReviewDotPlot('#chart2', reviewData);

  // Chart 3 — preferred room type (uses borough AND roomType)
  const preferredData = aggregatePreferredRoomType(r2);
  renderStackBarChart('#chart3', preferredData);
  buildChart3Legend(preferredData.types);

  // Chart 5 - Rating Pie (uses borough AND roomType)
  const pieData = aggregateRatingDistribution(r2);
  renderRatingPie('#chart5', pieData);

  // Chart 4 - Heatmap uses r1 (filtered by roomType only) + its own internal controls
  updateChart4();
}

function buildChart3Legend(types) {
  const el = document.getElementById('chart3-legend');
  if (!el) return;
  el.innerHTML = (types.length ? types : ROOM_TYPE_STACK_ORDER)
    .map((t) => {
      const color = ROOM_TYPE_COLORS[t] ?? '#888';
      return `<div class="legend-item">
        <div class="legend-rect" style="background:${color}"></div>
        ${t}
      </div>`;
    })
    .join('');
}

function updateChart4() {
  if (!allRows) return;
  const f = getFilters();
  const r1 = rowsForChart1(f);
  const heatmapData = aggregateHeatmap(r1);

  const getCheckedValues = (id) => {
    const el = document.getElementById(id);
    return Array.from(el?.querySelectorAll('input:not([value="all"]):checked') || []).map(cb => cb.value);
  };

  const accChecked = getCheckedValues('filter-acc');
  const priceChecked = getCheckedValues('filter-price-bin');

  renderHeatmap('#chart4', heatmapData, {
    roomFilter: f.roomType,
    accFilter: accChecked,
    priceBinFilter: priceChecked,
  });
}

async function main() {
  setStatus('Loading listings.csv…');
  fillFilterSelects();

  try {
    allRows = await loadListings();
    setStatus(`${allRows.length.toLocaleString()} listings loaded.`);

    // Initial render of all charts
    updateCharts();

    document.getElementById('filter-room')?.addEventListener('change', (e) => handleFilterChange(e, document.getElementById('filter-room')));
    document.getElementById('filter-borough')?.addEventListener('change', (e) => handleFilterChange(e, document.getElementById('filter-borough')));
    document.getElementById('filter-exclude-0')?.addEventListener('change', updateCharts);

    document.getElementById('filter-acc')?.addEventListener('change', (e) => handleFilterChange(e, document.getElementById('filter-acc'), updateChart4));
    document.getElementById('filter-price-bin')?.addEventListener('change', (e) => handleFilterChange(e, document.getElementById('filter-price-bin'), updateChart4));

    document.getElementById('filter-heatmap-reset')?.addEventListener('click', () => {
      document.getElementById('filter-acc')?.querySelectorAll('input').forEach(cb => cb.checked = true);
      document.getElementById('filter-price-bin')?.querySelectorAll('input').forEach(cb => cb.checked = true);
      updateChart4();
    });

    document.getElementById('filter-reset')?.addEventListener('click', () => {
      document.getElementById('filter-room')?.querySelectorAll('input').forEach(cb => cb.checked = true);
      document.getElementById('filter-borough')?.querySelectorAll('input').forEach(cb => cb.checked = true);
      document.getElementById('filter-acc')?.querySelectorAll('input').forEach(cb => cb.checked = true);
      document.getElementById('filter-price-bin')?.querySelectorAll('input').forEach(cb => cb.checked = true);
      if (document.getElementById('filter-exclude-0')) document.getElementById('filter-exclude-0').checked = false;
      updateCharts();
    });

    updateCharts();

    // ── Chart 6: Instant Bookable (static overview, no filter) ──
    function updateChart6() {
      if (!allRows) return;
      const ibData = aggregateInstantBookable(allRows);
      renderInstantBookableChart('#chart6', ibData);
    }

    updateChart6();

  } catch (e) {
    console.error(e);
    setStatus(
      'Could not load CSV. Run `npm run dev` and open this page via the dev server (not file://).',
      true
    );
  }
}

main();
