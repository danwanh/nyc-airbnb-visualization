import { loadListings } from "./utils/loadListings.js";
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
  aggregateRatingDistributionByBorough,
  aggregateInstantBookable,
} from "./utils/aggregates.js";
import { renderResponseStack } from "./pages/responseStackChart.js";
import { renderReviewDotPlot } from "./pages/reviewDotPlotChart.js";
import { renderStackBarChart } from "./pages/stackBarChart.js";
import { renderHeatmap } from "./pages/heatmapChart.js";
import { renderRatingPie } from "./pages/ratingPieChart.js";
import { renderInstantBookableChart } from "./pages/instantBookableChart.js";
import { chartTooltip } from "./components/tooltip.js";

// Refactored charts
import { renderListingBubbleMap } from "./pages/ListingBubbleMap.js";
import { renderNeighborhoodBarChart } from "./pages/NeighborhoodBarChart.js";

/* Heatmap data is pre-computed once and reused (filters are internal to the component) */
let _heatmapData = null;
let _selectedNeighborhood = null;

// Stacked bar chart: selected segment { hood, roomType } or null
let _selectedStackSegment = null;

// Heatmap: selected cell { room, acc, bin } or null
let _selectedHeatmapCell = null;

const statusEl = document.getElementById("chart-status");
const filterRoomEl = document.getElementById("filter-room");
const filterBoroughEl = document.getElementById("filter-borough");
const filterResetEl = document.getElementById("filter-reset");
const chart2CardEl = document.getElementById("chart2-card");
const chart2HintEl = document.getElementById("chart2-borough-hint");

