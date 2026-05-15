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
  filterRowsMatchingHeatmapCell,
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
let _manualAccFilter = null;
let _manualPriceBinFilter = null;
let _manualRoomFilter = null;
let _manualBoroughFilter = null;

/** Which chart set borough / neighbourhood selection (dim only on that chart). */
let _lastBoroughChartSource = null;
let _lastNeighborhoodChartSource = null;
/** Borough × room combined selection: stack vs instant bookable (infer when both set). */
let _lastBoroughRoomSource = null;

const SEL_RESPONSE = "c1-response";
const SEL_REVIEW = "c2-review";
const SEL_STACK = "c3-stack";
const SEL_HEATMAP = "c4-heatmap";
const SEL_PIE = "c5-pie";
const SEL_INSTANT = "c6-instant";
const SEL_MAP = "c12-map";
const SEL_NHOOD_BAR = "c13-nhoodbar";

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

function captureManualRoomFilter() {
  _manualRoomFilter = checkedValues(filterRoomEl);
}

function captureManualBoroughFilter() {
  _manualBoroughFilter = checkedValues(filterBoroughEl);
}

function captureManualCommonFilters() {
  captureManualRoomFilter();
  captureManualBoroughFilter();
}

function getManualCommonFilters() {
  return {
    roomType: _manualRoomFilter ?? checkedValues(filterRoomEl),
    borough: _manualBoroughFilter ?? checkedValues(filterBoroughEl),
  };
}

function syncCommonFiltersToActiveSelection() {
  const activeRoom = _selectedRoomType;
  const activeBorough = _selectedBorough ?? neighborhoodBorough(_selectedNeighborhood);

  setCheckboxGroup(filterRoomEl, activeRoom ? [activeRoom] : (_manualRoomFilter ?? "all"));
  setCheckboxGroup(filterBoroughEl, activeBorough ? [activeBorough] : (_manualBoroughFilter ?? "all"));
}

function captureManualHeatmapFilters() {
  _manualAccFilter = checkedValues(document.getElementById("filter-acc"));
  _manualPriceBinFilter = checkedValues(document.getElementById("filter-price-bin"));
}

function getSourceFilters() {
  return getManualCommonFilters();
}

function listingFilterForCharts(f) {
  return {
    roomType: _selectedRoomType ? [_selectedRoomType] : f.roomType,
    borough: _selectedBorough ? [_selectedBorough] : f.borough,
    neighborhood: _selectedNeighborhood ?? "all",
  };
}

/** Checkbox sidebar only — no chart-driven narrowing (metrics unchanged on source chart). */
function checkboxOnlyListingFilter(f) {
  return {
    roomType: f.roomType,
    borough: f.borough,
    neighborhood: "all",
  };
}

function rowsCheckboxOnly(f) {
  return filterListings(allRows, checkboxOnlyListingFilter(f));
}

