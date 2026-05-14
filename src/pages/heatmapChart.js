import {
  HEATMAP_ROOMS,
  HEATMAP_ACC_GROUPS,
  HEATMAP_PRICE_BINS,
  priceBinLabel,
} from '../utils/aggregates.js';
import { chartTooltip } from '../components/tooltip.js';


function heatBg(val, max) {
  if (val === 0) return 'transparent';
  const t = Math.pow(val / max, 0.5);
  const r = 255;
  const g = Math.round(255 - t * (255 - 130));
  const b = Math.round(255 - t * (255 - 40));
  return `rgb(${r},${g},${b})`;
}

function heatText(val, max) {
  if (val === 0) return '#b4b2a9';
  return (val / max) > 0.55 ? '#4A1B0C' : '#2c2c2a';
}


/**
 * Render the heatmap into a <div> container using HTML Table.
 *
 * @param {string}  containerSelector
 * @param {{ counts, maxCount, total }} data
 * @param {{ roomFilter: string, accFilter: string, excludeZero: boolean }} options
 */
export function renderHeatmap(containerSelector, data, options = {}) {
  const root = document.querySelector(containerSelector);
  if (!root) return;
  root.innerHTML = '';

  if (!data || !data.counts) {
    root.textContent = 'No data.';
    return;
  }

  const roomFilter = options.roomFilter || 'all';
  const accFilter = options.accFilter || 'all';
  const priceBinFilter = options.priceBinFilter || 'all';

  /* ── Table Container ── */
  const tableWrap = document.createElement('div');
  tableWrap.className = 'heatmap-table-wrap';
  root.appendChild(tableWrap);

  /* ── Legend ── */
  const legendEl = document.createElement('div');
  legendEl.className = 'heatmap-legend';
  legendEl.innerHTML = `
    <span>Low</span>
    <div class="heatmap-legend-bar" id="hm-legend-bar"></div>
    <span>High</span>`;
  root.appendChild(legendEl);

  const legendBar = legendEl.querySelector('#hm-legend-bar');
  legendBar.innerHTML = Array.from({ length: 20 }, (_, i) => {
    const bg = heatBg(i / 19, 1);
    return `<span style="background:${bg || '#f1efe8'};"></span>`;
  }).join('');

  /* ── Main render logic ── */
    const rooms = Array.isArray(roomFilter)
      ? (roomFilter.length > 0 ? roomFilter : HEATMAP_ROOMS)
      : (roomFilter === 'all' ? HEATMAP_ROOMS : [roomFilter]);

    const accGroups = Array.isArray(accFilter)
      ? (accFilter.length > 0 ? accFilter : HEATMAP_ACC_GROUPS)
      : (accFilter === 'all' ? HEATMAP_ACC_GROUPS : [accFilter]);

    // Use the fixed variable-width bins
    let allBins = [...HEATMAP_PRICE_BINS];

    if (Array.isArray(priceBinFilter)) {
      if (priceBinFilter.length > 0) {
        const selectedBins = priceBinFilter.map(v => parseInt(v, 10));
        allBins = allBins.filter(b => selectedBins.includes(b));
      }
    } else if (priceBinFilter !== 'all') {
      const targetBin = parseInt(priceBinFilter, 10);
      allBins = allBins.filter(b => b === targetBin);
    }

    // Re-calculate max for the current filtered view to improve color contrast
    let localMax = 0;
    rooms.forEach(room => {
      accGroups.forEach(acc => {
        allBins.forEach(bin => {
          const val = data.counts[room]?.[acc]?.[bin] ?? 0;
          if (val > localMax) localMax = val;
        });
      });
    });
    if (localMax === 0) localMax = 1;

    let html = '<table class="heatmap-table"><thead><tr>';
    html += '<th class="col-type">Room Type</th>';
    html += '<th class="col-acc">Accommodates</th>';
    allBins.forEach(bin => { html += `<th>${priceBinLabel(bin)}</th>`; });
    html += '</tr></thead><tbody>';

    const colTotals = allBins.map(() => 0);

    rooms.forEach(room => {
      accGroups.forEach((acc, ai) => {
        html += '<tr>';
        if (ai === 0) {
          html += `<td class="type-label" rowspan="${accGroups.length}">${room}</td>`;
        }
        html += `<td class="acc-label">${acc}</td>`;
        
        allBins.forEach((bin, ci) => {
          const val = data.counts[room]?.[acc]?.[bin] ?? 0;
          colTotals[ci] += val;
          const bg = heatBg(val, localMax);
          const col = heatText(val, localMax);
          const txt = val > 0 ? val.toLocaleString() : '';
          
          // Data attributes for tooltip
          html += `<td style="background:${bg};color:${col};" 
                       data-room="${room}" data-acc="${acc}" data-bin="${bin}" data-val="${val}">
                    ${txt}
                   </td>`;
        });
        html += '</tr>';
      });
    });

    html += '</tbody></table>';

    tableWrap.innerHTML = html;

    // Attach tooltips
    const cells = tableWrap.querySelectorAll('tbody td[data-val]');
    cells.forEach(cell => {
      const val = parseInt(cell.getAttribute('data-val') || '0', 10);
      if (val === 0) return;
      
      const room = cell.getAttribute('data-room');
      const acc = cell.getAttribute('data-acc');
      const bin = parseInt(cell.getAttribute('data-bin'), 10);
      
      cell.addEventListener('mouseenter', (e) => {
        chartTooltip.show(
          `<div style="display:grid; grid-template-columns: auto auto; gap: 4px 16px; text-align: left;">
            <span style="color:#6b6b67">Accommodates:</span> <strong>${acc}</strong>
            <span style="color:#6b6b67">Room Type:</span> <strong>${room}</strong>
            <span style="color:#6b6b67">Price Range:</span> <strong>${priceBinLabel(bin)}</strong>
            <span style="color:#6b6b67">Total Listings:</span> <strong>${val.toLocaleString()}</strong>
          </div>`,
          e.clientX, e.clientY
        );
      });
      cell.addEventListener('mousemove', (e) => chartTooltip.move(e.clientX, e.clientY));
      cell.addEventListener('mouseleave', () => chartTooltip.hide());
    });
}
