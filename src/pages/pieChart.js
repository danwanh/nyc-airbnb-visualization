import * as d3 from "d3";

export function drawPieChart(container, data) {
  d3.select(container).html("");

  const width = 300;
  const height = 300;
  const radius = Math.min(width, height) / 2;

  const svg = d3.select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .append("g")
    .attr("transform", `translate(${width/2}, ${height/2})`);

  const pie = d3.pie().value(d => d.value);
  const arc = d3.arc().innerRadius(0).outerRadius(radius);

  const arcs = svg.selectAll("arc")
    .data(pie(data))
    .join("g");

  arcs.append("path")
    .attr("d", arc)
    .attr("fill", (d, i) => d3.schemeCategory10[i]);
}
