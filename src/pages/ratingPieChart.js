import * as d3 from "d3";
import { chartTooltip, formatTooltip } from "../components/tooltip.js";
import { CHROME, RATING_COLORS } from "../utils/palette.js";

/** Rating group labels for legend */
const RATING_LABELS = [
  { key: "high", group: "High (>=4.5)" },
  { key: "mid", group: "Mid (4.0-4.5)" },
  { key: "low", group: "Low (<4.0)" },
];

/** Ordered list of NYC boroughs */
const BOROUGH_ORDER = [
  "Bronx",
  "Brooklyn",
  "Manhattan",
  "Queens",
  "Staten Island",
];

/**
 * Render 5 small-multiple pie charts — one per NYC borough — showing
 * rating distribution (high / mid / low).
 *
 * @param {string} containerSelector  CSS selector of the <svg>
 * @param {Object<string, Array<{ group: string, key: string, count: number }>>} data
 *   Object keyed by borough name; each value is an array from
 *   aggregateRatingDistributionByBorough.
 * @param {object} [options]
 * @param {string|null} [options.selectedBorough]  Currently selected borough (for highlighting)
 * @param {string[]} [options.visibleBoroughs]  Borough columns to draw (checkbox filter); default all five
 * @param {function}     [options.onBoroughClick]   Called with borough name when a pie is clicked
 */
