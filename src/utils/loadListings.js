import * as d3 from 'd3';

const CSV_URL = '/data/listings_cleaned_final_mergeX_23-3.csv';

export async function loadListings() {
  return d3.csv(CSV_URL);
}
