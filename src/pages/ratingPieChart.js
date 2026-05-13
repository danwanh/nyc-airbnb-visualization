import * as d3 from 'd3';
import { chartTooltip } from '../components/tooltip.js';
import { CHROME } from '../utils/palette.js';

/** Color mapping for rating groups */
const RATING_COLORS = {
  high: '#2563eb',  // blue — "Cao (≥4.5)"
  mid:  '#ea580c',  // orange — "Trung (4.0–4.5)"
  low:  '#dc2626',  // red — "Thấp (<4.0)"
};

/**
 * Render a pie chart showing rating distribution.
 *
 * @param {string} containerSelector  CSS selector of the <svg>
 * @param {Array<{ group: string, key: string, count: number }>} data  from aggregateRatingDistribution
 * @param {object} [options]
 */
export function renderRatingPie(containerSelector, data, options = {}) {
  const W = 340;
  const H = 300;
  const radius = 110;
  const cx = W / 2;   // 170
  const cy = H / 2;   // 150

  const svg = d3.select(containerSelector);
  svg.selectAll('*').remove();

  svg
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('width', '100%')
    .attr('preserveAspectRatio', 'xMinYMin meet')
    .attr('style', 'display:block;max-width:100%;height:auto');

  const total = d3.sum(data, (d) => d.count);

  // Empty state
  if (!data.length || total === 0) {
    svg
      .append('text')
      .attr('x', cx)
      .attr('y', cy)
      .attr('text-anchor', 'middle')
      .attr('fill', CHROME.tick)
      .attr('font-size', 13)
      .text('Không có dữ liệu.');
    return;
  }

  const g = svg.append('g').attr('transform', `translate(${cx},${cy})`);

  const pie = d3.pie()
    .value((d) => d.count)
    .sort(null);

  const arc = d3.arc()
    .innerRadius(0)
    .outerRadius(radius);

  const arcs = pie(data);

  // Wedges
  g.selectAll('path')
    .data(arcs)
    .join('path')
    .attr('d', arc)
    .attr('fill', (d) => RATING_COLORS[d.data.key])
    .attr('stroke', '#fff')
    .attr('stroke-width', 2)
    .attr('cursor', 'pointer')
    .on('mouseenter', (event, d) => {
      const pct = ((d.data.count / total) * 100).toFixed(1);
      chartTooltip.show(
        `<span style="color:#6b6b67">Nhóm:</span> <strong>${d.data.group}</strong><br/>` +
        `<span style="color:#6b6b67">Số listing:</span> <strong>${d3.format(',')(d.data.count)}</strong><br/>` +
        `<span style="color:#6b6b67">Tỉ lệ:</span> <strong>${pct}%</strong>`,
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

  // Labels inside wedge (only if arc angle > 20 degrees ≈ 0.349 rad)
  const MIN_ANGLE = (20 * Math.PI) / 180;

  g.selectAll('text')
    .data(arcs)
    .join('text')
    .attr('transform', (d) => `translate(${arc.centroid(d)})`)
    .attr('text-anchor', 'middle')
    .attr('dy', '0.35em')
    .attr('fill', '#fff')
    .attr('font-size', 12)
    .attr('font-weight', 600)
    .attr('pointer-events', 'none')
    .text((d) => {
      if (d.endAngle - d.startAngle < MIN_ANGLE) return '';
      return `${((d.data.count / total) * 100).toFixed(1)}%`;
    });
}
