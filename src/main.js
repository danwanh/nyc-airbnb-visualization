import { loadListings } from "./utils/loadListings.js";
import {
  aggregateResponseTimeByBorough,
  aggregateReviewScoresByRoomType,
  filterListings,
  BOROUGHS,
  ROOM_TYPES,
} from "./utils/aggregates.js";
import { renderResponseStack } from "./pages/responseStackChart.js";
import { renderReviewDotPlot } from "./pages/reviewDotPlotChart.js";
import { chartTooltip } from "./components/tooltip.js";
import { renderNeighbourhoodDensityBubbleMap } from "./pages/neighbourhoodDensityBubbleMap.js";
import { renderNeighbourhoodMedianPriceBarChart } from "./pages/neighbourhoodMedianPriceBarChart.js";

// ── DOM refs ─────────────────────────────────────────────────
const statusEl = document.getElementById("chart-status");
const filterRoomEl = document.getElementById("filter-room");
const filterBoroughEl = document.getElementById("filter-borough");
const filterResetEl = document.getElementById("filter-reset");
const chart2CardEl = document.getElementById("chart2-card");
const chart2HintEl = document.getElementById("chart2-borough-hint");
const chart12El = document.getElementById("chart12");
const chart13El = document.getElementById("chart13");

let allRows = null;
let selectedNeighborhood = null;

// ── Helpers ──────────────────────────────────────────────────
function setStatus(message, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function fillFilterSelects() {
  if (filterRoomEl && filterRoomEl.options.length === 0) {
    filterRoomEl.append(new Option("All room types", "all"));
    for (const rt of ROOM_TYPES)
      filterRoomEl.append(new Option(rt.label, rt.csv));
  }
  if (filterBoroughEl && filterBoroughEl.options.length === 0) {
    filterBoroughEl.append(new Option("All boroughs", "all"));
    for (const b of BOROUGHS) filterBoroughEl.append(new Option(b, b));
  }
}

function getFilters() {
  return {
    roomType: filterRoomEl?.value ?? "all",
    borough: filterBoroughEl?.value ?? "all",
  };
}

// ── Chart 1 & 2 update ───────────────────────────────────────
function updateCharts() {
  if (!allRows) return;
  chartTooltip.hide();

  const f = getFilters();
  let r1 = filterListings(allRows, { roomType: f.roomType, borough: "all" });
  let r2 = filterListings(allRows, f);
  if (selectedNeighborhood) {
    r1 = r1.filter(
      (row) => row.neighbourhood_cleansed === selectedNeighborhood,
    );
    r2 = r2.filter(
      (row) => row.neighbourhood_cleansed === selectedNeighborhood,
    );
  }

  const parts = [
    `Chart 2: ${r2.length.toLocaleString()} / ${allRows.length.toLocaleString()} listings`,
  ];
  if (f.roomType !== "all")
    parts.push(
      document.querySelector("#filter-room option:checked")?.text ?? "",
    );
  if (f.borough !== "all") parts.push(f.borough);
  if (selectedNeighborhood) parts.push(selectedNeighborhood);
  setStatus(parts.join(" · "));

  chart2CardEl?.classList.toggle(
    "chart-card--filtered",
    f.borough !== "all" || !!selectedNeighborhood,
  );

  if (chart2HintEl) {
    chart2HintEl.textContent = selectedNeighborhood
      ? `Filtering by neighborhood ${selectedNeighborhood}. Clear selection or change borough to reset.`
      : f.borough === "all"
        ? ""
        : `Chart 2 shows listings in ${f.borough} only. Click the same borough on chart 1 or set "All boroughs" to clear.`;
    chart2HintEl.hidden = !selectedNeighborhood && f.borough === "all";
  }

  renderResponseStack("#chart1", aggregateResponseTimeByBorough(r1), {
    selectedBorough: f.borough === "all" ? null : f.borough,
    onBoroughClick: (borough) => {
      if (!filterBoroughEl) return;
      filterBoroughEl.value =
        filterBoroughEl.value === borough ? "all" : borough;
      selectedNeighborhood = null;
      updateAll();
    },
  });

  renderReviewDotPlot("#chart2", aggregateReviewScoresByRoomType(r2));
}

// ── Sheet 12 & 13 update ────────────────────────────────────
function updateSheets() {
  if (!allRows) return;
  const f = getFilters();
  const sheetOptions = {
    selectedNeighborhood,
    onNeighborhoodClick: (neighborhood) => {
      selectedNeighborhood =
        selectedNeighborhood === neighborhood ? null : neighborhood;
      updateAll();
    },
  };
  if (chart12El)
    renderNeighbourhoodDensityBubbleMap(
      chart12El,
      allRows,
      f.borough,
      sheetOptions,
    );
  if (chart13El)
    renderNeighbourhoodMedianPriceBarChart(
      chart13El,
      allRows,
      f.borough,
      sheetOptions,
    );
}

function updateAll() {
  updateCharts();
  updateSheets();
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  setStatus("Loading listings.csv…");
  fillFilterSelects();

  try {
    allRows = await loadListings();
    setStatus(`${allRows.length.toLocaleString()} listings loaded.`);

    // Existing filters (Charts 1 & 2 + Sheets 12 & 13)
    filterRoomEl?.addEventListener("change", () => {
      selectedNeighborhood = null;
      updateAll();
    });
    filterBoroughEl?.addEventListener("change", () => {
      selectedNeighborhood = null;
      updateAll();
    });
    filterResetEl?.addEventListener("click", () => {
      if (filterRoomEl) filterRoomEl.value = "all";
      if (filterBoroughEl) filterBoroughEl.value = "all";
      selectedNeighborhood = null;
      updateAll();
    });

    updateCharts();
    updateSheets();
  } catch (e) {
    console.error(e);
    setStatus(
      "Could not load CSV. Run `npm run dev` and open this page via the dev server (not file://).",
      true,
    );
  }
}

main();
