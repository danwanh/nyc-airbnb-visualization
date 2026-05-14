import * as d3 from "d3";
import { chartTooltip, formatTooltip } from "../components/tooltip.js";
import { CHROME } from "../utils/palette.js";

/** Stacked segment colours */
const IB_COLORS = {
  instant: "#059669", // green — Instant Bookable
  notInstant: "#94a3b8", // muted grey — Requires Approval
};

const IB_LABELS = {
  instant: "Instant Bookable",
  notInstant: "Requires Approval",
};

/**
 * Grouped-stacked bar chart: listing count by Borough × Room Type × Instant Bookable.
 *
 * Layout: 4 facet panels (one per Room Type) laid out horizontally.
 * Within each panel: grouped bars by Borough, each bar stacked by instant / notInstant.
 *
 * @param {string} containerSelector  CSS selector of <svg>
 * @param {{ roomTypes: string[], boroughs: string[], data: object }} aggData
 * @param {object} [options]
 * @param {string|null} [options.selectedBorough]  Currently selected borough
 * @param {function}     [options.onBoroughClick]   Called with borough name when bar is clicked
 */
export function renderInstantBookableChart(
  containerSelector,
  aggData,
  options = {},
) {
  const {
    selectedBorough = null,
    onBoroughClick,
    onBoroughRoomClick,
  } = options;
  const { roomTypes, boroughs, data } = aggData;

  const panelCount = roomTypes.length;
  const panelGap = 40; // gap between panels
  const panelTopPad = 22; // room for panel title above bars
  const margin = { top: 10, right: 20, bottom: 70, left: 52 };

  const panelInnerW = 200;
  const contentW =
    panelCount > 0
      ? panelCount * panelInnerW + Math.max(0, panelCount - 1) * panelGap
      : 0;
  const totalW = Math.max(900, margin.left + contentW + margin.right);
  const totalH = 360;
  const iH = totalH - margin.top - margin.bottom;
  const panelsStartX =
    margin.left +
    Math.max(0, (totalW - margin.left - margin.right - contentW) / 2);

  const runFocus = (borough, roomType) => {
    if (onBoroughRoomClick) onBoroughRoomClick(borough, roomType);
    else onBoroughClick?.(borough);
  };

  const svg = d3.select(containerSelector);
  svg.selectAll("*").remove();

  svg
    .attr("viewBox", `0 0 ${totalW} ${totalH}`)
    .attr("width", "100%")
    .attr("preserveAspectRatio", "xMinYMin meet")
    .attr("style", "display:block;max-width:100%;height:auto");

  // Empty state
  if (!roomTypes.length || !boroughs.length) {
    svg
      .append("text")
      .attr("x", totalW / 2)
      .attr("y", totalH / 2)
      .attr("text-anchor", "middle")
      .attr("fill", CHROME.tick)
      .attr("font-size", 13)
      .text("No data available.");
    return;
  }

  // Global Y scale (shared across panels)
  let globalMax = 0;
  for (const rt of roomTypes) {
    for (const b of boroughs) {
      const t = data[rt]?.[b]?.total ?? 0;
      if (t > globalMax) globalMax = t;
    }
  }
  if (globalMax === 0) globalMax = 1;

  const yScale = d3
    .scaleLinear()
    .domain([0, globalMax])
    .range([iH - panelTopPad, 0])
    .nice();

  // Draw each panel
  roomTypes.forEach((rt, pi) => {
    const px = panelsStartX + pi * (panelInnerW + panelGap);
    const py = margin.top;
    const panel = svg.append("g").attr("transform", `translate(${px},${py})`);

    // Panel title
    panel
      .append("text")
      .attr("x", panelInnerW / 2)
      .attr("y", 12)
      .attr("text-anchor", "middle")
      .attr("fill", CHROME.caption)
      .attr("font-size", 12)
      .attr("font-weight", 600)
      .text(rt);

    const plotG = panel
      .append("g")
      .attr("transform", `translate(0,${panelTopPad})`);
    const plotH = iH - panelTopPad;

    // X scale for boroughs
    const xScale = d3
      .scaleBand()
      .domain(boroughs)
      .range([0, panelInnerW])
      .padding(0.25);

    // Grid lines
    plotG
      .append("g")
      .call(d3.axisLeft(yScale).ticks(5).tickSize(-panelInnerW).tickFormat(""))
      .call((a) => a.select(".domain").remove())
      .call((a) =>
        a
          .selectAll("line")
          .attr("stroke", CHROME.grid)
          .attr("stroke-dasharray", "3,3"),
      );

    // Stacked bars
    for (const borough of boroughs) {
      const cell = data[rt]?.[borough] ?? {
        instant: 0,
        notInstant: 0,
        total: 0,
      };
      const bx = xScale(borough);
      const bw = xScale.bandwidth();

      // Opacity for dimming non-selected boroughs
      const barOpacity =
        selectedBorough && selectedBorough !== borough ? 0.25 : 1;

      // Bottom segment: notInstant
      const niH = yScale(0) - yScale(cell.notInstant);
      const niY = yScale(cell.notInstant);

      plotG
        .append("rect")
        .attr("x", bx)
        .attr("y", niY)
        .attr("width", bw)
        .attr("height", niH)
        .attr("fill", IB_COLORS.notInstant)
        .attr("rx", 2)
        .attr("cursor", "pointer")
        .attr("opacity", barOpacity)
        .on("click", () => {
          runFocus(borough, rt);
        })
        .on("mouseenter", (event) => {
          const pct =
            cell.total > 0
              ? ((cell.notInstant / cell.total) * 100).toFixed(1)
              : "0.0";
          chartTooltip.show(
            formatTooltip({
              title: borough,
              rows: [
                { label: "Room type", value: rt },
                { label: "Status", value: IB_LABELS.notInstant },
                {
                  label: "Number of listings",
                  value: d3.format(",")(cell.notInstant),
                },
              ],
            }),
            event.clientX,
            event.clientY,
          );
        })
        .on("mousemove", (event) =>
          chartTooltip.move(event.clientX, event.clientY),
        )
        .on("mouseleave", () => chartTooltip.hide());

      // Label for notInstant segment
      if (cell.notInstant > 0 && niH > 12) {
        plotG
          .append("text")
          .attr("x", bx + bw / 2)
          .attr("y", niY + niH / 2)
          .attr("dy", "0.35em")
          .attr("text-anchor", "middle")
          .attr("fill", "#fff")
          .attr("font-size", 9)
          .attr("opacity", barOpacity)
          .attr("pointer-events", "none")
          .text(d3.format(",")(cell.notInstant));
      }

      // Top segment: instant (stacked on top of notInstant)
      const iHt = yScale(0) - yScale(cell.instant);
      const iY = niY - iHt;

      plotG
        .append("rect")
        .attr("x", bx)
        .attr("y", iY)
        .attr("width", bw)
        .attr("height", iHt)
        .attr("fill", IB_COLORS.instant)
        .attr("rx", 2)
        .attr("cursor", "pointer")
        .attr("opacity", barOpacity)
        .on("click", () => {
          runFocus(borough, rt);
        })
        .on("mouseenter", (event) => {
          const pct =
            cell.total > 0
              ? ((cell.instant / cell.total) * 100).toFixed(1)
              : "0.0";
          chartTooltip.show(
            formatTooltip({
              title: borough,
              rows: [
                { label: "Room type", value: rt },
                { label: "Status", value: IB_LABELS.instant },
                {
                  label: "Number of listings",
                  value: d3.format(",")(cell.instant),
                },
              ],
            }),
            event.clientX,
            event.clientY,
          );
        })
        .on("mousemove", (event) =>
          chartTooltip.move(event.clientX, event.clientY),
        )
        .on("mouseleave", () => chartTooltip.hide());

      // Label for instant segment
      if (cell.instant > 0) {
        // If the segment is too small, place the label above the bar
        const isSmall = iHt < 12;
        plotG
          .append("text")
          .attr("x", bx + bw / 2)
          .attr("y", isSmall ? iY - 4 : iY + iHt / 2)
          .attr("dy", isSmall ? "0" : "0.35em")
          .attr("text-anchor", "middle")
          .attr("fill", isSmall ? CHROME.caption : "#fff")
          .attr("font-size", 9)
          .attr("opacity", barOpacity)
          .attr("pointer-events", "none")
          .text(d3.format(",")(cell.instant));
      }
    }

    // X axis
    plotG
      .append("g")
      .attr("transform", `translate(0,${plotH})`)
      .call(d3.axisBottom(xScale).tickSize(0))
      .call((a) => a.select(".domain").attr("stroke", CHROME.axisLine))
      .call((a) =>
        a
          .selectAll("text")
          .attr("fill", CHROME.tick)
          .attr("font-size", 10)
          .attr("y", 0)
          .attr("x", -8)
          .attr("dy", "0.35em")
          .attr("transform", "rotate(-45)")
          .style("text-anchor", "end"),
      );

    // Y axis (only first panel)
    if (pi === 0) {
      plotG
        .append("g")
        .call(d3.axisLeft(yScale).ticks(5).tickFormat(d3.format(",")))
        .call((a) => a.select(".domain").attr("stroke", CHROME.axisLine))
        .call((a) =>
          a.selectAll("text").attr("fill", CHROME.tick).attr("font-size", 11),
        )
        .call((a) => a.selectAll("line").attr("stroke", CHROME.axisLine));
    }
  });
}
