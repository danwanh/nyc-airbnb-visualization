import * as d3 from 'd3';
import { STACK_KEYS, responseLabel } from '../utils/aggregates.js';
import { chartTooltip } from '../components/tooltip.js';
import { RESPONSE_COLORS, SELECTION_FILL, CHROME } from '../utils/palette.js';

const COLORS = RESPONSE_COLORS;

const KEYS = STACK_KEYS;

const DIM_OTHER = 0.28;
const DIM_SELECTED = 1;

function dimOpacity(selectedBorough, borough) {
  if (!selectedBorough) return 1;
  return borough === selectedBorough ? DIM_SELECTED : DIM_OTHER;
}

/**
 * @typedef {object} ResponseStackOptions
 * @property {string | null} [selectedBorough] — borough highlighted / linked to chart 2
 * @property {(borough: string) => void} [onBoroughClick] — click segment or label to toggle chart 2 borough filter
 */

/**
 * Horizontal stacked bar: % of listings per borough by host response time (known responses only).
 * @param {string} containerSelector
 * @param {object[]} data
 * @param {ResponseStackOptions} [options]
 */
export function renderResponseStack(containerSelector, data, options = {}) {
  const { selectedBorough = null, onBoroughClick } = options;

  const margin = { top: 10, right: 16, bottom: 40, left: 108 };
  const W = 520;
  const emptyH = 100;

  const svg = d3.select(containerSelector);
  svg.selectAll('*').remove();

  if (!data.length) {
    svg
      .attr('width', W)
      .attr('height', emptyH)
      .append('text')
      .attr('x', W / 2)
      .attr('y', emptyH / 2)
      .attr('text-anchor', 'middle')
      .attr('fill', '#6b7280')
      .attr('font-size', 13)
      .text('No listings with known host response time for this filter.');
    return;
  }

  const H = data.length * 64 + margin.top + margin.bottom;
  const iW = W - margin.left - margin.right;
  const iH = H - margin.top - margin.bottom;

  svg
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('width', '100%')
    .attr('preserveAspectRatio', 'xMinYMin meet')
    .attr('style', 'display:block;max-width:100%;height:auto');
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear().domain([0, 100]).range([0, iW]);
  const y = d3.scaleBand().domain(data.map((d) => d.borough)).range([0, iH]).padding(0.35);

  const rowBg = g.append('g').attr('class', 'borough-hit-rows');
  rowBg
    .selectAll('rect')
    .data(data)
    .join('rect')
    .attr('x', -margin.left)
    .attr('width', iW + margin.left)
    .attr('y', (d) => y(d.borough))
    .attr('height', y.bandwidth())
    .attr('fill', 'transparent')
    .attr('cursor', onBoroughClick ? 'pointer' : 'default')
    .on('click', (event, d) => {
      event.stopPropagation();
      chartTooltip.hide();
      onBoroughClick?.(d.borough);
    });

  g.append('g')
    .call(d3.axisBottom(x).ticks(10).tickSize(iH).tickFormat(''))
    .call((a) => a.select('.domain').remove())
    .call((a) => a.selectAll('line').attr('stroke', CHROME.grid).attr('stroke-dasharray', '3,3'));

  const hl = g.append('g').attr('class', 'borough-selection-bg');
  hl.selectAll('rect')
    .data(data)
    .join('rect')
    .attr('x', 0)
    .attr('width', iW)
    .attr('y', (d) => y(d.borough))
    .attr('height', y.bandwidth())
    .attr('rx', 6)
    .attr('fill', SELECTION_FILL)
    .attr('opacity', (d) => (selectedBorough && d.borough === selectedBorough ? 0.14 : 0))
    .attr('pointer-events', 'none');

  d3.stack().keys(KEYS)(data).forEach((layer, li) => {
    const key = KEYS[li];
    const pct = (d) => d[1] - d[0];

    g.selectAll(null)
      .data(layer)
      .join('rect')
      .attr('class', 'response-segment')
      .attr('data-borough', (d) => d.data.borough)
      .attr('x', (d) => x(d[0]))
      .attr('y', (d) => y(d.data.borough))
      .attr('width', (d) => Math.max(0, x(d[1]) - x(d[0])))
      .attr('height', y.bandwidth())
      .attr('fill', COLORS[key])
      .attr('rx', li === 0 ? 4 : 0)
      .attr('opacity', (d) => dimOpacity(selectedBorough, d.data.borough))
      .attr('cursor', onBoroughClick ? 'pointer' : 'default')
      .attr('stroke', (d) =>
        selectedBorough && d.data.borough === selectedBorough ? 'rgba(99, 102, 241, 0.45)' : 'none'
      )
      .attr('stroke-width', 1)
      .on('mouseenter', (event, d) => {
        chartTooltip.show(
          `<strong>${d.data.borough}</strong><br/>${responseLabel(key)}<br/>${pct(d).toFixed(2)}%<br/><span style="opacity:.75;font-size:11px">Click row to filter chart 2</span>`,
          event.clientX,
          event.clientY
        );
      })
      .on('mousemove', (event) => {
        chartTooltip.move(event.clientX, event.clientY);
      })
      .on('mouseleave', () => {
        chartTooltip.hide();
      })
      .on('click', (event, d) => {
        event.stopPropagation();
        chartTooltip.hide();
        onBoroughClick?.(d.data.borough);
      });

    g.selectAll(null)
      .data(layer)
      .join('text')
      .attr('class', 'response-label')
      .attr('data-borough', (d) => d.data.borough)
      .attr('x', (d) => x(d[0]) + (x(d[1]) - x(d[0])) / 2)
      .attr('y', (d) => y(d.data.borough) + y.bandwidth() / 2 + 4.5)
      .attr('text-anchor', 'middle')
      .attr('fill', CHROME.barLabel)
      .attr('font-size', 11.5)
      .attr('font-weight', 600)
      .attr('pointer-events', 'none')
      .attr('opacity', (d) => dimOpacity(selectedBorough, d.data.borough))
      .text((d) => {
        const w = x(d[1]) - x(d[0]);
        return w > 40 ? `${(d[1] - d[0]).toFixed(2)}%` : '';
      });
  });

  const yAxis = g
    .append('g')
    .call(d3.axisLeft(y).tickSize(0))
    .call((a) => a.select('.domain').remove());

  yAxis
    .selectAll('text')
    .attr('fill', function () {
      const label = d3.select(this).text();
      return selectedBorough && label === selectedBorough ? '#0f172a' : CHROME.tick;
    })
    .attr('font-weight', function () {
      const label = d3.select(this).text();
      return selectedBorough && label === selectedBorough ? 600 : 400;
    })
    .attr('font-size', 12.5)
    .attr('dx', -8)
    .attr('cursor', onBoroughClick ? 'pointer' : 'default')
    .on('click', function (event) {
      event.stopPropagation();
      chartTooltip.hide();
      const borough = d3.select(this).text();
      onBoroughClick?.(borough);
    });

  g.append('g')
    .attr('transform', `translate(0,${iH})`)
    .call(d3.axisBottom(x).ticks(10).tickFormat((d) => `${d}%`))
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
    .text(
      selectedBorough
        ? `Chart 2 uses borough: ${selectedBorough} · click row again or Reset to clear`
        : '% of listings in borough (known response time only) · click a borough row to filter chart 2'
    );
}
