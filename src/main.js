import { loadListings } from "./utils/loadListings.js";
import {
  aggregateResponseTimeByBorough,
  aggregateReviewScoresByRoomType,
  aggregatePreferredRoomType,
  aggregateHeatmap,
  filterListings,
  BOROUGHS,
  ROOM_TYPES,
  ROOM_TYPE_STACK_ORDER,
  HEATMAP_PRICE_BINS,
  priceBinLabel,
  aggregateRatingDistributionByBorough,
  aggregateInstantBookable,
} from "./utils/aggregates.js";
import { ROOM_TYPE_COLORS, BOROUGH_COLORS } from "./utils/palette.js";
import { renderResponseStack } from "./pages/responseStackChart.js";
import { renderReviewDotPlot } from "./pages/reviewDotPlotChart.js";
import { renderStackBarChart } from "./pages/stackBarChart.js";
import { renderHeatmap } from "./pages/heatmapChart.js";
import { renderRatingPie } from "./pages/ratingPieChart.js";
import { renderInstantBookableChart } from "./pages/instantBookableChart.js";
import { chartTooltip } from "./components/tooltip.js";
import { renderListingBubbleMap } from "./pages/ListingBubbleMap.js";
import { renderNeighborhoodBarChart } from "./pages/NeighborhoodBarChart.js";

let allRows = null;
let _selectedBorough = null;
let _selectedRoomType = null;
let _selectedNeighborhood = null;
let _selectedHeatmapCell = null;
let _manualRoomFilter = null;
let _manualBoroughFilter = null;
let _manualAccFilter = null;
let _manualPriceBinFilter = null;

const filterRoomEl = document.getElementById("filter-room");
const filterBoroughEl = document.getElementById("filter-borough");
const chart2CardEl = document.getElementById("chart2-card");

const ROOM_LABEL_BY_VALUE = new Map(ROOM_TYPES.map((rt) => [rt.csv, rt.label]));

function fillFilterSelects() {
  if (filterRoomEl && filterRoomEl.children.length === 0) {
    let html = `<label class="checkbox-label">
      <input type="checkbox" value="all" checked>
      <strong>All</strong>
    </label>`;
    for (const rt of ROOM_TYPES) {
      html += `<label class="checkbox-label"><input type="checkbox" value="${rt.csv}" checked> ${rt.label}</label>`;
    }
    filterRoomEl.innerHTML = html;
  }

  if (filterBoroughEl && filterBoroughEl.children.length === 0) {
    let html = `<label class="checkbox-label">
      <input type="checkbox" value="all" checked>
      <strong>All</strong>
    </label>`;
    for (const b of BOROUGHS) {
      html += `<label class="checkbox-label"><input type="checkbox" value="${b}" checked> ${b}</label>`;
    }
    filterBoroughEl.innerHTML = html;
  }

  const filterAccEl = document.getElementById("filter-acc");
  if (filterAccEl && filterAccEl.children.length === 0) {
    const accOptions = ["1 guest", "2 guests", "3-4 guests", "5-6 guests", "7+ guests"];
    let html = `<label class="checkbox-label">
      <input type="checkbox" value="all" checked>
      <strong>All</strong>
    </label>`;
    for (const a of accOptions) {
      html += `<label class="checkbox-label"><input type="checkbox" value="${a}" checked> ${a}</label>`;
    }
    filterAccEl.innerHTML = html;
  }

  const filterPriceBinEl = document.getElementById("filter-price-bin");
  if (filterPriceBinEl && filterPriceBinEl.children.length === 0) {
    let html = `<label class="checkbox-label">
      <input type="checkbox" value="all" checked>
      <strong>All</strong>
    </label>`;
    for (const b of HEATMAP_PRICE_BINS) {
      html += `<label class="checkbox-label"><input type="checkbox" value="${b}" checked> ${priceBinLabel(b)}</label>`;
    }
    filterPriceBinEl.innerHTML = html;
  }
}

function optionCheckboxes(containerEl) {
  return Array.from(containerEl?.querySelectorAll('input:not([value="all"])') ?? []);
}

function checkedValues(containerEl) {
  return optionCheckboxes(containerEl)
    .filter((cb) => cb.checked)
    .map((cb) => cb.value);
}

function setCheckboxGroup(containerEl, selectedValues = "all") {
  if (!containerEl) return;
  const allCb = containerEl.querySelector('input[value="all"]');
  const otherCbs = optionCheckboxes(containerEl);
  const nextValues =
    selectedValues === "all"
      ? otherCbs.map((cb) => cb.value)
      : Array.isArray(selectedValues)
        ? selectedValues
        : [selectedValues];
  const nextSet = new Set(nextValues.map(String));

  otherCbs.forEach((cb) => {
    cb.checked = nextSet.has(cb.value);
  });

  if (allCb) {
    allCb.checked = otherCbs.length > 0 && otherCbs.every((cb) => cb.checked);
  }
}

