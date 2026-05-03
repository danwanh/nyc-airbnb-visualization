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
 * @param {{ roomType?: string, borough?: string }} f - Use 'all' or omit for no filter.
 */
export function filterListings(rows, f = {}) {
  const room = f.roomType ?? 'all';
  const borough = f.borough ?? 'all';
  return rows.filter((row) => {
    if (room !== 'all' && row.room_type !== room) return false;
    if (borough !== 'all' && row.neighbourhood_group_cleansed !== borough) return false;
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
