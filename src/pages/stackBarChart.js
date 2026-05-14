import * as d3 from 'd3';
import { ROOM_TYPE_COLORS, ROOM_TYPE_STACK_ORDER } from '../utils/aggregates.js';
import { chartTooltip } from '../components/tooltip.js';
import { CHROME } from '../utils/palette.js';

/**
 * Vertical stacked bar chart: % of total number_of_reviews
 * per borough × room type — mirrors the Tableau "Preferred room type" view.
 *
 * @param {string} containerSelector  – CSS selector of an <svg> element
 * @param {{ hoods: string[], types: string[], pct: object, total: number }} data
 * @param {{ selectedBorough?: string|null }} [options]
 */
export function renderStackBarChart(containerSelector, data, options = {}) {
  const { selectedBorough = null } = options;
  const { hoods, types, pct } = data;

  const svg = d3.select(containerSelector);
  svg.selectAll('*').remove();

  if (!hoods.length || !types.length) {
    svg
      .attr('viewBox', '0 0 520 120')
      .attr('width', '100%')
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .attr('style', 'display:block;max-width:100%;height:auto')
      .append('text')
      .attr('x', 260)
      .attr('y', 60)
      .attr('text-anchor', 'middle')
      .attr('fill', '#64748b')
      .attr('font-size', 13)
      .text('No data available for this filter.');
    return;
  }

  /* ── Dimensions ── */
  const margin = { top: 24, right: 16, bottom: 48, left: 46 };
  const W = 520;
  // auto-height: give each borough 64px of bar space
  const innerH = hoods.length * 64;
  const H = innerH + margin.top + margin.bottom;
  const iW = W - margin.left - margin.right;

  svg
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('width', '100%')
    .attr('preserveAspectRatio', 'xMinYMin meet')
    .attr('style', 'display:block;max-width:100%;height:auto');

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  /* ── Scales ── */
  // Y-axis max: round up the highest stacked total to a nice ceiling
  const maxPct = d3.max(hoods, (b) => types.reduce((s, t) => s + (pct[b][t] ?? 0), 0));
  const yMax = Math.ceil((maxPct + 2) / 5) * 5; // next multiple of 5

  const x = d3.scaleBand().domain(hoods).range([0, iW]).padding(0.38);
  const y = d3.scaleLinear().domain([0, yMax]).range([innerH, 0]).nice();

  /* ── Stack ── */
  const stackInput = hoods.map((b) => {
    const obj = { hood: b };
    types.forEach((t) => { obj[t] = pct[b][t] ?? 0; });
    return obj;
  });
  const stacked = d3.stack().keys(types)(stackInput);

  /* ── Grid lines ── */
  const maxTicks = Math.max(2, Math.floor(innerH / 20));
  const tickCount = Math.min(yMax / 5, maxTicks);
  g.append('g')
    .attr('class', 'grid')
    .call(
      d3.axisLeft(y)
        .ticks(tickCount)
        .tickSize(-iW)
        .tickFormat('')
    )
    .call((a) => a.select('.domain').remove())
    .call((a) => a.selectAll('line').attr('stroke', CHROME.grid).attr('stroke-dasharray', '3,3'));

  /* ── Bars + labels ── */
  stacked.forEach((layer) => {
    const roomType = layer.key;
    const color = ROOM_TYPE_COLORS[roomType] ?? '#888';

    // ── Bar segments
    g.selectAll(null)
      .data(layer)
      .join('rect')
      .attr('x', (d) => x(d.data.hood))
      .attr('y', (d) => y(Math.min(d[1], yMax)))
      .attr('height', (d) => {
        const top    = Math.min(d[1], yMax);
        const bottom = Math.min(d[0], yMax);
        return Math.max(0, y(bottom) - y(top));
      })
      .attr('width', x.bandwidth())
      .attr('fill', color)
      .attr('opacity', selectedBorough ? (d) => d.data.hood === selectedBorough ? 1 : 0.28 : 1)
      .on('mouseenter', (event, d) => {
        const nb = d.data.hood;
        const val = (d[1] - d[0]).toFixed(1);
        chartTooltip.show(
          `<div style="display:grid; grid-template-columns: auto auto; gap: 4px 16px; text-align: left;">
            <span style="color:#6b6b67">Room Type:</span> <strong style="color:${color}">${roomType}</strong>
            <span style="color:#6b6b67">Borough:</span> <strong>${nb}</strong>
            <span style="color:#6b6b67">Share:</span> <strong>${val}%</strong>
          </div>`,
          event.clientX,
          event.clientY
        );
      })
      .on('mousemove', (event) => chartTooltip.move(event.clientX, event.clientY))
      .on('mouseleave', () => chartTooltip.hide());

    // ── % labels inside segments (skip if segment too narrow)
    g.selectAll(null)
      .data(layer)
      .join('text')
      .attr('x', (d) => x(d.data.hood) + x.bandwidth() / 2)
      .attr('y', (d) => {
        const top    = Math.min(d[1], yMax);
        const bottom = Math.min(d[0], yMax);
        return y(top) + (y(bottom) - y(top)) / 2;
      })
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('fill', '#fff')
      .attr('font-size', 11)
      .attr('font-weight', 600)
      .attr('pointer-events', 'none')
      .attr('opacity', selectedBorough ? (d) => d.data.hood === selectedBorough ? 1 : 0.28 : 1)
      .text((d) => {
        const val = d[1] - d[0];
        const segH = y(Math.min(d[0], yMax)) - y(Math.min(d[1], yMax));
        return val >= 1.8 && segH >= 14 ? val.toFixed(1) + '%' : '';
      });
  });

  /* ── X axis ── */
  g.append('g')
    .attr('transform', `translate(0,${innerH})`)
    .call(d3.axisBottom(x).tickSize(0))
    .call((a) => a.select('.domain').remove())
    .call((a) => a.selectAll('text')
      .attr('dy', '1.2em')
      .attr('fill', (b) => selectedBorough && b === selectedBorough ? '#0f172a' : CHROME.tick)
      .attr('font-weight', (b) => selectedBorough && b === selectedBorough ? 600 : 400)
      .attr('font-size', 12)
    );

  /* ── Y axis ── */
  g.append('g')
    .call(
      d3.axisLeft(y)
        .ticks(tickCount)
        .tickFormat((v) => v + '%')
    )
    .call((a) => a.select('.domain').remove())
    .call((a) => a.selectAll('line').remove())
    .call((a) => a.selectAll('text')
      .attr('fill', CHROME.tick)
      .attr('font-size', 11)
    );
}
