/**
 * Roll up raw listing rows from listings.csv into chart-ready datasets.
 */

const BOROUGHS = ['Bronx', 'Brooklyn', 'Manhattan', 'Queens', 'Staten Island'];

/** Maps CSV host_response_time → stack keys. Rows not matching any key are skipped (excludes unknown). */
const RESPONSE_TO_KEY = {
  'within an hour': 'hour',
  'within a few hours': 'hours',
  'within a day': 'day',
  'a few days or more': 'days',
};

/** Stack segment keys — unknown host_response_time is never counted. */
export const STACK_KEYS = ['hour', 'hours', 'day', 'days'];

const RESPONSE_LABELS = {
  hour: 'Within an hour',
  hours: 'Within a few hours',
  day: 'Within a day',
  days: 'A few days or more',
};

export function responseLabel(key) {
  return RESPONSE_LABELS[key] ?? key;
}

/**
 * @param {{ roomType?: string, borough?: string, excludeZero?: boolean, neighborhood?: string }} f
 */
export function filterListings(rows, f = {}) {
  const room = f.roomType ?? 'all';
  const borough = f.borough ?? 'all';
  const neighborhood = f.neighborhood ?? 'all';
  const excludeZero = f.excludeZero ?? false;

  return rows.filter((row) => {
    if (room !== 'all') {
      if (Array.isArray(room)) {
        if (!room.includes(row.room_type)) return false;
      } else if (row.room_type !== room) {
        return false;
      }
    }

    if (borough !== 'all') {
      if (Array.isArray(borough)) {
        if (!borough.includes(row.neighbourhood_group_cleansed)) return false;
      } else if (row.neighbourhood_group_cleansed !== borough) {
        return false;
      }
    }

    if (excludeZero) {
      const price = _parsePrice(row.price);
      if (Number.isFinite(price) && Math.floor(price / 50) * 50 === 0) return false;
    }

    return true;
  });
}

export function aggregateResponseTimeByBorough(rows) {
  const counts = {};
  for (const b of BOROUGHS) {
    counts[b] = Object.fromEntries(STACK_KEYS.map((k) => [k, 0]));
  }

  for (const row of rows) {
    const boro = row.neighbourhood_group_cleansed;
    if (!counts[boro]) continue;

    const raw = (row.host_response_time || '').trim().toLowerCase();
    const key = RESPONSE_TO_KEY[raw];
    if (!key) continue;

    counts[boro][key]++;
  }

  return BOROUGHS.map((borough) => {
    const c = counts[borough];
    const total = STACK_KEYS.reduce((s, k) => s + c[k], 0);
    const out = { borough };
    for (const k of STACK_KEYS) {
      out[k] = total ? (100 * c[k]) / total : 0;
    }
    out._count = total;
    return out;
  })
    .filter((d) => d._count > 0)
    .map(({ _count, ...rest }) => rest);
}

const REVIEW_DIMS = [
  { field: 'review_scores_checkin', label: 'Check-in' },
  { field: 'review_scores_communication', label: 'Communication' },
  { field: 'review_scores_accuracy', label: 'Accuracy' },
  { field: 'review_scores_location', label: 'Location' },
  { field: 'review_scores_cleanliness', label: 'Cleanliness' },
  { field: 'review_scores_value', label: 'Value' },
];

export const ROOM_TYPES = [
  { csv: 'Entire home/apt', key: 'entire', color: '#2563eb', label: 'Entire home/apt' },
  { csv: 'Hotel room', key: 'hotel', color: '#c2410c', label: 'Hotel room' },
  { csv: 'Private room', key: 'private', color: '#be185d', label: 'Private room' },
  { csv: 'Shared room', key: 'shared', color: '#0f766e', label: 'Shared room' },
];

function num(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v).trim(), 10);
  return Number.isFinite(n) ? n : NaN;
}

