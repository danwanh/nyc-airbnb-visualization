/**
 * Accessible Color Palette
 * Optimized for color-blind accessibility
 * Based on Okabe-Ito + Tableau + Viridis principles
 */

/** Boroughs (5) — Okabe-Ito core */
export const BOROUGH_COLORS = {
  Bronx:           "#E69F00", // Amber
  Brooklyn:        "#56B4E9", // Sky blue
  Manhattan:       "#009E73", // Teal green
  Queens:          "#CC79A7", // Rose pink
  "Staten Island": "#0072B2", // Deep blue
};

/** Room Types (4) */
export const ROOM_TYPE_COLORS = {
  'Entire home/apt': '#D55E00', // Vermillion
  'Private room':    '#F0E442', // Yellow
  'Hotel room':      '#44AA99', // Mint (Paul Tol)
  'Shared room':     '#882255', // Wine (Paul Tol)
};

/** Host Response Time (4) */
export const RESPONSE_COLORS = {
  hour:  '#117733', // Forest green  (Paul Tol)
  hours: '#88CCEE', // Light cyan    (Paul Tol)
  day:   '#DDCC77', // Sand yellow   (Paul Tol)
  days:  '#AA4499', // Purple        (Paul Tol)
};

/** Ratings (3) — diverging */
export const RATING_COLORS = {
  high: '#332288', // Indigo  (Paul Tol)
  mid:  '#E0E0E0', // Neutral grey
  low:  '#AA4422', // Brick red (Paul Tol)
};

/** Instant Bookable (2) */
export const IB_COLORS = {
  instant:    '#6699CC', // Slate blue (Paul Tol)
  notInstant: '#999999', // Grey
};

/** Heatmap — ColorBrewer Oranges, dùng riêng cho heatmap */
export const HEATMAP_COLORS = [
  "#fff5eb","#fee6ce","#fdd0a2","#fdae6b",
  "#fd8d3c","#f16913","#d94801","#8c2d04"
];

/** UI Chrome */
export const CHROME = {
  grid: "#E2E8F0",
  axisLine: "#CBD5E1",
  tick: "#64748B",
  caption: "#475569",

  medianLine: "#475569",
  iqrBand: "#E0E7FF",
  rangeLine: "#94A3B8",

  dotStroke: "#FFFFFF",
  dotStrokeHover: "#6366F1",

  barLabel: "#0F172A",

  selectionFill: "#6366F1",
};

export const SELECTION_FILL = CHROME.selectionFill;
