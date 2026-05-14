/**
 * neighbourhoodMedianPriceBarChart.js — Median Price by Neighbourhood
 * X: neighbourhood_cleansed (sorted A–Z), Y: MEDIAN(price), color = borough
 */
import * as d3 from "d3";

const BOROUGH_COLORS = {
  Bronx: "#4472c4",
  Brooklyn: "#ed7d31",
  Manhattan: "#e04343",
  Queens: "#70ad47",
  "Staten Island": "#ada347",
};

function parsePrice(v) {
  const n = parseFloat(String(v || "").replace(/[$,]/g, ""));
  return isFinite(n) && n > 0 && n < 10000 ? n : NaN;
}

function median(arr) {
  const s = arr.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

/** Aggregate rows → [{ neighbourhood, borough, medianPrice }] sorted A–Z */
function aggregateMedianPrice(rows, boroughFilter = "all") {
  const filtered =
    boroughFilter === "all"
      ? rows
      : rows.filter((r) => r.neighbourhood_group_cleansed === boroughFilter);

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
      });
    map.get(key).prices.push(price);
  }

  return Array.from(map.values())
    .map((e) => ({
      neighbourhood: e.neighbourhood,
      borough: e.borough,
      medianPrice: median(e.prices),
    }))
    .sort((a, b) => a.neighbourhood.localeCompare(b.neighbourhood));
}

export function renderNeighbourhoodMedianPriceBarChart(
  svgEl,
  rows,
  boroughFilter = "all",
  options = {},
) {
  const { selectedNeighborhood = null, onNeighborhoodClick } = options;
  const data = aggregateMedianPrice(rows, boroughFilter);

  // Use a scrollable wrapper inside the card
  let wrapper = svgEl.parentElement.querySelector(".s13-scroll");
  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.className = "s13-scroll";
    wrapper.style.cssText = "overflow-x:auto;overflow-y:hidden;width:100%;";
    svgEl.parentElement.appendChild(wrapper);
    svgEl.remove();
    wrapper.appendChild(svgEl);
  }

  // Dimensions
  const H = 380;
  const margin = { top: 24, right: 20, bottom: 120, left: 70 };
  const iH = H - margin.top - margin.bottom;

  const BAR_W = 28; // min px per bar
  const contW = wrapper.clientWidth || 700;
  const iW = Math.max(contW - margin.left - margin.right, data.length * BAR_W);
  const W = iW + margin.left + margin.right;

  const svg = d3.select(svgEl).attr("width", W).attr("height", H);

  svg.selectAll("*").remove();
  svg.append("rect").attr("width", W).attr("height", H).attr("fill", "#fff");

  const g = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);
  const chartGroup = g.append("g").attr("class", "chart-content");

  // Scales
  const x = d3
    .scaleBand()
    .domain(data.map((d) => d.neighbourhood))
    .range([0, iW])
    .padding(0.15);

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
    .attr("transform", "rotate(-55)")
    .attr("text-anchor", "end")
    .attr("dx", "-0.3em")
    .attr("dy", "0em")
    .attr("fill", "#475569")
    .attr("font-size", data.length > 60 ? 6.5 : 8.5);

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

  // X label
  chartGroup
    .append("text")
    .attr("x", iW / 2)
    .attr("y", iH + margin.bottom - 4)
    .attr("text-anchor", "middle")
    .attr("fill", "#64748b")
    .attr("font-size", 11)
    .text("neighbourhood_cleansed");

  // Tooltip
  const tipEl = document.getElementById("sheet13-tip");

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
    .attr("fill-opacity", (d) =>
      selectedNeighborhood && d.neighbourhood !== selectedNeighborhood
        ? 0.24
        : 0.85,
    )
    .attr("stroke", (d) =>
      d.neighbourhood === selectedNeighborhood ? "#4338ca" : "none",
    )
    .attr("stroke-width", (d) =>
      d.neighbourhood === selectedNeighborhood ? 2 : 0,
    )
    .style("cursor", "pointer")
    .on("mouseenter", function (event, d) {
      if (d.neighbourhood !== selectedNeighborhood) {
        d3.select(this).attr("stroke", "#000").attr("stroke-width", 1);
      }
      if (!tipEl) return;
      tipEl.style.display = "block";
      tipEl.style.left = event.pageX + 14 + "px";
      tipEl.style.top = event.pageY - 10 + "px";
      tipEl.innerHTML = `<strong>${d.neighbourhood}</strong><br>${d.borough}<br>Median: $${Math.round(d.medianPrice).toLocaleString()}`;
    })
    .on("mouseleave", function (event, d) {
      if (d.neighbourhood !== selectedNeighborhood) {
        d3.select(this).attr("stroke", "none").attr("stroke-width", 0);
      }
      if (tipEl) tipEl.style.display = "none";
    })
    .on("click", function (event, d) {
      event.stopPropagation();
      onNeighborhoodClick?.(d.neighbourhood);
    })
    .transition()
    .duration(500)
    .ease(d3.easeCubicOut)
    .attr("y", (d) => y(d.medianPrice))
    .attr("height", (d) => iH - y(d.medianPrice));

  // Borough color legend (right side)
  const legX = iW + 12;
  let legY = 20;
  const legG = chartGroup.append("g");

  Object.entries(BOROUGH_COLORS).forEach(([name, color]) => {
    legG
      .append("rect")
      .attr("x", legX)
      .attr("y", legY - 8)
      .attr("width", 11)
      .attr("height", 11)
      .attr("fill", color)
      .attr("rx", 2);
    legG
      .append("text")
      .attr("x", legX + 15)
      .attr("y", legY + 1)
      .attr("font-size", 9)
      .attr("fill", "#475569")
      .text(name);
    legY += 16;
  });
}