export function aggregateReviewScoresByRoomType(rows) {
  const sums = {};
  const counts = {};

  for (const d of REVIEW_DIMS) {
    sums[d.field] = {};
    counts[d.field] = {};
    for (const rt of ROOM_TYPES) {
      sums[d.field][rt.key] = 0;
      counts[d.field][rt.key] = 0;
    }
  }

  for (const row of rows) {
    const rt = ROOM_TYPES.find((r) => r.csv === row.room_type);
    if (!rt) continue;

    for (const d of REVIEW_DIMS) {
      const v = num(row[d.field]);
      if (!Number.isFinite(v)) continue;
      sums[d.field][rt.key] += v;
      counts[d.field][rt.key] += 1;
    }
  }

  return REVIEW_DIMS.map((d) => {
    const row = { dim: d.field, dimLabel: d.label };
    for (const rt of ROOM_TYPES) {
      const c = counts[d.field][rt.key];
      row[rt.key] = c ? sums[d.field][rt.key] / c : NaN;
      row[`_n_${rt.key}`] = c;
    }
    return row;
  });
}

export { BOROUGHS };

/* ── Heatmap: Listing count × Room Type × Accommodates × Price ── */

export const HEATMAP_ROOMS = ['Entire home/apt', 'Hotel room', 'Private room', 'Shared room'];

export const HEATMAP_ACC_GROUPS = [
  '1 guest', '2 guests', '3-4 guests', '5-6 guests', '7+ guests',
];

export const HEATMAP_PRICE_GROUPS = [
  { label: '$0–$200', min: 0, max: 200 },
  { label: '$200–$400', min: 200, max: 400 },
  { label: '$400–$600', min: 400, max: 600 },
  { label: '$600–$1,000', min: 600, max: 1000 },
  { label: '$1,000+', min: 1000, max: Infinity },
];

function _accGroupOf(n) {
  if (n <= 1) return '1 guest';
  if (n <= 2) return '2 guests';
  if (n <= 4) return '3-4 guests';
  if (n <= 6) return '5-6 guests';
  return '7+ guests';
}

/**
 * Variable-width price bins (Option B):
 *   $0   – $200  → step $50   → 4 bins
 *   $200 – $500  → step $100  → 3 bins
 *   $500 – $1000 → step $250  → 2 bins
 *   $1000+       → 1 overflow bin
 * Total: 10 bins
 */
export const HEATMAP_PRICE_BINS = [0, 50, 100, 150, 200, 300, 400, 500, 750, 1000];

export function priceBinLabel(bin) {
  const next = { 0: 50, 50: 100, 100: 150, 150: 200, 200: 300, 300: 400, 400: 500, 500: 750, 750: 1000 };
  if (bin === 1000) return '$1,000+';
  return `$${bin}–$${next[bin]}`;
}

function _priceBinOf(price) {
  if (price < 200) return Math.floor(price / 50) * 50;
  if (price < 500) return Math.floor(price / 100) * 100;
  if (price < 1000) return Math.floor(price / 250) * 250;
  return 1000;
}

function _parsePrice(v) {
  return parseFloat(String(v ?? '').replace(/[$,\s]/g, ''));
}

/** Returns { counts, maxCount, total }
 *  counts[room][accGroup][priceBin] = number of listings
 *  priceBin uses variable-width bins (Option B).
 */
export function aggregateHeatmap(rows) {
  const counts = {};
  for (const r of HEATMAP_ROOMS) {
    counts[r] = {};
    for (const a of HEATMAP_ACC_GROUPS) counts[r][a] = {};
  }

  let total = 0;
  let maxCount = 0;

  for (const row of rows) {
    const rt = (row.room_type ?? '').trim();
    if (!HEATMAP_ROOMS.includes(rt)) continue;

    const acc = parseInt(row.accommodates ?? 0, 10);
    if (!acc) continue;

    const price = _parsePrice(row.price);
    if (!Number.isFinite(price) || price < 0) continue;

    const ag = _accGroupOf(acc);
    const bin = _priceBinOf(price);

    const prev = counts[rt][ag][bin] ?? 0;
    counts[rt][ag][bin] = prev + 1;
    if (prev + 1 > maxCount) maxCount = prev + 1;
    total++;
  }

  return { counts, maxCount, total };
}


/** Colors for the preferred room type stacked bar chart (matches Tableau palette). */
export const ROOM_TYPE_COLORS = {
  'Entire home/apt': '#b08fa8',
  'Hotel room': '#c9b84a',
  'Private room': '#2e6b4f',
  'Shared room': '#c4622a',
};

/** Ordered room types for stacking (bottom → top). */
export const ROOM_TYPE_STACK_ORDER = [
  'Private room',
  'Hotel room',
  'Entire home/apt',
  'Shared room',
];

