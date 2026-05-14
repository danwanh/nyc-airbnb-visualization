import * as d3 from 'd3';
import { ROOM_TYPE_COLORS, ROOM_TYPE_STACK_ORDER } from '../utils/aggregates.js';
import { chartTooltip } from '../components/tooltip.js';
import { CHROME } from '../utils/palette.js';

/**
 * Vertical stacked bar chart: % of number_of_reviews within each borough
 * per borough × room type — mirrors the Tableau "Preferred room type" view.
 *
 * @param {string} containerSelector  – CSS selector of an <svg> element
 * @param {{ hoods: string[], types: string[], pct: object, total: number }} data
 * @param {{
 *   selectedBorough?: string|null,
 *   selectedSegment?: { hood: string, roomType: string }|null,
 *   onSegmentClick?: (hood: string, roomType: string) => void
 * }} [options]
 */
export function renderStackBarChart(containerSelector, data, options = {}) {
  const { selectedBorough = null, selectedSegment = null, onSegmentClick } = options;
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
  const yMax = 100;
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

  /* ── Helper: is this segment the selected one? ── */
  const isSelected = (hood, roomType) =>
    selectedSegment && selectedSegment.hood === hood && selectedSegment.roomType === roomType;
  const hasSelection = selectedSegment !== null;
  // Also dim based on borough if no segment selected
  const hasBoroughSel = selectedBorough !== null;

  /* ── Bars + labels ── */
  stacked.forEach((layer) => {
    const roomType = layer.key;
    const color = ROOM_TYPE_COLORS[roomType] ?? '#888';

    // ── Bar segments
    g.selectAll(null)
      .data(layer)
      .join('rect')
      .attr('class', 'stack-bar-rect')
      .attr('x', (d) => x(d.data.hood))
      .attr('y', (d) => y(Math.min(d[1], yMax)))
      .attr('height', (d) => {
        const top    = Math.min(d[1], yMax);
        const bottom = Math.min(d[0], yMax);
        return Math.max(0, y(bottom) - y(top));
      })
      .attr('width', x.bandwidth())
      .attr('fill', color)
      .attr('opacity', (d) => {
        if (hasSelection) {
          return isSelected(d.data.hood, roomType) ? 1 : 0.18;
        }
        if (hasBoroughSel) return d.data.hood === selectedBorough ? 1 : 0.28;
        return 1;
      })
      .attr('stroke', (d) => isSelected(d.data.hood, roomType) ? '#0f172a' : 'none')
      .attr('stroke-width', (d) => isSelected(d.data.hood, roomType) ? 2 : 0)
      .attr('rx', (d) => isSelected(d.data.hood, roomType) ? 2 : 0)
      .style('cursor', 'pointer')
      .on('mouseenter', function(event, d) {
        const nb = d.data.hood;
        const val = (d[1] - d[0]).toFixed(1);
        // Hover highlight
        if (!isSelected(nb, roomType)) {
          d3.select(this).attr('opacity', 0.9).attr('stroke', '#64748b').attr('stroke-width', 1.5);
        }
        chartTooltip.show(
          `<div style="display:grid; grid-template-columns: auto auto; gap: 4px 16px; text-align: left;">
            <span style="color:#6b6b67">Room Type:</span> <strong style="color:${color}">${roomType}</strong>
            <span style="color:#6b6b67">Borough:</span> <strong>${nb}</strong>
            <span style="color:#6b6b67">Share:</span> <strong>${val}%</strong>
            <span style="color:#6b6b67;font-size:10px;grid-column:1/-1;margin-top:4px;opacity:0.7">Click to filter all charts</span>
          </div>`,
          event.clientX,
          event.clientY
        );
      })
      .on('mousemove', (event) => chartTooltip.move(event.clientX, event.clientY))
      .on('mouseleave', function(event, d) {
        const nb = d.data.hood;
        // Restore original opacity
        d3.select(this)
          .attr('opacity', () => {
            if (hasSelection) return isSelected(nb, roomType) ? 1 : 0.18;
            if (hasBoroughSel) return nb === selectedBorough ? 1 : 0.28;
            return 1;
          })
          .attr('stroke', isSelected(nb, roomType) ? '#0f172a' : 'none')
          .attr('stroke-width', isSelected(nb, roomType) ? 2 : 0);
        chartTooltip.hide();
      })
      .on('click', function(event, d) {
        event.stopPropagation();
        onSegmentClick?.(d.data.hood, roomType);
      });

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
      .attr('opacity', (d) => {
        if (hasSelection) return isSelected(d.data.hood, roomType) ? 1 : 0.18;
        if (hasBoroughSel) return d.data.hood === selectedBorough ? 1 : 0.28;
        return 1;
      })
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
      .attr('fill', (b) => {
        if (hasSelection && selectedSegment.hood === b) return '#0f172a';
        if (hasBoroughSel && b === selectedBorough) return '#0f172a';
        return CHROME.tick;
      })
      .attr('font-weight', (b) => {
        if (hasSelection && selectedSegment.hood === b) return 700;
        if (hasBoroughSel && b === selectedBorough) return 600;
        return 400;
      })
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

  /* ── Click backdrop to deselect ── */
  svg.on('click', () => onSegmentClick?.(null, null));
}
