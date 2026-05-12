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
} from './utils/aggregates.js';
import { renderResponseStack } from './pages/responseStackChart.js';
import { renderReviewDotPlot } from './pages/reviewDotPlotChart.js';
import { renderStackBarChart } from './pages/stackBarChart.js';
import { renderHeatmap } from './pages/heatmapChart.js';
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
  if (filterRoomEl && filterRoomEl.options.length === 0) {
    filterRoomEl.append(new Option('All room types', 'all'));
    for (const rt of ROOM_TYPES) {
      filterRoomEl.append(new Option(rt.label, rt.csv));
    }
  }
  if (filterBoroughEl && filterBoroughEl.options.length === 0) {
    filterBoroughEl.append(new Option('All boroughs', 'all'));
    for (const b of BOROUGHS) {
      filterBoroughEl.append(new Option(b, b));
    }
  }
  const filterPriceBinEl = document.getElementById('filter-price-bin');
  if (filterPriceBinEl && filterPriceBinEl.options.length <= 1) {
    for (const b of HEATMAP_PRICE_BINS) {
      filterPriceBinEl.append(new Option(priceBinLabel(b), b.toString()));
    }
  }
}

function getFilters() {
  return {
    roomType: filterRoomEl?.value ?? 'all',
    borough: filterBoroughEl?.value ?? 'all',
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
  if (f.roomType !== 'all') parts.push(document.querySelector('#filter-room option:checked')?.text ?? '');
  if (f.borough !== 'all') parts.push(f.borough);
  setStatus(parts.join(' · '));

  chart2CardEl?.classList.toggle('chart-card--filtered', f.borough !== 'all');

  if (chart2HintEl) {
    chart2HintEl.textContent =
      f.borough === 'all'
        ? ''
        : `Chart 2 shows listings in ${f.borough} only. Click the same borough on chart 1 or set “All boroughs” to clear.`;
    chart2HintEl.hidden = f.borough === 'all';
  }

  const responseData = aggregateResponseTimeByBorough(r1);
  const selectedBorough = f.borough === 'all' ? null : f.borough;

  renderResponseStack('#chart1', responseData, {
    selectedBorough,
    onBoroughClick: (borough) => {
      if (!filterBoroughEl) return;
      const next = filterBoroughEl.value === borough ? 'all' : borough;
      filterBoroughEl.value = next;
      updateCharts();
    },
  });

  const reviewData = aggregateReviewScoresByRoomType(r2);
  renderReviewDotPlot('#chart2', reviewData);

  // Chart 3 — preferred room type (uses borough AND roomType)
  const preferredData = aggregatePreferredRoomType(r2);
  renderStackBarChart('#chart3', preferredData);
  buildChart3Legend(preferredData.types);
  
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
  renderHeatmap('#chart4', heatmapData, {
    roomFilter: f.roomType,
    accFilter: document.getElementById('filter-acc')?.value ?? 'all',
    priceBinFilter: document.getElementById('filter-price-bin')?.value ?? 'all',
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

    document.getElementById('filter-room')?.addEventListener('change', updateCharts);
    document.getElementById('filter-borough')?.addEventListener('change', updateCharts);
    document.getElementById('filter-exclude-0')?.addEventListener('change', updateCharts);
    
    document.getElementById('filter-acc')?.addEventListener('change', updateChart4);
    document.getElementById('filter-price-bin')?.addEventListener('change', updateChart4);
    
    document.getElementById('filter-heatmap-reset')?.addEventListener('click', () => {
      if (document.getElementById('filter-acc')) document.getElementById('filter-acc').value = 'all';
      if (document.getElementById('filter-price-bin')) document.getElementById('filter-price-bin').value = 'all';
      updateChart4();
    });
    
    document.getElementById('filter-reset')?.addEventListener('click', () => {
      if (document.getElementById('filter-room')) document.getElementById('filter-room').value = 'all';
      if (document.getElementById('filter-borough')) document.getElementById('filter-borough').value = 'all';
      if (document.getElementById('filter-acc')) document.getElementById('filter-acc').value = 'all';
      if (document.getElementById('filter-price-bin')) document.getElementById('filter-price-bin').value = 'all';
      if (document.getElementById('filter-exclude-0')) document.getElementById('filter-exclude-0').checked = false;
      updateCharts();
    });

    updateCharts();
  } catch (e) {
    console.error(e);
    setStatus(
      'Could not load CSV. Run `npm run dev` and open this page via the dev server (not file://).',
      true
    );
  }
}

main();
