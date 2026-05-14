import * as d3 from 'd3';
import { chartTooltip } from '../components/tooltip.js';
import { CHROME } from '../utils/palette.js';

/** Color mapping for rating groups */
const RATING_COLORS = {
  high: '#2563eb',  // blue — "High (≥4.5)"
  mid:  '#ea580c',  // orange — "Mid (4.0–4.5)"
  low:  '#dc2626',  // red — "Low (<4.0)"
};

/** Rating group labels for legend */
const RATING_LABELS = [
  { key: 'high', group: 'High (≥4.5)' },
  { key: 'mid',  group: 'Mid (4.0–4.5)' },
  { key: 'low',  group: 'Low (<4.0)' },
];

/** Ordered list of NYC boroughs */
const BOROUGH_ORDER = ['Bronx', 'Brooklyn', 'Manhattan', 'Queens', 'Staten Island'];

/**
 * Render 5 small-multiple pie charts — one per NYC borough — showing
 * rating distribution (high / mid / low).
 *
 * @param {string} containerSelector  CSS selector of the <svg>
 * @param {Object<string, Array<{ group: string, key: string, count: number }>>} data
 *   Object keyed by borough name; each value is an array from
 *   aggregateRatingDistributionByBorough.
 * @param {object} [options]
 * @param {string|null} [options.selectedBorough]  Currently selected borough (for highlighting)
 * @param {function}     [options.onBoroughClick]   Called with borough name when a pie is clicked
 */
export function renderRatingPie(containerSelector, data, options = {}) {
  const { selectedBorough = null, onBoroughClick } = options;

  /* ── Layout constants ── */
  const COLS       = 5;
  const PIE_RADIUS = 70;
  const CELL_W     = 180;          // width per borough column
  const TITLE_H    = 22;           // space for borough title
  const PIE_AREA_H = PIE_RADIUS * 2 + 10; // vertical space for pie
  const LEGEND_H   = 30;           // bottom legend row
  const PAD_TOP    = 10;
  const PAD_BOTTOM = 8;

  const W = CELL_W * COLS;
  const H = PAD_TOP + TITLE_H + PIE_AREA_H + LEGEND_H + PAD_BOTTOM;

  const svg = d3.select(containerSelector);
  svg.selectAll('*').remove();

  svg
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('width', '100%')
    .attr('preserveAspectRatio', 'xMinYMin meet')
    .attr('style', 'display:block;max-width:100%;height:auto');

  const pie = d3.pie()
    .value((d) => d.count)
    .sort(null);

  const arc = d3.arc()
    .innerRadius(0)
    .outerRadius(PIE_RADIUS);

  const MIN_ANGLE = (20 * Math.PI) / 180; // ~0.349 rad

  /* ── Render each borough ── */
  BOROUGH_ORDER.forEach((borough, i) => {
    const cx = i * CELL_W + CELL_W / 2;
    const cy = PAD_TOP + TITLE_H + PIE_AREA_H / 2;

    const boroughData = data[borough] || [];
    const total = d3.sum(boroughData, (d) => d.count);

    // Dim non-selected boroughs when a borough is selected
    const isDimmed = selectedBorough && selectedBorough !== borough;
    const isActive = selectedBorough === borough;

    // Borough title (clickable)
    svg.append('text')
      .attr('x', cx)
      .attr('y', PAD_TOP + TITLE_H / 2 + 2)
      .attr('text-anchor', 'middle')
      .attr('fill', isActive ? '#1d4ed8' : CHROME.tick)
      .attr('font-size', isActive ? 13 : 12)
      .attr('font-weight', 600)
      .attr('cursor', onBoroughClick ? 'pointer' : 'default')
      .attr('text-decoration', isActive ? 'underline' : 'none')
      .text(borough)
      .on('click', () => { if (onBoroughClick) onBoroughClick(borough); });

    // Empty-state
    if (!boroughData.length || total === 0) {
      svg.append('text')
        .attr('x', cx)
        .attr('y', cy)
        .attr('text-anchor', 'middle')
        .attr('fill', CHROME.tick)
        .attr('font-size', 11)
        .attr('opacity', isDimmed ? 0.3 : 1)
        .text('No data');
      return;
    }

    const g = svg.append('g')
      .attr('transform', `translate(${cx},${cy})`)
      .attr('opacity', isDimmed ? 0.3 : 1);

    const arcs = pie(boroughData);

    // Wedges
    g.selectAll('path')
      .data(arcs)
      .join('path')
      .attr('d', arc)
      .attr('fill', (d) => RATING_COLORS[d.data.key])
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .attr('cursor', 'pointer')
      .on('click', () => { if (onBoroughClick) onBoroughClick(borough); })
      .on('mouseenter', (event, d) => {
        const pct = ((d.data.count / total) * 100).toFixed(1);
        chartTooltip.show(
          `<span style="color:#6b6b67">${borough}</span><br/>` +
          `<span style="color:#6b6b67">Group:</span> <strong>${d.data.group}</strong><br/>` +
          `<span style="color:#6b6b67">Listings:</span> <strong>${d3.format(',')(d.data.count)}</strong><br/>` +
          `<span style="color:#6b6b67">Share:</span> <strong>${pct}%</strong>`,
          event.clientX,
          event.clientY,
        );
      })
      .on('mousemove', (event) => {
        chartTooltip.move(event.clientX, event.clientY);
      })
      .on('mouseleave', () => {
        chartTooltip.hide();
      });

    // Percentage labels inside wedge (only if arc angle > 20°)
    g.selectAll('text')
      .data(arcs)
      .join('text')
      .attr('transform', (d) => `translate(${arc.centroid(d)})`)
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('fill', '#fff')
      .attr('font-size', 10)
      .attr('font-weight', 600)
      .attr('pointer-events', 'none')
      .text((d) => {
        if (d.endAngle - d.startAngle < MIN_ANGLE) return '';
        return `${((d.data.count / total) * 100).toFixed(1)}%`;
      });
  });

  /* ── Shared legend ── */
  const legendY = PAD_TOP + TITLE_H + PIE_AREA_H + 6;
  const legendG = svg.append('g')
    .attr('transform', `translate(${W / 2}, ${legendY})`);

  const ITEM_W = 130; // width reserved per legend item
  const startX = -(RATING_LABELS.length * ITEM_W) / 2;

  RATING_LABELS.forEach((item, i) => {
    const x = startX + i * ITEM_W;

    legendG.append('rect')
      .attr('x', x)
      .attr('y', 0)
      .attr('width', 12)
      .attr('height', 12)
      .attr('rx', 2)
      .attr('fill', RATING_COLORS[item.key]);

    legendG.append('text')
      .attr('x', x + 16)
      .attr('y', 10)
      .attr('fill', CHROME.tick)
      .attr('font-size', 11)
      .text(item.group);
  });
}
