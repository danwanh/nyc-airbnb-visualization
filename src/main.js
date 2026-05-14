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
  if (filterRoomEl && filterRoomEl.options.length === 0) {
    filterRoomEl.append(new Option("All room types", "all"));
    for (const rt of ROOM_TYPES) {
      filterRoomEl.append(new Option(rt.label, rt.csv));
    }
  }
  if (filterBoroughEl && filterBoroughEl.options.length === 0) {
    filterBoroughEl.append(new Option("All boroughs", "all"));
    for (const b of BOROUGHS) {
      filterBoroughEl.append(new Option(b, b));
    }
  }
  const filterPriceBinEl = document.getElementById("filter-price-bin");
  if (filterPriceBinEl && filterPriceBinEl.options.length <= 1) {
    for (const b of HEATMAP_PRICE_BINS) {
      filterPriceBinEl.append(new Option(priceBinLabel(b), b.toString()));
    }
  }
}

function getFilters() {
  return {
    roomType: filterRoomEl?.value ?? "all",
    borough: filterBoroughEl?.value ?? "all",
    excludeZero: document.getElementById("filter-exclude-0")?.checked ?? false,
    neighborhood: _selectedNeighborhood ?? "all",
  };
}

let allRows = null;

/** Chart 1 uses room filter only so all boroughs stay visible; chart 2 uses room + borough. */
function rowsForChart1(f) {
  return filterListings(allRows, {
    roomType: f.roomType,
    borough: "all",
    excludeZero: f.excludeZero,
    neighborhood: f.neighborhood, 
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

  const parts = [
    `Listings: ${r2.length.toLocaleString()} / ${allRows.length.toLocaleString()}`,
  ];
  if (f.roomType !== "all")
    parts.push(document.querySelector("#filter-room option:checked")?.text ?? "");
  if (f.borough !== "all") parts.push(f.borough);
  if (_selectedNeighborhood) parts.push(`📍 ${_selectedNeighborhood}`);
  
  setStatus(parts.join(" · "));

  chart2CardEl?.classList.toggle("chart-card--filtered", f.borough !== "all" || _selectedNeighborhood);

  if (chart2HintEl) {
    let hint = "";
    if (f.borough !== "all") hint = `Showing listings in ${f.borough}. `;
    if (_selectedNeighborhood) hint += `Filtered by neighborhood: ${_selectedNeighborhood}. Click neighborhood again to clear.`;
    chart2HintEl.textContent = hint;
    chart2HintEl.hidden = !hint;
  }

  const responseData = aggregateResponseTimeByBorough(r1);
  const selectedBorough = f.borough === "all" ? null : f.borough;

  renderResponseStack("#chart1", responseData, {
    selectedBorough,
    onBoroughClick: (borough) => {
      if (!filterBoroughEl) return;
      const next = filterBoroughEl.value === borough ? "all" : borough;
      filterBoroughEl.value = next;
      // Reset neighborhood when changing borough
      _selectedNeighborhood = null;
      updateCharts();
    },
  });

  const reviewData = aggregateReviewScoresByRoomType(r2);
  renderReviewDotPlot("#chart2", reviewData);

  // Chart 3 — preferred room type
  const preferredData = aggregatePreferredRoomType(r2);
  renderStackBarChart("#chart3", preferredData);
  buildChart3Legend(preferredData.types);

  // Chart 5 - Rating Pie
  const pieData = aggregateRatingDistribution(r2);
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

  renderListingBubbleMap("#chart12", allRows, borough, neighborhoodOptions);
  renderNeighborhoodBarChart("#chart13", allRows, borough, neighborhoodOptions);
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
  // Also filter chart 4 by neighborhood if selected
  const r4 = _selectedNeighborhood 
    ? r1.filter(r => r.neighbourhood_cleansed === _selectedNeighborhood)
    : r1;
    
  const heatmapData = aggregateHeatmap(r4);
  renderHeatmap("#chart4", heatmapData, {
    roomFilter: f.roomType,
    accFilter: document.getElementById("filter-acc")?.value ?? "all",
    priceBinFilter: document.getElementById("filter-price-bin")?.value ?? "all",
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

    // Event Listeners
    document.getElementById("filter-room")?.addEventListener("change", () => {
      _selectedNeighborhood = null;
      updateCharts();
    });
    document.getElementById("filter-borough")?.addEventListener("change", () => {
      _selectedNeighborhood = null;
      updateCharts();
    });
    document.getElementById("filter-exclude-0")?.addEventListener("change", updateCharts);

    document.getElementById("filter-acc")?.addEventListener("change", updateChart4);
    document.getElementById("filter-price-bin")?.addEventListener("change", updateChart4);

    document.getElementById("filter-heatmap-reset")?.addEventListener("click", () => {
      if (document.getElementById("filter-acc")) document.getElementById("filter-acc").value = "all";
      if (document.getElementById("filter-price-bin")) document.getElementById("filter-price-bin").value = "all";
      updateChart4();
    });

    document.getElementById("filter-reset")?.addEventListener("click", () => {
      if (document.getElementById("filter-room")) document.getElementById("filter-room").value = "all";
      if (document.getElementById("filter-borough")) document.getElementById("filter-borough").value = "all";
      if (document.getElementById("filter-acc")) document.getElementById("filter-acc").value = "all";
      if (document.getElementById("filter-price-bin")) document.getElementById("filter-price-bin").value = "all";
      if (document.getElementById("filter-exclude-0")) document.getElementById("filter-exclude-0").checked = false;
      _selectedNeighborhood = null;
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
