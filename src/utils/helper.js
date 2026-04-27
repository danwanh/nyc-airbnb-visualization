import * as d3 from "d3";

export async function loadData() {
  // return await d3.csv("/data/listings.csv", d3.autoType);
  return await d3.json("/data/data.json", d3.autoType);
}
