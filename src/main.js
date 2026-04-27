import { loadData } from "./utils/helper";
import { initDashboard } from "./dashboard/dashboard";

loadData().then(data => {
  initDashboard(data);
});
