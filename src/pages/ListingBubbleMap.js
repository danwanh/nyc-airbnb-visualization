/**
 * ListingBubbleMap.js — Listing Density by Neighbourhood
 * Bubble map: AVG(longitude) on X, AVG(latitude) on Y, size = CNT(id), color = borough
 */
import * as d3 from "d3";
import { chartTooltip, formatTooltip } from "../components/tooltip.js";

const GEOJSON_URL =
  "https://raw.githubusercontent.com/dwillis/nyc-maps/master/boroughs.geojson";
let _geoCache = null;

const BOROUGH_COLORS = {
  Bronx: "#2563eb",
  Brooklyn: "#f97316",
  Manhattan: "#dc2626",
  Queens: "#16a34a",
  "Staten Island": "#7c3aed",
};

/** Aggregate raw rows → per-neighbourhood { neighbourhood, borough, lat, lng, count } */
function aggregateByNeighbourhood(rows, boroughFilter = "all") {
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
    if (!key) continue;
    const lat = +r.latitude,
      lng = +r.longitude;
    if (!isFinite(lat) || !isFinite(lng)) continue;

    if (!map.has(key)) {
      map.set(key, {
        neighbourhood: key,
        borough: r.neighbourhood_group_cleansed,
        sumLat: 0,
        sumLng: 0,
        count: 0,
      });
    }
    const e = map.get(key);
    e.sumLat += lat;
    e.sumLng += lng;
    e.count++;
  }
  return Array.from(map.values()).map((e) => ({
    neighbourhood: e.neighbourhood,
    borough: e.borough,
    lat: e.sumLat / e.count,
    lng: e.sumLng / e.count,
    count: e.count,
  }));
}

