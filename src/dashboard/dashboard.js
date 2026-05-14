import { drawBarChart } from "../pages/barChart";
import { drawPieChart } from "../pages/pieChart";

export function initDashboard(data) {
  drawBarChart("#bar-chart", data);
  drawPieChart("#pie-chart", data);
}
