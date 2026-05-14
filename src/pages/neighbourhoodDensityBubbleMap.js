/**
 * neighbourhoodDensityBubbleMap.js — Listing Density by Neighbourhood
 * Bubble map: AVG(longitude) on X, AVG(latitude) on Y, size = CNT(id), color = borough
 */
import * as d3 from "d3";

const GEOJSON_URL =
  "https://raw.githubusercontent.com/dwillis/nyc-maps/master/boroughs.geojson";
let _geoCache = null;

const BOROUGH_COLORS = {
  Bronx: "#4472c4",
  Brooklyn: "#ed7d31",
  Manhattan: "#e04343",
  Queens: "#70ad47",
  "Staten Island": "#ada347",
};

/** Aggregate raw rows → per-neighbourhood { neighbourhood, borough, lat, lng, count } */
function aggregateByNeighbourhood(rows, boroughFilter = "all") {
  const filtered =
    boroughFilter === "all"
      ? rows
      : rows.filter((r) => r.neighbourhood_group_cleansed === boroughFilter);

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

export async function renderNeighbourhoodDensityBubbleMap(
  svgEl,
  rows,
  boroughFilter = "all",
  options = {},
) {
  const { selectedNeighborhood = null, onNeighborhoodClick } = options;
  const svg = d3.select(svgEl);
  svg.selectAll("*").remove();

  const W = svgEl.clientWidth || 600;
  const H = svgEl.clientHeight || 480;

  svg.attr("width", W).attr("height", H);

  // Background
  svg.append("rect").attr("width", W).attr("height", H).attr("fill", "#f5f5f5");

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
        const dimmed = boroughFilter !== "all" && name !== boroughFilter;
        return dimmed ? "#e8e8e8" : "#dde3ea";
      })
      .attr("stroke", "#b0b8c2")
      .attr("stroke-width", 0.8);
  }

  // Neighbourhood bubbles
  const data = aggregateByNeighbourhood(rows, boroughFilter);
  const maxCount = d3.max(data, (d) => d.count) || 1;

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
    .attr("fill-opacity", (d) =>
      selectedNeighborhood && d.neighbourhood !== selectedNeighborhood
        ? 0.24
        : 0.72,
    )
    .attr("stroke", (d) =>
      d.neighbourhood === selectedNeighborhood ? "#4338ca" : "#fff",
    )
    .attr("stroke-width", (d) =>
      d.neighbourhood === selectedNeighborhood ? 2 : 0.6,
    )
    .style("cursor", "pointer")
    .on("mouseenter", function (event, d) {
      if (d.neighbourhood !== selectedNeighborhood) {
        d3.select(this).attr("stroke", "#000").attr("stroke-width", 1.2);
      }
    })
    .on("mouseleave", function (event, d) {
      if (d.neighbourhood !== selectedNeighborhood) {
        d3.select(this).attr("stroke", "#fff").attr("stroke-width", 0.6);
      }
    })
    .on("mousemove", function (event, d) {
      const tooltip = document.getElementById("sheet12-tip");
      if (!tooltip) return;
      tooltip.style.display = "block";
      tooltip.style.left = event.clientX + 14 + "px";
      tooltip.style.top = event.clientY - 10 + "px";
      tooltip.innerHTML = `<strong>${d.neighbourhood}</strong><br>${d.borough}<br>${d.count.toLocaleString()} listings`;
    })
    .on("click", function (event, d) {
      event.stopPropagation();
      const tooltip = document.getElementById("sheet12-tip");
      if (tooltip) tooltip.style.display = "none";
      onNeighborhoodClick?.(d.neighbourhood);
    });

  // Labels for all neighbourhoods (initially visible for top 8)
  let labels = contentGroup
    .selectAll("text.bubble-lbl")
    .data(sorted)
    .join("text")
    .attr("class", "bubble-lbl")
    .attr("x", (d) => projection([d.lng, d.lat])[0])
    .attr("y", (d) => projection([d.lng, d.lat])[1] + baseRScale(d.count) + 8)
    .attr("dy", "0.9em")
    .attr("text-anchor", "middle")
    .attr("fill", "#333")
    .attr("font-size", 6)
    .attr("opacity", 0)
    .attr("pointer-events", "none")
    .text((d) => `${d.neighbourhood} (${d.count})`);

  // Zoom handler - apply transform to all content (map, bubbles, labels)
  const zoom = d3
    .zoom()
    .scaleExtent([0.5, 20])
    .on("zoom", (ev) => {
      contentGroup.attr("transform", ev.transform);

      // Adjust bubble radius and label placement to keep the view readable while zooming
      const scale = Math.max(ev.transform.k, 0.8);
      const radiusCorrection = 1 / scale;
      bubbles.attr("r", (d) => baseRScale(d.count) * radiusCorrection);
      labels.attr(
        "y",
        (d) =>
          projection([d.lng, d.lat])[1] +
          baseRScale(d.count) * radiusCorrection +
          8,
      );

      const minZoomForLabels = 2.2; // show labels only when zoomed in enough
      if (scale < minZoomForLabels) {
        labels.attr("opacity", 0);
      } else {
        labels
          .attr("opacity", 1)
          .attr("font-size", Math.max(2, Math.min(4, 7 / scale)));
      }
    });

  svg
    .call(zoom)
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
    .attr("stroke", "#ccc")
    .attr("stroke-width", 0.5)
    .attr("rx", 8)
    .attr("opacity", 0.95);
  legG
    .append("text")
    .attr("x", lx)
    .attr("y", ly)
    .attr("text-anchor", "middle")
    .attr("font-size", 9)
    .attr("fill", "#555")
    .text("Count of id");
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
      .attr("stroke", "#999")
      .attr("stroke-width", 1);
    legG
      .append("text")
      .attr("x", lx + r + 5)
      .attr("y", ly + 4)
      .attr("font-size", 8)
      .attr("fill", "#666")
      .text(s >= 1000 ? `${s / 1000}k` : s);
    ly += r + 6;
  });

  // Borough color legend
  let cy2 = ly + 20;
  Object.entries(BOROUGH_COLORS).forEach(([name, color], i) => {
    if (i === 0) {
      legG
        .append("text")
        .attr("x", lx - 30)
        .attr("y", cy2 - 10)
        .attr("font-size", 9)
        .attr("fill", "#555")
        .text("neighbourhood_group");
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
      .attr("y", cy2 + 2)
      .attr("font-size", 9)
      .attr("fill", "#444")
      .text(name);
    cy2 += 16;
  });

  legBg.attr("height", cy2 - (ly0 - 12));
}