/** Heatmap room rows: checkbox list, or the single room when a cell / chart room is focused (matches aggregated rows). */
function heatmapRoomFilterForDisplay(f) {
  if (_selectedHeatmapCell) return [_selectedHeatmapCell.room];
  if (_selectedRoomType) return [_selectedRoomType];
  return f.roomType;
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

function clearHeatmapSelection({ clearLinkedRoom = true, restoreControls = true } = {}) {
  const hadHeatmapSelection = Boolean(_selectedHeatmapCell);
  _selectedHeatmapCell = null;

  if (hadHeatmapSelection && clearLinkedRoom) {
    _selectedRoomType = null;
  }

  if (restoreControls) {
    syncHeatmapFiltersToSelection();
  }

  return hadHeatmapSelection;
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

function inferSelectionSource() {
  if (_selectedHeatmapCell) return SEL_HEATMAP;
  if (_selectedNeighborhood) return _lastNeighborhoodChartSource ?? SEL_MAP;
  if (_selectedBorough && _selectedRoomType)
    return _lastBoroughRoomSource ?? SEL_STACK;
  if (_selectedRoomType) return SEL_REVIEW;
  if (_selectedBorough) return _lastBoroughChartSource ?? SEL_RESPONSE;
  return null;
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

function focusRoom(roomType) {
  _lastBoroughRoomSource = null;
  _selectedRoomType = _selectedRoomType === roomType ? null : roomType;
  clearHeatmapSelection({ clearLinkedRoom: false });
  syncCommonFiltersToActiveSelection();
  updateCharts();
}

function focusBorough(borough, source) {
  _lastBoroughRoomSource = null;
  clearHeatmapSelection();
  _selectedBorough = _selectedBorough === borough ? null : borough;
  _selectedNeighborhood = null;
  if (_selectedBorough) _lastBoroughChartSource = source;
  else _lastBoroughChartSource = null;
  syncCommonFiltersToActiveSelection();
  updateCharts();
}

function focusBoroughAndRoom(borough, roomType, source = SEL_STACK) {
  const isSameSelection = _selectedBorough === borough && _selectedRoomType === roomType;
  _selectedNeighborhood = null;
  clearHeatmapSelection({ clearLinkedRoom: false });
  _selectedBorough = isSameSelection ? null : borough;
  _selectedRoomType = isSameSelection ? null : roomType;
  if (!isSameSelection && _selectedBorough) {
    _lastBoroughChartSource = source;
    _lastBoroughRoomSource = source;
  }
  if (isSameSelection) {
    _lastBoroughChartSource = null;
    _lastBoroughRoomSource = null;
  }
  syncCommonFiltersToActiveSelection();
  updateCharts();
}

function focusNeighborhood(neighborhood, borough = null, source = SEL_MAP) {
  _lastBoroughRoomSource = null;
  clearHeatmapSelection();
  _selectedNeighborhood = _selectedNeighborhood === neighborhood ? null : neighborhood;
  _selectedBorough = _selectedNeighborhood ? borough : null;
  if (_selectedNeighborhood) _lastNeighborhoodChartSource = source;
  else _lastNeighborhoodChartSource = null;
  syncCommonFiltersToActiveSelection();
  updateCharts();
}

function focusHeatmapCell(cell) {
  const sameCell =
    _selectedHeatmapCell &&
    _selectedHeatmapCell.room === cell.room &&
    _selectedHeatmapCell.acc === cell.acc &&
    _selectedHeatmapCell.bin === cell.bin;

  _lastBoroughRoomSource = null;
  _selectedHeatmapCell = sameCell ? null : cell;
  _selectedRoomType = sameCell ? null : cell.room;
  syncCommonFiltersToActiveSelection();
  syncHeatmapFiltersToSelection();
  updateCharts();
}

function rowsForResponseOverview(f) {
  return filterListings(allRows, listingFilterForCharts(f));
}

function rowsForDashboard(f) {
  return filterListings(allRows, listingFilterForCharts(f));
}

/** Same listing scope as other aggregates (checkbox ∩ chart selection). */
function rowsForLinkedCharts(f) {
  return filterListings(allRows, listingFilterForCharts(f));
}

function rowsForNeighborhoodViews(f) {
  return rowsForLinkedCharts(f);
}

function rowsForAllBoroughComparison(f) {
  return rowsForLinkedCharts(f);
}

function rowsForHeatmap(f) {
  let rows = filterListings(allRows, listingFilterForCharts(f));
  if (_selectedHeatmapCell) {
    rows = filterRowsMatchingHeatmapCell(rows, _selectedHeatmapCell);
  }
  return rows;
}

function updateCharts() {
  if (!allRows) return;

  chartTooltip.hide();

  const selectionSource = inferSelectionSource();
  const dim = (id) => selectionSource === id;

  const sourceFilters = getSourceFilters();
  const selectedBorough = selectedBoroughFromFilters(sourceFilters);
  const responseRows =
    selectionSource === SEL_RESPONSE
      ? rowsCheckboxOnly(sourceFilters)
      : rowsForResponseOverview(sourceFilters);
  const dashboardRows =
    selectionSource === SEL_STACK
      ? rowsCheckboxOnly(sourceFilters)
      : rowsForDashboard(sourceFilters);
  const linkedRows =
    selectionSource === SEL_REVIEW
      ? rowsCheckboxOnly(sourceFilters)
      : rowsForLinkedCharts(sourceFilters);
  const neighborhoodRowsMap =
    selectionSource === SEL_MAP
      ? rowsCheckboxOnly(sourceFilters)
      : rowsForNeighborhoodViews(sourceFilters);
  const neighborhoodRowsBar =
    selectionSource === SEL_NHOOD_BAR
      ? rowsCheckboxOnly(sourceFilters)
      : rowsForNeighborhoodViews(sourceFilters);
  const focusedRoomType = _selectedRoomType;

  const hasContextFilter = Boolean(
    _selectedBorough ||
      _selectedRoomType ||
      _selectedNeighborhood ||
      _selectedHeatmapCell,
  );
  chart2CardEl?.classList.toggle("chart-card--filtered", hasContextFilter);

  renderResponseStack("#chart1", aggregateResponseTimeByBorough(responseRows), {
    selectedBorough,
    dimSelection: dim(SEL_RESPONSE),
    onBoroughClick: (b) => focusBorough(b, SEL_RESPONSE),
  });

  renderReviewDotPlot("#chart2", aggregateReviewScoresByRoomType(linkedRows), {
    checkedRoomTypes: sourceFilters.roomType,
    focusedRoomType,
    dimSelection: dim(SEL_REVIEW),
    onRoomTypeClick: focusRoom,
  });

  const preferredData = aggregatePreferredRoomType(dashboardRows);
  renderStackBarChart("#chart3", preferredData, {
    selectedBorough,
    focusedRoomType,
    dimSelection: dim(SEL_STACK),
    onBoroughClick: (b) => focusBorough(b, SEL_STACK),
    onSegmentClick: focusBoroughAndRoom,
  });
  buildChart3Legend(preferredData.types);

  updateChart4(sourceFilters, dim(SEL_HEATMAP));

  updateChart5(sourceFilters, selectedBorough, dim(SEL_PIE), selectionSource);
  updateChart6(sourceFilters, selectedBorough, dim(SEL_INSTANT), selectionSource);

  const neighborhoodOptsBase = {
    selectedNeighborhood: _selectedNeighborhood,
    selectedBorough: _selectedBorough,
  };

  renderListingBubbleMap("#chart12", neighborhoodRowsMap, sourceFilters.borough, {
    ...neighborhoodOptsBase,
    dimSelection: dim(SEL_MAP),
    onNeighborhoodClick: (n, b) => focusNeighborhood(n, b, SEL_MAP),
  });
  renderNeighborhoodBarChart("#chart13", neighborhoodRowsBar, sourceFilters.borough, {
    ...neighborhoodOptsBase,
    dimSelection: dim(SEL_NHOOD_BAR),
    onNeighborhoodClick: (n, b) => focusNeighborhood(n, b, SEL_NHOOD_BAR),
  });

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

function updateChart4(f = getSourceFilters(), dimExternalRoomHighlight = false) {
  if (!allRows) return;
  const selectionSource = inferSelectionSource();
  const heatmapSelf = selectionSource === SEL_HEATMAP;

  const heatmapRows = heatmapSelf
    ? rowsCheckboxOnly(f)
    : rowsForHeatmap(f);
  const heatmapData = aggregateHeatmap(heatmapRows);

  const accFilter =
    heatmapSelf && _selectedHeatmapCell
      ? "all"
      : _selectedHeatmapCell
        ? (_manualAccFilter ?? checkedValues(document.getElementById("filter-acc")))
        : checkedValues(document.getElementById("filter-acc"));
  const priceBinFilter =
    heatmapSelf && _selectedHeatmapCell
      ? "all"
      : _selectedHeatmapCell
        ? (_manualPriceBinFilter ?? checkedValues(document.getElementById("filter-price-bin")))
        : checkedValues(document.getElementById("filter-price-bin"));

  const roomFilter =
    heatmapSelf && _selectedHeatmapCell ? f.roomType : heatmapRoomFilterForDisplay(f);

  renderHeatmap("#chart4", heatmapData, {
    dimExternalRoomHighlight,
    roomFilter,
    accFilter,
    priceBinFilter,
    selectedCell: _selectedHeatmapCell,
    highlightRoom:
      !_selectedHeatmapCell && _selectedRoomType ? _selectedRoomType : null,
    onCellClick: focusHeatmapCell,
  });
}

/** Borough columns for pies / IB: one column when another chart drives borough; full strip when that chart is the selection source. */
function boroughsToShowForSelection(f, selectionSource) {
  if (selectionSource === SEL_PIE || selectionSource === SEL_INSTANT) {
    return f.borough;
  }
  if (_selectedBorough && f.borough.includes(_selectedBorough)) return [_selectedBorough];
  return f.borough;
}

function updateChart5(
  f = getSourceFilters(),
  selectedBorough = selectedBoroughFromFilters(f),
  dimSelection = false,
  selectionSource = inferSelectionSource(),
) {
  if (!allRows) return;
  const rows =
    selectionSource === SEL_PIE
      ? rowsCheckboxOnly(f)
      : rowsForAllBoroughComparison(f);
  const pieData = aggregateRatingDistributionByBorough(rows);
  renderRatingPie("#chart5", pieData, {
    selectedBorough,
    dimSelection,
    visibleBoroughs: boroughsToShowForSelection(f, selectionSource),
    onBoroughClick: (b) => focusBorough(b, SEL_PIE),
  });
}

function updateChart6(
  f = getSourceFilters(),
  selectedBorough = selectedBoroughFromFilters(f),
  dimSelection = false,
  selectionSource = inferSelectionSource(),
) {
  if (!allRows) return;
  const rows =
    selectionSource === SEL_INSTANT
      ? rowsCheckboxOnly(f)
      : rowsForAllBoroughComparison(f);
  const ibData = aggregateInstantBookable(rows);
  const checkedRooms = new Set(f.roomType);
  const checkedBoroughs = new Set(boroughsToShowForSelection(f, selectionSource));
  ibData.roomTypes = ibData.roomTypes.filter((rt) => checkedRooms.has(rt));
  ibData.boroughs = BOROUGHS.filter((b) => checkedBoroughs.has(b));

  renderInstantBookableChart("#chart6", ibData, {
    selectedBorough,
    dimSelection,
    focusedRoomType: _selectedRoomType,
    onBoroughClick: (b) => focusBorough(b, SEL_INSTANT),
    onBoroughRoomClick: (b, r) => focusBoroughAndRoom(b, r, SEL_INSTANT),
  });
}

async function main() {
  fillFilterSelects();

  try {
    allRows = await loadListings();
    captureManualCommonFilters();
    captureManualHeatmapFilters();
    updateCharts();
    buildBoroughLegend("shared-borough-legend");

    filterRoomEl?.addEventListener("change", (e) => {
      _selectedRoomType = null;
      _lastBoroughRoomSource = null;
      clearHeatmapSelection({ clearLinkedRoom: false });
      handleFilterChange(e, filterRoomEl, () => {
        captureManualRoomFilter();
        updateCharts();
      });
    });

    filterBoroughEl?.addEventListener("change", (e) => {
      clearHeatmapSelection();
      _selectedBorough = null;
      _selectedNeighborhood = null;
      _lastBoroughChartSource = null;
      _lastNeighborhoodChartSource = null;
      _lastBoroughRoomSource = null;
      handleFilterChange(e, filterBoroughEl, () => {
        captureManualBoroughFilter();
        updateCharts();
      });
    });

    document.getElementById("filter-acc")?.addEventListener("change", (e) => {
      handleFilterChange(e, document.getElementById("filter-acc"), () => {
        const hadHeatmapSelection = clearHeatmapSelection({ restoreControls: false });
        captureManualHeatmapFilters();
        if (hadHeatmapSelection) {
          syncCommonFiltersToActiveSelection();
          updateCharts();
        } else {
          updateChart4();
        }
      });
    });

    document.getElementById("filter-price-bin")?.addEventListener("change", (e) => {
      handleFilterChange(e, document.getElementById("filter-price-bin"), () => {
        const hadHeatmapSelection = clearHeatmapSelection({ restoreControls: false });
        captureManualHeatmapFilters();
        if (hadHeatmapSelection) {
          syncCommonFiltersToActiveSelection();
          updateCharts();
        } else {
          updateChart4();
        }
      });
    });

    document.getElementById("filter-heatmap-reset")?.addEventListener("click", () => {
      setCheckboxGroup(document.getElementById("filter-acc"), "all");
      setCheckboxGroup(document.getElementById("filter-price-bin"), "all");
      const hadHeatmapSelection = clearHeatmapSelection({ restoreControls: false });
      captureManualHeatmapFilters();
      if (hadHeatmapSelection) {
        syncCommonFiltersToActiveSelection();
        updateCharts();
        return;
      }
      updateChart4();
    });

    document.getElementById("filter-reset")?.addEventListener("click", () => {
      setCheckboxGroup(filterRoomEl, "all");
      setCheckboxGroup(filterBoroughEl, "all");
      setCheckboxGroup(document.getElementById("filter-acc"), "all");
      setCheckboxGroup(document.getElementById("filter-price-bin"), "all");
      _selectedBorough = null;
      _selectedRoomType = null;
      _selectedNeighborhood = null;
      _selectedHeatmapCell = null;
      _lastBoroughChartSource = null;
      _lastNeighborhoodChartSource = null;
      _lastBoroughRoomSource = null;
      captureManualCommonFilters();
      captureManualHeatmapFilters();
      updateCharts();
    });
  } catch (e) {
    console.error(e);
  }
}

main();
