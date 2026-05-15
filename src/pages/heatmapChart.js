import {
  HEATMAP_ROOMS,
  HEATMAP_ACC_GROUPS,
  HEATMAP_PRICE_BINS,
  priceBinLabel,
} from "../utils/aggregates.js";
import { chartTooltip, formatTooltip } from "../components/tooltip.js";

import { HEATMAP_COLORS } from "../utils/palette.js";

function heatBg(val, max) {
  if (val === 0) return "transparent";
  const t = val / max;
  const idx = Math.min(
    HEATMAP_COLORS.length - 1,
    Math.floor(t * HEATMAP_COLORS.length),
  );
  return HEATMAP_COLORS[idx];
}

function heatText(val, max) {
  if (val === 0) return "#94a3b8";
  return val / max > 0.6 ? "#ffffff" : "#1f2937";
}

function normalizeFilter(filter, fallback) {
  if (Array.isArray(filter)) return filter;
  if (!filter || filter === "all") return fallback;
  return [filter];
}

function renderLegend(root) {
  const legendEl = document.createElement("div");
  legendEl.className = "heatmap-legend";
  legendEl.innerHTML = `
    <span>Low</span>
    <div class="heatmap-legend-bar" id="hm-legend-bar"></div>
    <span>High</span>`;
  root.appendChild(legendEl);

  const legendBar = legendEl.querySelector("#hm-legend-bar");
  legendBar.innerHTML = Array.from({ length: 20 }, (_, i) => {
    const bg = heatBg(i + 1, 20);
    return `<span style="background:${bg};"></span>`;
  }).join("");
}

/**
 * Render the heatmap into a div container using an HTML table.
 * @param {boolean} [options.dimExternalRoomHighlight] When true, dim heatmap rows for non-highlight room (cross-chart room focus)
 */
export function renderHeatmap(containerSelector, data, options = {}) {
  const root = document.querySelector(containerSelector);
  if (!root) return;
  root.innerHTML = "";

  if (!data || !data.counts) {
    root.textContent = "No data.";
    return;
  }

  const rooms = normalizeFilter(options.roomFilter, HEATMAP_ROOMS);
  const accGroups = normalizeFilter(options.accFilter, HEATMAP_ACC_GROUPS);
  const selectedCell = options.selectedCell ?? null;
  const highlightRoom = options.highlightRoom ?? null;
  const dimExternalRoomHighlight = options.dimExternalRoomHighlight ?? false;
  const onCellClick = options.onCellClick;
  let bins = [...HEATMAP_PRICE_BINS];

  if (Array.isArray(options.priceBinFilter)) {
    const selectedBins = options.priceBinFilter.map((v) => parseInt(v, 10));
    bins = bins.filter((b) => selectedBins.includes(b));
  } else if (options.priceBinFilter && options.priceBinFilter !== "all") {
    const targetBin = parseInt(options.priceBinFilter, 10);
    bins = bins.filter((b) => b === targetBin);
  }

  const tableWrap = document.createElement("div");
  tableWrap.className = "heatmap-table-wrap";
  root.appendChild(tableWrap);

  if (!rooms.length || !accGroups.length || !bins.length) {
    tableWrap.innerHTML =
      '<div class="heatmap-empty">Select at least one room type, accommodates group, and price bin.</div>';
    return;
  }

  let localMax = 0;
  rooms.forEach((room) => {
    accGroups.forEach((acc) => {
      bins.forEach((bin) => {
        const val = data.counts[room]?.[acc]?.[bin] ?? 0;
        if (val > localMax) localMax = val;
      });
    });
  });
  if (localMax === 0) localMax = 1;

  let html = '<table class="heatmap-table"><thead><tr>';
  html += '<th class="col-type">Room Type</th>';
  html += '<th class="col-acc">Accommodates</th>';
  bins.forEach((bin) => {
    html += `<th>${priceBinLabel(bin)}</th>`;
  });
  html += "</tr></thead><tbody>";

  rooms.forEach((room) => {
    const rowRoomDimmed =
      dimExternalRoomHighlight &&
      !selectedCell &&
      highlightRoom &&
      room !== highlightRoom;
    accGroups.forEach((acc, ai) => {
      html += "<tr>";
      if (ai === 0) {
        const tlClass = ["type-label", rowRoomDimmed ? "is-dimmed" : ""]
          .filter(Boolean)
          .join(" ");
        html += `<td class="${tlClass}" rowspan="${accGroups.length}">${room}</td>`;
      }
      const accClass = ["acc-label", rowRoomDimmed ? "is-dimmed" : ""]
        .filter(Boolean)
        .join(" ");
      html += `<td class="${accClass}">${acc}</td>`;

      bins.forEach((bin) => {
        const val = data.counts[room]?.[acc]?.[bin] ?? 0;
        const bg = heatBg(val, localMax);
        const col = heatText(val, localMax);
        const txt = val > 0 ? val.toLocaleString() : "";
        const isSelected =
          selectedCell &&
          selectedCell.room === room &&
          selectedCell.acc === acc &&
          selectedCell.bin === bin;
        const cellClass = [
          isSelected ? "is-selected" : "",
          selectedCell && !isSelected ? "is-dimmed" : "",
          rowRoomDimmed ? "is-dimmed" : "",
        ]
          .filter(Boolean)
          .join(" ");

        html += `<td class="${cellClass}" style="background:${bg};color:${col};"
                     data-room="${room}" data-acc="${acc}" data-bin="${bin}" data-val="${val}">
                  ${txt}
                 </td>`;
      });

      html += "</tr>";
    });
  });

  html += "</tbody></table>";
  tableWrap.innerHTML = html;
  renderLegend(root);

  const tooltipFor = (room, acc, bin, val) =>
    formatTooltip({
      title: "Heatmap cell",
      rows: [
        { label: "accommodates_group", value: acc },
        { label: "room_type", value: room },
        { label: "price", value: priceBinLabel(bin) },
        { label: "Number of listings", value: val.toLocaleString() },
      ],
    });

  tableWrap.querySelectorAll("tbody td[data-val]").forEach((cell) => {
    const val = parseInt(cell.getAttribute("data-val") || "0", 10);
    const room = cell.getAttribute("data-room");
    const acc = cell.getAttribute("data-acc");
    const bin = parseInt(cell.getAttribute("data-bin"), 10);
    cell.style.cursor = onCellClick ? "pointer" : "default";

    cell.addEventListener("mouseenter", (e) => {
      chartTooltip.show(tooltipFor(room, acc, bin, val), e.clientX, e.clientY);
    });
    cell.addEventListener("mousemove", (e) =>
      chartTooltip.move(e.clientX, e.clientY),
    );
    cell.addEventListener("mouseleave", () => chartTooltip.hide());
    cell.addEventListener("click", (e) => {
      e.stopPropagation();
      onCellClick?.({ room, acc, bin, value: val });
      chartTooltip.show(tooltipFor(room, acc, bin, val), e.clientX, e.clientY);
    });
  });
}
