import { ConnectorService } from "./connector-service.js";
import { DashboardServer } from "./dashboard-server.js";

let runtime;

export async function getRuntime() {
  if (runtime) return runtime;
  const service = new ConnectorService();
  await service.start();
  const dashboard = new DashboardServer(service, service.logger);
  service.attachDashboard(dashboard);
  await dashboard.start();
  runtime = { service, dashboard };
  return runtime;
}

export async function stopRuntime() {
  if (!runtime) return;
  await runtime.service.stop();
  runtime = null;
}