function setStatus(message, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
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

/**
 * Helper: set the global Room Type checkbox filter to a single value,
 * or restore all if roomType is null/undefined.
 * Returns true if the filter actually changed.
 */
function setGlobalRoomFilter(roomType) {
  if (!filterRoomEl) return;
  const allCb = filterRoomEl.querySelector('input[value="all"]');
  const otherCbs = filterRoomEl.querySelectorAll('input:not([value="all"])');
  if (!roomType) {
    // Restore all
    otherCbs.forEach(cb => cb.checked = true);
    if (allCb) allCb.checked = true;
  } else {
    const currentChecked = Array.from(otherCbs).filter(c => c.checked).map(c => c.value);
    if (currentChecked.length === 1 && currentChecked[0] === roomType) {
      // Already only this room → toggle off → restore all
      otherCbs.forEach(cb => cb.checked = true);
      if (allCb) allCb.checked = true;
      return 'restored';
    }
    otherCbs.forEach(cb => cb.checked = (cb.value === roomType));
    if (allCb) allCb.checked = false;
  }
  return 'changed';
}

/** Chart 1 uses room filter only so all boroughs stay visible; chart 2 uses room + borough. */
function rowsForChart1(f) {
  return filterListings(allRows, {
    roomType: f.roomType,
    borough: "all",
    excludeZero: f.excludeZero,
    // Note: chart 1 usually doesn't filter by neighborhood to keep context, 
    // but here we might want to if specified.
    neighborhood: "all",
  });
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

  renderResponseStack("#chart1", responseData, {
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
  renderReviewDotPlot("#chart2", reviewData);

  // Chart 3 — preferred room type
  const preferredData = aggregatePreferredRoomType(r2);
  renderStackBarChart("#chart3", preferredData, {
    selectedBorough: (f.borough.length === 1) ? f.borough[0] : null,
    selectedSegment: _selectedStackSegment,
    onSegmentClick: (hood, roomType) => {
      if (!filterBoroughEl) return;
      const allCb = filterBoroughEl.querySelector('input[value="all"]');
      const otherCbs = filterBoroughEl.querySelectorAll('input:not([value="all"])');
      const currentChecked = Array.from(otherCbs).filter(c => c.checked).map(c => c.value);

      if (!hood && !roomType) {
        // Backdrop click -> restore all boroughs
        _selectedStackSegment = null;
        otherCbs.forEach(cb => cb.checked = true);
        if (allCb) allCb.checked = true;
        updateCharts();
        return;
      }

      if (currentChecked.length === 1 && currentChecked[0] === hood) {
        // Click same borough -> toggle off -> restore all
        _selectedStackSegment = null;
        otherCbs.forEach(cb => cb.checked = true);
        if (allCb) allCb.checked = true;
      } else {
        _selectedStackSegment = { hood, roomType };
        otherCbs.forEach(cb => cb.checked = (cb.value === hood));
        if (allCb) allCb.checked = false;
      }
      updateCharts();
    },
  });
  buildChart3Legend(preferredData.types);

  // Chart 5 - Rating Pie (shows all 5 boroughs, uses room filter only)
  const pieData = aggregateRatingDistributionByBorough(r1);
  renderRatingPie("#chart5", pieData);

  // Chart 4 - Heatmap
  updateChart4();

  // Update New Charts (12 & 13)
  const borough = f.borough;
  const neighborhoodOptions = {
    selectedNeighborhood: _selectedNeighborhood,
    onNeighborhoodClick: (nb) => {
      _selectedNeighborhood = _selectedNeighborhood === nb ? null : nb;
      updateCharts();
    },
  };

  renderListingBubbleMap("#chart12", r2, borough, neighborhoodOptions);
  renderNeighborhoodBarChart("#chart13", r2, borough, neighborhoodOptions);
}

function buildChart3Legend(types) {
  const el = document.getElementById("chart3-legend");
  if (!el) return;
  el.innerHTML = (types.length ? types : ROOM_TYPE_STACK_ORDER)
    .map((t) => {
      const color = ROOM_TYPE_COLORS[t] ?? "#888";
      return `<div class="legend-item">
        <div class="legend-rect" style="background:${color}"></div>
        ${t}
      </div>`;
    })
    .join("");
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
    selectedCell: _selectedHeatmapCell,

    // Cell click: filter room type globally + highlight acc/bin in heatmap only
    onCellClick: (room, acc, bin) => {
      if (!room && acc === null && bin === null) {
        // Backdrop click → deselect
        _selectedHeatmapCell = null;
        setGlobalRoomFilter(null);
        updateCharts();
        return;
      }

      const isSame = _selectedHeatmapCell &&
        _selectedHeatmapCell.room === room &&
        _selectedHeatmapCell.acc === acc &&
        _selectedHeatmapCell.bin === bin;

      if (isSame) {
        // Toggle off
        _selectedHeatmapCell = null;
        setGlobalRoomFilter(null);
      } else {
        _selectedHeatmapCell = { room, acc, bin };
        const result = setGlobalRoomFilter(room);
        if (result === 'restored') _selectedHeatmapCell = null;
      }
      // updateCharts re-renders everything including heatmap with new room filter
      updateCharts();
    },

    // Room type label click (header column in heatmap) → same cross-chart filter
    onRoomTypeClick: (roomType) => {
      _selectedHeatmapCell = null;
      const result = setGlobalRoomFilter(roomType);
      updateCharts();
    },
  });
}

async function main() {
  setStatus("Loading listings.csv…");
  fillFilterSelects();

  try {
    allRows = await loadListings();
    setStatus(`${allRows.length.toLocaleString()} listings loaded.`);

    // Initial render
    updateCharts();
    document.getElementById('filter-room')?.addEventListener('change', (e) => {
      _selectedStackSegment = null;
      _selectedHeatmapCell = null;
      handleFilterChange(e, document.getElementById('filter-room'));
    });
    document.getElementById('filter-borough')?.addEventListener('change', (e) => {
      _selectedNeighborhood = null;
      _selectedStackSegment = null;
      handleFilterChange(e, document.getElementById('filter-borough'));
    });
    document.getElementById('filter-exclude-0')?.addEventListener('change', updateCharts);

    document.getElementById('filter-acc')?.addEventListener('change', (e) => handleFilterChange(e, document.getElementById('filter-acc'), updateChart4));
    document.getElementById('filter-price-bin')?.addEventListener('change', (e) => handleFilterChange(e, document.getElementById('filter-price-bin'), updateChart4));

    document.getElementById('filter-heatmap-reset')?.addEventListener('click', () => {
      // Reset acc + price bin filters
      document.getElementById('filter-acc')?.querySelectorAll('input').forEach(cb => cb.checked = true);
      document.getElementById('filter-price-bin')?.querySelectorAll('input').forEach(cb => cb.checked = true);
      // Clear heatmap cell selection and room type filter from heatmap
      _selectedHeatmapCell = null;
      setGlobalRoomFilter(null); // restore all room types
      updateCharts();
    });

    document.getElementById('filter-reset')?.addEventListener('click', () => {
      document.getElementById('filter-room')?.querySelectorAll('input').forEach(cb => cb.checked = true);
      document.getElementById('filter-borough')?.querySelectorAll('input').forEach(cb => cb.checked = true);
      document.getElementById('filter-acc')?.querySelectorAll('input').forEach(cb => cb.checked = true);
      document.getElementById('filter-price-bin')?.querySelectorAll('input').forEach(cb => cb.checked = true);
      if (document.getElementById('filter-exclude-0')) document.getElementById('filter-exclude-0').checked = false;
      _selectedNeighborhood = null;
      _selectedStackSegment = null;
      _selectedHeatmapCell = null;
      updateCharts();
    });


    // ── Chart 6: Instant Bookable (static overview, no filter) ──
    function updateChart6() {
      if (!allRows) return;
      const ibData = aggregateInstantBookable(allRows);
      renderInstantBookableChart("#chart6", ibData);
    }
    updateChart6();

  } catch (e) {
    console.error(e);
    setStatus("Could not load CSV. Ensure server is running.", true);
  }
}

main();
