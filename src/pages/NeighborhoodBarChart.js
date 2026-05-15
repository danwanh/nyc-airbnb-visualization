/**
 * NeighborhoodBarChart.js — Median Price by Neighbourhood
 * X: neighbourhood_cleansed, Y: MEDIAN(price), color = borough
 */
import * as d3 from "d3";
import { chartTooltip, formatTooltip } from "../components/tooltip.js";

import { BOROUGH_COLORS } from "../utils/palette.js";

function parsePrice(v) {
  const n = parseFloat(String(v || "").replace(/[$,]/g, ""));
  return isFinite(n) && n > 0 && n < 10000 ? n : NaN;
}

function median(arr) {
  const s = arr.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

//** Aggregate rows → [{ neighbourhood, borough, medianPrice, count }] sorted A–Z */
function aggregateMedianPrice(rows, boroughFilter = "all") {
  const filtered =
    boroughFilter === "all"
      ? rows
      : rows.filter((r) => {
          if (Array.isArray(boroughFilter))
            return boroughFilter.includes(r.neighbourhood_group_cleansed);
          return r.neighbourhood_group_cleansed === boroughFilter;
        });

  const map = new Map();
  for (const r of filtered) {
    const key = r.neighbourhood_cleansed;
    const price = parsePrice(r.price);
    if (!key || isNaN(price)) continue;
    if (!map.has(key))
      map.set(key, {
        neighbourhood: key,
        borough: r.neighbourhood_group_cleansed,
        prices: [],
        count: 0,
      });
    const entry = map.get(key);
    entry.prices.push(price);
    entry.count++;
  }

  return Array.from(map.values())
    .map((e) => ({
      neighbourhood: e.neighbourhood,
      borough: e.borough,
      medianPrice: median(e.prices),
      count: e.count,
    }))
    .sort((a, b) => a.neighbourhood.localeCompare(b.neighbourhood));
}

export function renderNeighborhoodBarChart(
  selector,
  rows,
  boroughFilter = "all",
  options = {},
) {
  const {
    selectedNeighborhood = null,
    selectedBorough = null,
    onNeighborhoodClick,
  } = options;
  const data = aggregateMedianPrice(rows, boroughFilter);
  const svgEl = d3.select(selector).node();
  if (!svgEl) return;

  // Ensure scrollable wrapper exists and svg is inside it
  let wrapper = svgEl.closest(".s13-scroll");
  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.className = "s13-scroll chart-scroll";
    const parent = svgEl.parentElement;
    parent.insertBefore(wrapper, svgEl);
    wrapper.appendChild(svgEl);
  } else {
    wrapper.classList.add("chart-scroll");
  }

  // Dimensions
  const H = 450; // Height
  const margin = { top: 28, right: 140, bottom: 128, left: 64 };
  const iH = H - margin.top - margin.bottom;

  const BAR_W = 36; // Width per bar
  const parentWidth = wrapper.getBoundingClientRect().width || 700;
  const iW = Math.max(
    parentWidth - margin.left - margin.right,
    data.length * BAR_W,
  );
  const W = iW + margin.left + margin.right;

  const svg = d3
    .select(svgEl)
    .attr("width", W)
    .attr("height", H)
    .style("width", null)
    .style("height", null);

  svg.selectAll("*").remove();
  svg
    .append("rect")
    .attr("width", W)
    .attr("height", H)
    .attr("fill", "transparent");

  if (!data.length) {
    svg
      .append("text")
      .attr("x", W / 2)
      .attr("y", H / 2)
      .attr("text-anchor", "middle")
      .attr("fill", "#64748b")
      .attr("font-size", 13)
      .text("No neighbourhood price data for the current filter.");
    return;
  }

  const g = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);
  const chartGroup = g.append("g").attr("class", "chart-content");

  // Scales
  const x = d3
    .scaleBand()
    .domain(data.map((d) => d.neighbourhood))
    .range([0, iW])
    .padding(0.2);

  const maxP = d3.max(data, (d) => d.medianPrice) || 100;
  const y = d3
    .scaleLinear()
    .domain([0, Math.ceil(maxP / 200) * 200])
    .range([iH, 0])
    .nice();

  // Grid lines
  chartGroup
    .append("g")
    .selectAll("line")
    .data(y.ticks(5))
    .join("line")
    .attr("x1", 0)
    .attr("x2", iW)
    .attr("y1", (d) => y(d))
    .attr("y2", (d) => y(d))
    .attr("stroke", "#e2e8f0")
    .attr("stroke-width", 1);

  // X axis
  const xG = chartGroup
    .append("g")
    .attr("transform", `translate(0,${iH})`)
    .call(d3.axisBottom(x).tickSize(0));
  xG.select(".domain").remove();
  xG.selectAll("text")
    .attr("transform", "rotate(-65)")
    .attr("text-anchor", "end")
    .attr("dx", "-0.3em")
    .attr("dy", "0.2em")
    .attr("fill", "#475569")
    .attr("font-size", 10)
    .text((d) => d);

  // Y axis
  const yG = chartGroup.append("g").call(d3.axisLeft(y).ticks(5).tickSize(-iW));
  yG.select(".domain").remove();
  yG.selectAll("line").attr("stroke", "#e2e8f0");
  yG.selectAll("text").attr("fill", "#475569").attr("font-size", 10);

  // Y label
  chartGroup
    .append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -iH / 2)
    .attr("y", -54)
    .attr("text-anchor", "middle")
    .attr("fill", "#64748b")
    .attr("font-size", 11)
    .text("Median price");

  // Bars
  chartGroup
    .selectAll("rect.bar")
    .data(data)
    .join("rect")
    .attr("class", "bar")
    .attr("x", (d) => x(d.neighbourhood))
    .attr("y", iH)
    .attr("width", x.bandwidth())
    .attr("height", 0)
    .attr("fill", (d) => BOROUGH_COLORS[d.borough] || "#70ad47")
    .attr("fill-opacity", (d) => {
      if (selectedNeighborhood) {
        return d.neighbourhood === selectedNeighborhood ? 1.0 : 0.2;
      }
      if (selectedBorough && d.borough !== selectedBorough) return 0.2;
      return 0.85;
    })
    .attr("stroke", (d) => {
      if (selectedNeighborhood && d.neighbourhood === selectedNeighborhood) {
        return "#0f172a";
      }
      if (
        !selectedNeighborhood &&
        selectedBorough &&
        d.borough === selectedBorough
      ) {
        return "#0f172a";
      }
      return "none";
    })
    .attr("stroke-width", (d) => {
      if (selectedNeighborhood && d.neighbourhood === selectedNeighborhood) {
        return 1.5;
      }
      if (
        !selectedNeighborhood &&
        selectedBorough &&
        d.borough === selectedBorough
      ) {
        return 1.5;
      }
      return 0;
    })
    .style("cursor", "pointer")
    .on("mouseenter", function (event, d) {
      const isFocusNeighborhood =
        selectedNeighborhood && d.neighbourhood === selectedNeighborhood;
      const isFocusBoroughBar =
        !selectedNeighborhood &&
        selectedBorough &&
        d.borough === selectedBorough;
      const isUnrestricted = !selectedNeighborhood && !selectedBorough;
      if (isFocusNeighborhood || isFocusBoroughBar || isUnrestricted) {
        d3.select(this).attr("fill-opacity", 1);
      }
      chartTooltip.show(
        formatTooltip({
          title: d.neighbourhood,
          rows: [
            { label: "Borough", value: d.borough },
            {
              label: "Median price",
              value: `$${Math.round(d.medianPrice).toLocaleString()}`,
            },
            { label: "Number of listings", value: d.count.toLocaleString() },
          ],
        }),
        event.clientX,
        event.clientY,
      );
    })
    .on("mousemove", (event) => {
      chartTooltip.move(event.clientX, event.clientY);
    })
    .on("mouseleave", function (event, d) {
      d3.select(this).attr("fill-opacity", () => {
        if (selectedNeighborhood) {
          return d.neighbourhood === selectedNeighborhood ? 1.0 : 0.2;
        }
        if (selectedBorough && d.borough !== selectedBorough) return 0.2;
        return 0.85;
      });
      chartTooltip.hide();
    })
    .on("click", function (event, d) {
      event.stopPropagation();
      onNeighborhoodClick?.(d.neighbourhood, d.borough);
    })
    .transition()
    .duration(500)
    .ease(d3.easeCubicOut)
    .attr("y", (d) => y(d.medianPrice))
    .attr("height", (d) => iH - y(d.medianPrice));
}
