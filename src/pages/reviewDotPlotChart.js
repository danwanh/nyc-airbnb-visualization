import * as d3 from 'd3';
import { ROOM_TYPES } from '../utils/aggregates.js';
import { chartTooltip } from '../components/tooltip.js';
import { CHROME } from '../utils/palette.js';

/**
 * Dot plot: mean review sub-scores by dimension and room type.
 */
export function renderReviewDotPlot(containerSelector, data) {
  const types = ROOM_TYPES;
  const margin = { top: 18, right: 18, bottom: 44, left: 168 };
  const W = 520;
  const emptyH = 100;

  const svg = d3.select(containerSelector);
  svg.selectAll('*').remove();

  const allVals = data.flatMap((d) => types.map((t) => d[t.key]).filter((v) => Number.isFinite(v)));
  if (!data.length || !allVals.length) {
    svg
      .attr('viewBox', `0 0 ${W} ${emptyH}`)
      .attr('width', '100%')
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .attr('style', 'display:block;max-width:100%;height:auto')
      .append('text')
      .attr('x', W / 2)
      .attr('y', emptyH / 2)
      .attr('text-anchor', 'middle')
      .attr('fill', CHROME.tick)
      .attr('font-size', 13)
      .text('No review scores in the current filter.');
    return;
  }

  const H = data.length * 74 + margin.top + margin.bottom;
  const iW = W - margin.left - margin.right;
  const iH = H - margin.top - margin.bottom;

  svg
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('width', '100%')
    .attr('preserveAspectRatio', 'xMinYMin meet')
    .attr('style', 'display:block;max-width:100%;height:auto');
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const x = d3
    .scaleLinear()
    .domain([d3.min(allVals) - 0.05, d3.max(allVals) + 0.02])
    .range([0, iW])
    .nice();
  const y = d3
    .scaleBand()
    .domain(data.map((d) => d.dim))
    .range([0, iH])
    .padding(0.4);

  const sorted = [...allVals].sort(d3.ascending);
  const median = d3.median(sorted);
  const q1 = d3.quantile(sorted, 0.25);
  const q3 = d3.quantile(sorted, 0.75);

  g.append('rect')
    .attr('x', x(q1))
    .attr('width', x(q3) - x(q1))
    .attr('y', 0)
    .attr('height', iH)
    .attr('fill', CHROME.iqrBand)
    .attr('opacity', 0.85);

  g.append('line')
    .attr('x1', x(median))
    .attr('x2', x(median))
    .attr('y1', 0)
    .attr('y2', iH)
    .attr('stroke', CHROME.medianLine)
    .attr('stroke-width', 1.5)
    .attr('stroke-dasharray', '4,3');

  g.append('text')
    .attr('x', x(median))
    .attr('y', iH + 16)
    .attr('text-anchor', 'middle')
    .attr('fill', CHROME.tick)
    .attr('font-size', 10.5)
    .text('Median');

  g.append('g')
    .call(d3.axisBottom(x).ticks(8).tickSize(iH).tickFormat(''))
    .call((a) => a.select('.domain').remove())
    .call((a) => a.selectAll('line').attr('stroke', CHROME.grid).attr('stroke-dasharray', '3,3'));

  data.forEach((d) => {
    const vals = types.map((t) => d[t.key]).filter((v) => Number.isFinite(v));
    if (vals.length < 2) return;
    g.append('line')
      .attr('x1', x(d3.min(vals)))
      .attr('x2', x(d3.max(vals)))
      .attr('y1', y(d.dim) + y.bandwidth() / 2)
      .attr('y2', y(d.dim) + y.bandwidth() / 2)
      .attr('stroke', CHROME.rangeLine)
      .attr('stroke-width', 1);
  });

  types.forEach((type) => {
    g.selectAll(null)
      .data(data.filter((d) => Number.isFinite(d[type.key])))
      .join('circle')
      .attr('cx', (d) => x(d[type.key]))
      .attr('cy', (d) => y(d.dim) + y.bandwidth() / 2)
      .attr('r', 8)
      .attr('fill', type.color)
      .attr('fill-opacity', 0.92)
      .attr('stroke', CHROME.dotStroke)
      .attr('stroke-width', 2)
      .attr('cursor', 'pointer')
      .on('mouseenter', (event, d) => {
        const n = d[`_n_${type.key}`] ?? '—';
        chartTooltip.show(
          `<strong>${d.dimLabel}</strong><br/>${type.label}<br/>Mean: ${d[type.key].toFixed(2)}<br/>n = ${n}`,
          event.clientX,
          event.clientY
        );
        d3.select(event.currentTarget).attr('r', 10).attr('stroke', CHROME.dotStrokeHover);
      })
      .on('mousemove', (event) => chartTooltip.move(event.clientX, event.clientY))
      .on('mouseleave', (event) => {
        chartTooltip.hide();
        d3.select(event.currentTarget).attr('r', 8).attr('stroke', CHROME.dotStroke);
      });
  });

  const labelByDim = new Map(data.map((d) => [d.dim, d.dimLabel]));
  g.append('g')
    .call(
      d3
        .axisLeft(y)
        .tickSize(0)
        .tickFormat((d) => labelByDim.get(d) ?? d)
    )
    .call((a) => a.select('.domain').remove())
    .call((a) =>
      a.selectAll('text').attr('fill', CHROME.tick).attr('font-size', 11).attr('dx', -8)
    );

  g.append('g')
    .attr('transform', `translate(0,${iH})`)
    .call(d3.axisBottom(x).ticks(8).tickFormat((d) => d.toFixed(2)))
    .call((a) => a.select('.domain').attr('stroke', CHROME.axisLine))
    .call((a) => a.selectAll('text').attr('fill', CHROME.tick).attr('font-size', 11))
    .call((a) => a.selectAll('line').attr('stroke', CHROME.axisLine));

  svg
    .append('text')
    .attr('x', margin.left + iW / 2)
    .attr('y', H - 4)
    .attr('text-anchor', 'middle')
    .attr('fill', CHROME.caption)
    .attr('font-size', 11)
    .text('Avg. review score');
}