function captureManualFilters() {
  _manualRoomFilter = checkedValues(filterRoomEl);
  _manualBoroughFilter = checkedValues(filterBoroughEl);
}

function captureManualHeatmapFilters() {
  _manualAccFilter = checkedValues(document.getElementById("filter-acc"));
  _manualPriceBinFilter = checkedValues(document.getElementById("filter-price-bin"));
}

/** Room + borough + chart/map/heatmap selections cleared; all global checkboxes set to “all”. */
function resetDashboardFilters() {
  setCheckboxGroup(filterRoomEl, "all");
  setCheckboxGroup(filterBoroughEl, "all");
  _selectedBorough = null;
  _selectedRoomType = null;
  _selectedNeighborhood = null;
  _selectedHeatmapCell = null;
  setCheckboxGroup(document.getElementById("filter-acc"), "all");
  setCheckboxGroup(document.getElementById("filter-price-bin"), "all");
  captureManualFilters();
  captureManualHeatmapFilters();
}

function getSourceFilters(currentFilters = getFilters()) {
  return {
    roomType: _manualRoomFilter ?? currentFilters.roomType,
    borough: _manualBoroughFilter ?? currentFilters.borough,
  };
}

function syncGlobalFiltersToSelection() {
  if (_selectedRoomType) setCheckboxGroup(filterRoomEl, [_selectedRoomType]);
  else setCheckboxGroup(filterRoomEl, _manualRoomFilter ?? "all");

  if (_selectedBorough) setCheckboxGroup(filterBoroughEl, [_selectedBorough]);
  else setCheckboxGroup(filterBoroughEl, _manualBoroughFilter ?? "all");

  /* Keep _manual* aligned with DOM so getSourceFilters() matches chart / checkbox state */
  captureManualFilters();
}

function syncHeatmapFiltersToSelection() {
  if (_selectedHeatmapCell) {
    setCheckboxGroup(document.getElementById("filter-acc"), [_selectedHeatmapCell.acc]);
    setCheckboxGroup(document.getElementById("filter-price-bin"), [String(_selectedHeatmapCell.bin)]);
    return;
  }

  setCheckboxGroup(document.getElementById("filter-acc"), _manualAccFilter ?? "all");
  setCheckboxGroup(document.getElementById("filter-price-bin"), _manualPriceBinFilter ?? "all");
}

function handleFilterChange(e, containerEl, callback = updateCharts) {
  if (e.target.tagName !== "INPUT") return;
  const allCb = containerEl.querySelector('input[value="all"]');
  const otherCbs = optionCheckboxes(containerEl);

  if (e.target === allCb) {
    otherCbs.forEach((cb) => {
      cb.checked = e.target.checked;
    });
  } else if (allCb) {
    allCb.checked = otherCbs.length > 0 && otherCbs.every((cb) => cb.checked);
  }

  chartTooltip.hide();
  callback();
}

function getFilters() {
  return {
    roomType: checkedValues(filterRoomEl),
    borough: checkedValues(filterBoroughEl),
  };
}

function neighborhoodBorough(neighborhood) {
  if (!neighborhood || neighborhood === "all" || !allRows) return null;
  return allRows.find((row) => row.neighbourhood_cleansed === neighborhood)
    ?.neighbourhood_group_cleansed ?? null;
}

function selectedBoroughFromFilters(f) {
  if (_selectedBorough) return _selectedBorough;
  if (f.borough.length === 1) return f.borough[0];
  return neighborhoodBorough(_selectedNeighborhood);
}

function selectedRoomTypesFromFilters(f) {
  return _selectedRoomType ? [_selectedRoomType] : f.roomType;
}

function focusRoom(roomType) {
  if (_selectedRoomType === roomType) {
    resetDashboardFilters();
    updateCharts();
    return;
  }
  _selectedRoomType = roomType;
  _selectedHeatmapCell = null;
  syncGlobalFiltersToSelection();
  updateCharts();
}

function focusBorough(borough) {
  _selectedBorough = _selectedBorough === borough ? null : borough;
  _selectedNeighborhood = null;
  syncGlobalFiltersToSelection();
  updateCharts();
}

function focusBoroughAndRoom(borough, roomType) {
  const isSameSelection = _selectedBorough === borough && _selectedRoomType === roomType;
  _selectedNeighborhood = null;
  _selectedHeatmapCell = null;
  _selectedBorough = isSameSelection ? null : borough;
  _selectedRoomType = isSameSelection ? null : roomType;
  syncGlobalFiltersToSelection();
  updateCharts();
}

