import { loadListings } from './utils/loadListings.js';
import {
  aggregateResponseTimeByBorough,
  aggregateReviewScoresByRoomType,
  filterListings,
  BOROUGHS,
  ROOM_TYPES,
} from './utils/aggregates.js';
import { renderResponseStack } from './pages/responseStackChart.js';
import { renderReviewDotPlot } from './pages/reviewDotPlotChart.js';
import { chartTooltip } from './components/tooltip.js';

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
}

function getFilters() {
  return {
    roomType: filterRoomEl?.value ?? 'all',
    borough: filterBoroughEl?.value ?? 'all',
  };
}

let allRows = null;

/** Chart 1 uses room filter only so all boroughs stay visible; chart 2 uses room + borough. */
function rowsForChart1(f) {
  return filterListings(allRows, { roomType: f.roomType, borough: 'all' });
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
}

async function main() {
  setStatus('Loading listings.csv…');
  fillFilterSelects();

  try {
    allRows = await loadListings();
    setStatus(`${allRows.length.toLocaleString()} listings loaded.`);

    filterRoomEl?.addEventListener('change', updateCharts);
    filterBoroughEl?.addEventListener('change', updateCharts);
    filterResetEl?.addEventListener('click', () => {
      if (filterRoomEl) filterRoomEl.value = 'all';
      if (filterBoroughEl) filterBoroughEl.value = 'all';
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
