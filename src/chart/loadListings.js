import * as d3 from 'd3';

const CSV_URL = '/data/listings.csv';

export async function loadListings() {
  return d3.csv(CSV_URL);
}