/**
 * Aggregate number_of_reviews per (borough × room_type) as % of grand total.
 *
 * Returns:
 *   hoods  – boroughs present in data, in declared order
 *   types  – room types present in data, in stack order
 *   pct    – { [borough]: { [roomType]: number } }  (% of grand total)
 *   total  – grand total review count
 */
export function aggregatePreferredRoomType(rows) {
  const pivot = {};
  for (const b of BOROUGHS) {
    pivot[b] = {};
    for (const t of ROOM_TYPE_STACK_ORDER) pivot[b][t] = 0;
  }

  let total = 0;

  for (const row of rows) {
    const nb = (row.neighbourhood_group_cleansed ?? '').trim();
    const rt = (row.room_type ?? '').trim();
    const rev = parseFloat(row.number_of_reviews ?? 0);

    if (!nb || !rt || isNaN(rev)) continue;
    if (!pivot[nb]) pivot[nb] = {};
    if (!pivot[nb][rt]) pivot[nb][rt] = 0;

    pivot[nb][rt] += rev;
    total += rev;
  }

  const hoods = BOROUGHS.filter((b) =>
    Object.values(pivot[b] ?? {}).some((v) => v > 0)
  );

  const types = ROOM_TYPE_STACK_ORDER.filter((t) =>
    hoods.some((b) => (pivot[b]?.[t] ?? 0) > 0)
  );

  const pct = {};
  for (const b of hoods) {
    pct[b] = {};
    let boroughTotal = 0;
    for (const t of types) {
      boroughTotal += pivot[b][t] ?? 0;
    }
    for (const t of types) {
      pct[b][t] = boroughTotal > 0 ? (pivot[b][t] / boroughTotal) * 100 : 0;
    }
  }

  return { hoods, types, pct, total };
}

/* ── Chart 5: Rating Distribution (Pie chart) ── */

/**
 * Classify review_scores_rating into 3 groups: high (≥4.5), mid (4.0–4.5), low (<4.0).
 * Rows with empty / NaN rating are excluded.
 *
 * @param {object[]} rows – raw CSV rows (already filtered externally if needed)
 * @returns {Array<{ group: string, key: string, count: number }>}
 */
export function aggregateRatingDistribution(rows) {
  let high = 0;
  let mid = 0;
  let low = 0;

  for (const row of rows) {
    const raw = row.review_scores_rating;
    if (raw === '' || raw == null) continue;
    const v = typeof raw === 'number' ? raw : parseFloat(String(raw).trim());
    if (!Number.isFinite(v)) continue;

    if (v >= 4.5) high++;
    else if (v >= 4.0) mid++;
    else low++;
  }

  return [
    { group: 'Cao (≥4.5)', key: 'high', count: high },
    { group: 'Trung (4.0–4.5)', key: 'mid', count: mid },
    { group: 'Thấp (<4.0)', key: 'low', count: low },
  ];
}

/* ── Chart 6: Instant Bookable by Borough × Room Type ── */

/**
 * Aggregate listing count grouped by room_type → neighbourhood_group_cleansed → instant_bookable.
 *
 * @param {object[]} rows – raw CSV rows
 * @returns {{ roomTypes: string[], boroughs: string[], data: object }}
 *   data[roomType][borough] = { instant: N, notInstant: N, total: N }
 */
export function aggregateInstantBookable(rows) {
  const roomTypes = ['Entire home/apt', 'Hotel room', 'Private room', 'Shared room'];
  const boroughs = BOROUGHS;

  // Initialise
  const data = {};
  for (const rt of roomTypes) {
    data[rt] = {};
    for (const b of boroughs) {
      data[rt][b] = { instant: 0, notInstant: 0, total: 0 };
    }
  }

  for (const row of rows) {
    const rt = (row.room_type ?? '').trim();
    const nb = (row.neighbourhood_group_cleansed ?? '').trim();
    if (!data[rt] || !data[rt][nb]) continue;

    const ib = String(row.instant_bookable ?? '').trim().toLowerCase();
    if (ib === 't' || ib === '1' || ib === 'true') {
      data[rt][nb].instant++;
    } else {
      data[rt][nb].notInstant++;
    }
    data[rt][nb].total++;
  }

  return { roomTypes, boroughs, data };
}
