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
 * @param {{
 *   roomFilter?: string|string[],
 *   accFilter?: string|string[],
 *   priceBinFilter?: string|string[],
 *   selectedCell?: { room, acc, bin }|null,
 *   onCellClick?: (room, acc, bin) => void,
 *   onRoomTypeClick?: (roomType: string) => void
 * }} options
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
  const selectedCell = options.selectedCell || null;
  const onCellClick = options.onCellClick;
  const onRoomTypeClick = options.onRoomTypeClick;

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

  /* ── Determine visible rows/cols ── */
  const rooms = Array.isArray(roomFilter)
    ? (roomFilter.length > 0 ? roomFilter : HEATMAP_ROOMS)
    : (roomFilter === 'all' ? HEATMAP_ROOMS : [roomFilter]);

  const accGroups = Array.isArray(accFilter)
    ? (accFilter.length > 0 ? accFilter : HEATMAP_ACC_GROUPS)
    : (accFilter === 'all' ? HEATMAP_ACC_GROUPS : [accFilter]);

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

  /* ── Re-calculate max for contrast ── */
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

  /* ── Build table HTML ── */
  let html = '<table class="heatmap-table"><thead><tr>';
  html += '<th class="col-type">Room Type</th>';
  html += '<th class="col-acc">Accommodates</th>';
  allBins.forEach(bin => { html += `<th>${priceBinLabel(bin)}</th>`; });
  html += '</tr></thead><tbody>';

  const hasSelected = selectedCell !== null;

  rooms.forEach(room => {
    accGroups.forEach((acc, ai) => {
      html += '<tr>';
      if (ai === 0) {
        // Room type cell — clickable, acts as cross-chart filter
        const rtSelected = hasSelected && selectedCell.room === room && selectedCell.acc === null;
        html += `<td class="type-label${rtSelected ? ' type-label--selected' : ''}" 
                     rowspan="${accGroups.length}" 
                     data-room-click="${room}" 
                     style="cursor:pointer;user-select:none;"
                     title="Click to filter all charts by this room type">${room}</td>`;
      }
      html += `<td class="acc-label">${acc}</td>`;

      allBins.forEach((bin, ci) => {
        const val = data.counts[room]?.[acc]?.[bin] ?? 0;
        const bg = heatBg(val, localMax);
        const col = heatText(val, localMax);
        const txt = val > 0 ? val.toLocaleString() : '';

        const isSel = hasSelected &&
          selectedCell.room === room &&
          selectedCell.acc === acc &&
          selectedCell.bin === bin;

        // Dimming: if there's a selection, dim non-selected cells
        let opacity = '1';
        let outline = '';
        let cursor = val > 0 ? 'cursor:pointer;' : '';
        if (hasSelected) {
          opacity = isSel ? '1' : '0.25';
          outline = isSel ? 'box-shadow:inset 0 0 0 2.5px #0f172a;' : '';
        }

        html += `<td style="background:${bg};color:${col};opacity:${opacity};${outline}${cursor}"
                     data-room="${room}" data-acc="${acc}" data-bin="${bin}" data-val="${val}">${txt}</td>`;
      });
      html += '</tr>';
    });
  });

  html += '</tbody></table>';
  tableWrap.innerHTML = html;

  /* ── Room Type label click → cross-chart filter ── */
  tableWrap.querySelectorAll('td[data-room-click]').forEach(td => {
    td.addEventListener('click', (e) => {
      e.stopPropagation();
      const room = td.getAttribute('data-room-click');
      onRoomTypeClick?.(room);
    });
  });

  /* ── Cell click ── */
  const cells = tableWrap.querySelectorAll('tbody td[data-val]');
  cells.forEach(cell => {
    const val = parseInt(cell.getAttribute('data-val') || '0', 10);
    const room = cell.getAttribute('data-room');
    const acc = cell.getAttribute('data-acc');
    const bin = parseInt(cell.getAttribute('data-bin'), 10);

    /* Tooltip */
    cell.addEventListener('mouseenter', (e) => {
      if (val === 0) return;
      chartTooltip.show(
        `<div style="display:grid; grid-template-columns: auto auto; gap: 4px 16px; text-align: left;">
          <span style="color:#6b6b67">Room Type:</span> <strong>${room}</strong>
          <span style="color:#6b6b67">Accommodates:</span> <strong>${acc}</strong>
          <span style="color:#6b6b67">Price Range:</span> <strong>${priceBinLabel(bin)}</strong>
          <span style="color:#6b6b67">Total Listings:</span> <strong>${val.toLocaleString()}</strong>
          ${hasSelected && !isCellSelected(selectedCell, room, acc, bin) ? '' :
            `<span style="color:#6b6b67;font-size:10px;grid-column:1/-1;margin-top:4px;opacity:0.7">Click to highlight this cell</span>`
          }
        </div>`,
        e.clientX, e.clientY
      );
    });
    cell.addEventListener('mousemove', (e) => chartTooltip.move(e.clientX, e.clientY));
    cell.addEventListener('mouseleave', () => chartTooltip.hide());

    /* Click */
    if (val > 0) {
      cell.addEventListener('click', (e) => {
        e.stopPropagation();
        onCellClick?.(room, acc, bin);
      });
    }
  });

  /* ── Click outside table → deselect ── */
  root.addEventListener('click', () => onCellClick?.(null, null, null));
}

function isCellSelected(selectedCell, room, acc, bin) {
  return selectedCell &&
    selectedCell.room === room &&
    selectedCell.acc === acc &&
    selectedCell.bin === bin;
}
