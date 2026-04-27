import { drawBarChart } from "../components/barChart";
import { drawPieChart } from "../components/pieChart";

export function initDashboard(data) {
  drawBarChart("#bar-chart", data);
  drawPieChart("#pie-chart", data);
}
