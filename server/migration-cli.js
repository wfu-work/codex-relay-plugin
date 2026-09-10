import path from "node:path";
import { ConfigStore } from "./config-store.js";
import { EnvironmentService } from "./environment-service.js";
import { runPreparationJob } from "./migration-preparation.js";

const [configFlag, configDir, jobFlag, id] = process.argv.slice(2);
try {
  if (configFlag !== "--config-dir" || jobFlag !== "--job-id" || !path.isAbsolute(configDir || "")) throw new Error("Invalid preparation arguments");
  await runPreparationJob(configDir, id, { createEnvironment: async context => {
    const configStore = new ConfigStore({ configDir });
    await configStore.load();
    // Preflight does not start a connector or acquire an App Server writer.
    const service = { configStore, status: async () => ({ appServer: {}, relay: {} }) };
    return new EnvironmentService(service, { pluginRoot: context.pluginRoot, sharedRoot: context.sharedRoot, env: { ...process.env, CODEX_HOME: context.codexHome } });
  } });
} catch {
  // The job record carries a bounded, user-facing failure; never log config.
  process.exitCode = 1;
}