export function renderRatingPie(containerSelector, data, options = {}) {
  const {
    selectedBorough = null,
    onBoroughClick,
    visibleBoroughs: visibleBoroughsOpt,
  } = options;

  let columns;
  if (visibleBoroughsOpt === undefined) {
    columns = BOROUGH_ORDER;
  } else if (!Array.isArray(visibleBoroughsOpt) || visibleBoroughsOpt.length === 0) {
    columns = null;
  } else {
    columns = visibleBoroughsOpt;
  }

  const svg = d3.select(containerSelector);
  svg.selectAll("*").remove();

  if (columns === null) {
    const W0 = 480;
    const H0 = 100;
    svg
      .attr("class", "chart-svg")
      .attr("viewBox", `0 0 ${W0} ${H0}`)
      .attr("width", "100%")
      .attr("preserveAspectRatio", "xMidYMid meet")
      .attr("style", "display:block;max-width:100%;height:auto")
      .append("text")
      .attr("x", W0 / 2)
      .attr("y", H0 / 2)
      .attr("text-anchor", "middle")
      .attr("fill", CHROME.tick)
      .attr("font-size", 13)
      .text("Select at least one borough and room type in the filters.");
    return;
  }

  /* ── Dynamic layout: cap total band width; cell & radius derived from borough count ── */
  const COLS = columns.length;
  const PAD_X = 14;
  /** Max horizontal span (viewBox units) for the pie row — pies grow when COLS is small. */
  const MAX_BAND_W = 880;
  const CELL_W = Math.max(96, Math.floor(MAX_BAND_W / COLS));
  const bandW = CELL_W * COLS;
  const W = bandW + PAD_X * 2;
  const PIE_RADIUS = Math.min(86, Math.max(38, CELL_W * 0.36));
  const TITLE_H = Math.max(18, Math.round(PIE_RADIUS * 0.32));
  const PIE_AREA_H = PIE_RADIUS * 2 + 12;
  const LEGEND_H = 28;
  const PAD_TOP = 8;
  const PAD_BOTTOM = 8;
  const H = PAD_TOP + TITLE_H + PIE_AREA_H + LEGEND_H + PAD_BOTTOM;

  const titleFont = Math.max(10, Math.min(13, 8 + CELL_W / 26));
  const wedgeLabelFont = Math.max(8, Math.min(11, PIE_RADIUS * 0.17));
  const pathStroke = Math.max(1.2, Math.min(2.5, PIE_RADIUS / 32));

  svg
    .attr("class", "chart-svg chart-svg--rating-pie-fixed")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("width", "100%")
    .attr("preserveAspectRatio", "xMidYMid meet")
    .attr("style", "display:block;height:auto");

  const pie = d3
    .pie()
    .value((d) => d.count)
    .sort(null);

  const arc = d3.arc().innerRadius(0).outerRadius(PIE_RADIUS);

  const MIN_ANGLE = (20 * Math.PI) / 180; // ~0.349 rad

  /* ── Render each borough ── */
  columns.forEach((borough, i) => {
    const cx = PAD_X + i * CELL_W + CELL_W / 2;
    const cy = PAD_TOP + TITLE_H + PIE_AREA_H / 2;

    const boroughData = data[borough] || [];
    const total = d3.sum(boroughData, (d) => d.count);

    // Dim non-selected boroughs when a borough is selected
    const isDimmed = selectedBorough && selectedBorough !== borough;
    const isActive = selectedBorough === borough;

    // Borough title (clickable)
    svg
      .append("text")
      .attr("x", cx)
      .attr("y", PAD_TOP + TITLE_H / 2 + 2)
      .attr("text-anchor", "middle")
      .attr("fill", isActive ? "#1d4ed8" : CHROME.tick)
      .attr("font-size", isActive ? titleFont + 1 : titleFont)
      .attr("font-weight", 600)
      .attr("cursor", onBoroughClick ? "pointer" : "default")
      .attr("text-decoration", isActive ? "underline" : "none")
      .text(borough)
      .on("click", () => {
        if (onBoroughClick) onBoroughClick(borough);
      });

    // Empty-state
    if (!boroughData.length || total === 0) {
      svg
        .append("text")
        .attr("x", cx)
        .attr("y", cy)
        .attr("text-anchor", "middle")
        .attr("fill", CHROME.tick)
        .attr("font-size", Math.max(9, Math.min(12, titleFont)))
        .attr("opacity", isDimmed ? 0.3 : 1)
        .text("No data");
      return;
    }

    const g = svg
      .append("g")
      .attr("transform", `translate(${cx},${cy})`)
      .attr("opacity", isDimmed ? 0.3 : 1);

    const arcs = pie(boroughData);

    // Wedges
    g.selectAll("path")
      .data(arcs)
      .join("path")
      .attr("d", arc)
      .attr("fill", (d) => RATING_COLORS[d.data.key])
      .attr("stroke", "#fff")
      .attr("stroke-width", pathStroke)
      .attr("cursor", "pointer")
      .on("click", () => {
        if (onBoroughClick) onBoroughClick(borough);
      })
      .on("mouseenter", (event, d) => {
        const pct = ((d.data.count / total) * 100).toFixed(1);
        chartTooltip.show(
          formatTooltip({
            title: borough,
            rows: [
              { label: "Group", value: d.data.group },
              { label: "Listings", value: d3.format(",")(d.data.count) },
              { label: "% of total rating", value: `${pct}%` },
            ],
          }),
          event.clientX,
          event.clientY,
        );
      })
      .on("mousemove", (event) => {
        chartTooltip.move(event.clientX, event.clientY);
      })
      .on("mouseleave", () => {
        chartTooltip.hide();
      });

    // Percentage labels inside wedge (only if arc angle > 20°)
    g.selectAll("text")
      .data(arcs)
      .join("text")
      .attr("transform", (d) => `translate(${arc.centroid(d)})`)
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("fill", "#fff")
      .attr("font-size", wedgeLabelFont)
      .attr("font-weight", 600)
      .attr("pointer-events", "none")
      .text((d) => {
        if (d.endAngle - d.startAngle < MIN_ANGLE) return "";
        return `${((d.data.count / total) * 100).toFixed(1)}%`;
      });
  });

  /* ── Shared legend ── */
  const legendY = PAD_TOP + TITLE_H + PIE_AREA_H + 6;
  const legendG = svg
    .append("g")
    .attr("transform", `translate(${W / 2}, ${legendY})`);

  const ITEM_W = 130; // width reserved per legend item
  const startX = -(RATING_LABELS.length * ITEM_W) / 2;

  // RATING_LABELS.forEach((item, i) => {
  //   const x = startX + i * ITEM_W;

  //   legendG
  //     .append("rect")
  //     .attr("x", x)
  //     .attr("y", 0)
  //     .attr("width", 12)
  //     .attr("height", 12)
  //     .attr("rx", 2)
  //     .attr("fill", RATING_COLORS[item.key]);

  //   legendG
  //     .append("text")
  //     .attr("x", x + 16)
  //     .attr("y", 10)
  //     .attr("fill", CHROME.tick)
  //     .attr("font-size", 11)
  //     .text(item.group);
  // });
}