function focusNeighborhood(neighborhood, borough = null) {
  _selectedNeighborhood = _selectedNeighborhood === neighborhood ? null : neighborhood;
  _selectedBorough = _selectedNeighborhood ? borough : null;
  syncGlobalFiltersToSelection();
  updateCharts();
}

function focusHeatmapCell(cell) {
  const sameCell =
    _selectedHeatmapCell &&
    _selectedHeatmapCell.room === cell.room &&
    _selectedHeatmapCell.acc === cell.acc &&
    _selectedHeatmapCell.bin === cell.bin;

  _selectedHeatmapCell = sameCell ? null : cell;
  _selectedRoomType = sameCell ? null : cell.room;
  syncGlobalFiltersToSelection();
  syncHeatmapFiltersToSelection();
  updateCharts();
}

function neighborhoodFilterValue() {
  return _selectedNeighborhood && _selectedNeighborhood !== "all"
    ? _selectedNeighborhood
    : "all";
}

/** Rows for checkbox-scoped charts (1, 3, 5, 6) plus neighborhood drill-down from map / median-price bar. */
function baseCheckboxRows(f) {
  if (!allRows) return [];
  if (!Array.isArray(f.borough) || f.borough.length === 0) return [];
  if (!Array.isArray(f.roomType) || f.roomType.length === 0) return [];

  let borough = "all";
  if (f.borough.length < BOROUGHS.length) borough = f.borough;

  return filterListings(allRows, {
    roomType: f.roomType,
    borough,
    neighborhood: neighborhoodFilterValue(),
  });
}

function rowsForResponseOverview(f) {
  return baseCheckboxRows(f);
}

function rowsForDashboard(f) {
  return baseCheckboxRows(f);
}

function rowsForLinkedCharts(f, options = {}) {
  const {
    keepBoroughContext = false,
    keepRoomContext = false,
    keepNeighborhoodContext = false,
  } = options;

  return filterListings(allRows, {
    roomType: !keepRoomContext && _selectedRoomType ? [_selectedRoomType] : f.roomType,
    borough: !keepBoroughContext && _selectedBorough ? [_selectedBorough] : f.borough,
    neighborhood: !keepNeighborhoodContext && _selectedNeighborhood ? _selectedNeighborhood : "all",
  });
}

function rowsForNeighborhoodViews(f) {
  return rowsForLinkedCharts(f);
}

function rowsForHeatmap(f) {
  return filterListings(allRows, {
    roomType: _selectedHeatmapCell ? f.roomType : selectedRoomTypesFromFilters(f),
    borough: _selectedBorough ? [_selectedBorough] : f.borough,
    neighborhood: _selectedNeighborhood ?? "all",
  });
}

function updateCharts() {
  if (!allRows) return;

  chartTooltip.hide();

  const visibleFilters = getFilters();
  const sourceFilters = getSourceFilters(visibleFilters);
  const selectedBorough = selectedBoroughFromFilters(sourceFilters);
  const selectedRoomTypes = selectedRoomTypesFromFilters(sourceFilters);
  const responseRows = rowsForResponseOverview(sourceFilters);
  const dashboardRows = rowsForDashboard(sourceFilters);
  const linkedRows = rowsForLinkedCharts(sourceFilters);
  const neighborhoodRows = rowsForNeighborhoodViews(sourceFilters);

  const hasContextFilter = Boolean(selectedBorough || _selectedRoomType || _selectedNeighborhood);
  chart2CardEl?.classList.toggle("chart-card--filtered", hasContextFilter);

  renderResponseStack("#chart1", aggregateResponseTimeByBorough(responseRows), {
    selectedBorough,
    onBoroughClick: focusBorough,
  });

  renderReviewDotPlot("#chart2", aggregateReviewScoresByRoomType(linkedRows), {
    selectedRoomTypes,
    focusedRoomTypeCsv: _selectedRoomType,
    onRoomTypeClick: focusRoom,
  });

  const preferredData = aggregatePreferredRoomType(dashboardRows);
  renderStackBarChart("#chart3", preferredData, {
    selectedBorough,
    selectedRoomTypes,
    onBoroughClick: focusBorough,
    onSegmentClick: focusBoroughAndRoom,
  });
  buildChart3Legend(preferredData.types);

  updateChart4(sourceFilters);
  updateChart5(sourceFilters, selectedBorough);
  updateChart6(sourceFilters, selectedBorough);

  const neighborhoodOptions = {
    selectedNeighborhood: _selectedNeighborhood,
    onNeighborhoodClick: focusNeighborhood,
  };

  renderListingBubbleMap("#chart12", neighborhoodRows, sourceFilters.borough, neighborhoodOptions);
  renderNeighborhoodBarChart("#chart13", neighborhoodRows, sourceFilters.borough, neighborhoodOptions);

  buildBoroughLegend("shared-borough-legend");
}