export async function renderListingBubbleMap(
  selector,
  rows,
  boroughFilter = "all",
  options = {},
) {
  const { selectedNeighborhood = null, onNeighborhoodClick } = options;
  const svg = d3.select(selector);
  if (svg.empty()) return;
  const svgEl = svg.node();

  svg.selectAll("*").remove();

  const W = svgEl.clientWidth || 600;
  const H = svgEl.clientHeight || 480;

  svg.attr("width", W).attr("height", H);

  // Background
  svg.append("rect").attr("width", W).attr("height", H).attr("fill", "#f8fafc");

  const g = svg.append("g");

  // Load GeoJSON (cached)
  if (!_geoCache) {
    try {
      _geoCache = await d3.json(GEOJSON_URL);
    } catch (_) {
      _geoCache = null;
    }
  }

  // Projection
  let projection;
  if (_geoCache) {
    projection = d3.geoMercator().fitSize([W, H], _geoCache);
  } else {
    projection = d3
      .geoMercator()
      .center([-73.98, 40.73])
      .scale(55000)
      .translate([W / 2, H / 2]);
  }

  const path = d3.geoPath().projection(projection);

  // Create a group for all content (map + bubbles + labels) that will be zoomed
  const contentGroup = g.append("g").attr("class", "content-group");

  // Base map layer — borough polygons (always show all)
  if (_geoCache) {
    contentGroup
      .selectAll(".boro-path")
      .data(_geoCache.features)
      .join("path")
      .attr("class", "boro-path")
      .attr("d", path)
      .attr("fill", (feat) => {
        const name = feat.properties.BoroName || feat.properties.name || "";
        const isSelected =
          boroughFilter === "all" ||
          (Array.isArray(boroughFilter) && boroughFilter.includes(name)) ||
          (typeof boroughFilter === "string" && name === boroughFilter);
        return isSelected ? "#e2e8f0" : "#f1f5f9";
      })
      .attr("stroke", "#cbd5e1")
      .attr("stroke-width", 0.5);
  }

  // Neighbourhood bubbles
  const data = aggregateByNeighbourhood(rows, boroughFilter);
  const maxCount = d3.max(data, (d) => d.count) || 1;

  if (!data.length) {
    svg
      .append("text")
      .attr("x", W / 2)
      .attr("y", H / 2)
      .attr("text-anchor", "middle")
      .attr("fill", "#64748b")
      .attr("font-size", 13)
      .text("No neighbourhood data for the current filter.");
    return;
  }

  // Base scale for initial view - smaller range to avoid overlapping
  const baseRScale = d3.scaleSqrt().domain([0, maxCount]).range([2.5, 16]);

  const sorted = [...data].sort((a, b) => b.count - a.count);

  // Initial rendering of bubbles
  let bubbles = contentGroup
    .selectAll("circle.bubble")
    .data(sorted)
    .join("circle")
    .attr("class", "bubble")
    .attr("cx", (d) => projection([d.lng, d.lat])[0])
    .attr("cy", (d) => projection([d.lng, d.lat])[1])
    .attr("r", (d) => baseRScale(d.count))
    .attr("fill", (d) => BOROUGH_COLORS[d.borough] || "#888")
    .attr("fill-opacity", (d) => {
      if (!selectedNeighborhood) return 0.72;
      return d.neighbourhood === selectedNeighborhood ? 0.95 : 0.15;
    })
    .attr("stroke", (d) =>
      d.neighbourhood === selectedNeighborhood ? "#0f172a" : "#fff",
    )
    .attr("stroke-width", (d) =>
      d.neighbourhood === selectedNeighborhood ? 1.5 : 0.6,
    )
    .style("cursor", "pointer")
    .on("mouseenter", function (event, d) {
      if (!selectedNeighborhood || d.neighbourhood === selectedNeighborhood) {
        d3.select(this).attr("fill-opacity", 1).attr("stroke", "#0f172a");
      }
      chartTooltip.show(
        formatTooltip({
          title: d.neighbourhood,
          rows: [
            { label: "Borough", value: d.borough },
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
      d3.select(this)
        .attr("fill-opacity", (d) => {
          if (!selectedNeighborhood) return 0.72;
          return d.neighbourhood === selectedNeighborhood ? 0.95 : 0.15;
        })
        .attr("stroke", (d) =>
          d.neighbourhood === selectedNeighborhood ? "#0f172a" : "#fff",
        );
      chartTooltip.hide();
    })
    .on("click", function (event, d) {
      event.stopPropagation();
      onNeighborhoodClick?.(d.neighbourhood, d.borough);
    });

  // Labels
  let labels = contentGroup
    .selectAll("text.bubble-lbl")
    .data(sorted)
    .join("text")
    .attr("class", "bubble-lbl")
    .attr("x", (d) => projection([d.lng, d.lat])[0])
    .attr("y", (d) => projection([d.lng, d.lat])[1] + baseRScale(d.count) + 8)
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "hanging")
    .attr("fill", "#1e293b")
    .attr("font-size", (d, i) => (i < 5 ? 7 : 6))
    .attr("font-weight", (d, i) => (i < 5 ? 700 : 400))
    .attr("opacity", (d, i) => (i < 5 ? 0.9 : 0))
    .attr("pointer-events", "none")
    .text((d) => `${d.neighbourhood} (${d.count.toLocaleString()})`);

  // Zoom handler
  const zoom = d3
    .zoom()
    .scaleExtent([0.5, 20])
    .on("zoom", (ev) => {
      contentGroup.attr("transform", ev.transform);
      const scale = Math.max(ev.transform.k, 0.8);
      const radiusCorrection = 1 / scale;

      bubbles
        .attr("r", (d) => baseRScale(d.count) * radiusCorrection)
        .attr(
          "stroke-width",
          (d) =>
            (d.neighbourhood === selectedNeighborhood ? 1.5 : 0.6) *
            radiusCorrection,
        );

      // Update label positions (below bubble) and visibility
      labels
        .attr("x", (d) => projection([d.lng, d.lat])[0])
        .attr(
          "y",
          (d) =>
            projection([d.lng, d.lat])[1] +
            baseRScale(d.count) * radiusCorrection +
            12 / scale,
        )
        .attr("font-size", (d, i) =>
          Math.max(2, Math.min(8, (i < 5 ? 9 : 7) / scale)),
        );

      const minZoomForLabels = 2.0;
      labels.attr("opacity", (d, i) => {
        if (scale >= minZoomForLabels) return 1;
        return i < 5 ? 0.9 : 0;
      });
    });

  svg
    .call(zoom)
    .on("click", (event) => {
      if (event.defaultPrevented) return;
      if (selectedNeighborhood) onNeighborhoodClick?.(null);
    })
    .on("dblclick.zoom", () =>
      svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity),
    );

  // Size legend
  const legSizes = [20, 50, 100, 250, 500, 1000].filter((s) => s <= maxCount);
  const lx = W - 80,
    ly0 = 20;
  let ly = ly0;
  const legG = svg.append("g");
  const legBg = legG
    .append("rect")
    .attr("x", lx - 55)
    .attr("y", ly0 - 12)
    .attr("width", 150)
    .attr("height", 0)
    .attr("fill", "#fff")
    .attr("stroke", "#e2e8f0")
    .attr("stroke-width", 0.5)
    .attr("rx", 8)
    .attr("opacity", 0.9);

  legG
    .append("text")
    .attr("x", lx)
    .attr("y", ly)
    .attr("text-anchor", "middle")
    .attr("font-size", 9)
    .attr("font-weight", 600)
    .attr("fill", "#475569")
    .text("Listings Count");

  ly += 14;
  legSizes.forEach((s) => {
    const r = baseRScale(s);
    ly += r + 4;
    legG
      .append("circle")
      .attr("cx", lx)
      .attr("cy", ly)
      .attr("r", r)
      .attr("fill", "none")
      .attr("stroke", "#94a3b8")
      .attr("stroke-width", 1);
    legG
      .append("text")
      .attr("x", lx + r + 5)
      .attr("y", ly + 4)
      .attr("font-size", 8)
      .attr("fill", "#64748b")
      .text(s >= 1000 ? `${s / 1000}k` : s);
    ly += r + 6;
  });

  // Borough color legend
  let cy2 = ly + 20;
  Object.entries(BOROUGH_COLORS).forEach(([name, color], i) => {
    if (i === 0) {
      legG
        .append("text")
        .attr("x", lx - 40)
        .attr("y", cy2 - 10)
        .attr("font-size", 9)
        .attr("font-weight", 600)
        .attr("fill", "#475569")
        .text("Borough");
      cy2 += 2;
    }
    legG
      .append("rect")
      .attr("x", lx - 40)
      .attr("y", cy2 - 8)
      .attr("width", 11)
      .attr("height", 11)
      .attr("fill", color)
      .attr("rx", 2);
    legG
      .append("text")
      .attr("x", lx - 24)
      .attr("y", cy2 + 1)
      .attr("font-size", 9)
      .attr("fill", "#64748b")
      .text(name);
    cy2 += 16;
  });

  legBg.attr("height", cy2 - (ly0 - 12));
}