function buildChart3Legend(types) {
  const el = document.getElementById("chart3-legend");
  if (!el) return;

  const orderedTypes = types.length ? types : ROOM_TYPE_STACK_ORDER;
  el.innerHTML = orderedTypes
    .map((t) => {
      const color = ROOM_TYPE_COLORS[t] ?? "#888";
      return `<div class="legend-item">
        <div class="legend-rect" style="background:${color}"></div>
        ${t}
      </div>`;
    })
    .join("");
}

function buildBoroughLegend(selector) {
  const el = document.getElementById(selector);
  if (!el) return;
  el.innerHTML = Object.entries(BOROUGH_COLORS)
    .map(([name, color]) => {
      return `<div class="legend-item">
        <div class="legend-rect" style="background:${color}"></div>
        ${name}
      </div>`;
    })
    .join("");
}

function updateChart4(f = getSourceFilters()) {
  if (!allRows) return;
  const heatmapRows = rowsForHeatmap(f);
  const heatmapData = aggregateHeatmap(heatmapRows);

  renderHeatmap("#chart4", heatmapData, {
    roomFilter: _selectedHeatmapCell ? f.roomType : selectedRoomTypesFromFilters(f),
    accFilter: _selectedHeatmapCell
      ? (_manualAccFilter ?? checkedValues(document.getElementById("filter-acc")))
      : checkedValues(document.getElementById("filter-acc")),
    priceBinFilter: _selectedHeatmapCell
      ? (_manualPriceBinFilter ?? checkedValues(document.getElementById("filter-price-bin")))
      : checkedValues(document.getElementById("filter-price-bin")),
    selectedCell: _selectedHeatmapCell,
    onCellClick: focusHeatmapCell,
  });
}

function updateChart5(f = getSourceFilters(), selectedBorough = selectedBoroughFromFilters(f)) {
  if (!allRows) return;
  const rows = baseCheckboxRows(f);
  const pieData = aggregateRatingDistributionByBorough(rows);
  renderRatingPie("#chart5", pieData, {
    selectedBorough,
    onBoroughClick: focusBorough,
  });
}

function updateChart6(f = getSourceFilters(), selectedBorough = selectedBoroughFromFilters(f)) {
  if (!allRows) return;
  const rows = baseCheckboxRows(f);
  const ibData = aggregateInstantBookable(rows);
  const selectedRooms = new Set(selectedRoomTypesFromFilters(f));
  ibData.roomTypes = ibData.roomTypes.filter((rt) => selectedRooms.has(rt));

  renderInstantBookableChart("#chart6", ibData, {
    selectedBorough,
    onBoroughClick: focusBorough,
    onBoroughRoomClick: focusBoroughAndRoom,
  });
}

async function main() {
  fillFilterSelects();

  try {
    allRows = await loadListings();
    captureManualFilters();
    captureManualHeatmapFilters();
    updateCharts();
    buildBoroughLegend("shared-borough-legend");

    filterRoomEl?.addEventListener("change", (e) => {
      _selectedRoomType = null;
      _selectedHeatmapCell = null;
      handleFilterChange(e, filterRoomEl, () => {
        captureManualFilters();
        updateCharts();
      });
    });

    filterBoroughEl?.addEventListener("change", (e) => {
      _selectedBorough = null;
      _selectedNeighborhood = null;
      handleFilterChange(e, filterBoroughEl, () => {
        captureManualFilters();
        updateCharts();
      });
    });

    document.getElementById("filter-acc")?.addEventListener("change", (e) => {
      handleFilterChange(e, document.getElementById("filter-acc"), () => {
        _selectedHeatmapCell = null;
        captureManualHeatmapFilters();
        updateChart4();
      });
    });

    document.getElementById("filter-price-bin")?.addEventListener("change", (e) => {
      handleFilterChange(e, document.getElementById("filter-price-bin"), () => {
        _selectedHeatmapCell = null;
        captureManualHeatmapFilters();
        updateChart4();
      });
    });

    document.getElementById("filter-heatmap-reset")?.addEventListener("click", () => {
      setCheckboxGroup(document.getElementById("filter-acc"), "all");
      setCheckboxGroup(document.getElementById("filter-price-bin"), "all");
      captureManualHeatmapFilters();
      if (_selectedHeatmapCell) {
        _selectedRoomType = null;
        _selectedHeatmapCell = null;
        syncGlobalFiltersToSelection();
        updateCharts();
        return;
      }
      updateChart4();
    });

    document.getElementById("filter-reset")?.addEventListener("click", () => {
      resetDashboardFilters();
      updateCharts();
    });
  } catch (e) {
    console.error(e);
  }
}

main();
