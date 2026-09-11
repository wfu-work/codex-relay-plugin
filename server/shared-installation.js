import path from 'node:path';
import { readJson } from './shared-backend-manager.js';

// Resolve only the package selected by local configuration. An older prepared
// artifact or migration result must never override the active installation.
export async function configuredSharedManifest(environment) {
  const config = environment.service.configStore.get?.().codex;
  if (config?.connectionMode !== 'shared' || !config.appServerEndpoint?.startsWith('unix://')) return null;
  const socket = config.appServerEndpoint.slice(7);
  if (!path.isAbsolute(socket) || path.basename(socket) !== 'rpc.sock') return null;
  const root = path.dirname(socket);
  const packages = path.join(environment.service.configStore.configDir, 'migration/packages');
  if (path.dirname(root) !== packages && root !== environment.sharedRoot) return null;
  const manifest = await readJson(path.join(root, 'manifest.json'), null).catch(() => null);
  if (!manifest || manifest.root !== root || manifest.endpoint !== config.appServerEndpoint
    || manifest.codexHome !== environment.codexHome
    || manifest.relayConfig !== path.join(environment.service.configStore.configDir, 'config.json')) return null;
  return manifest;
}

export async function sharedInstallation(environment) {
  const manifest = await configuredSharedManifest(environment);
  if (!manifest) return null;
  const activation = await readJson(path.join(manifest.root, 'activation.json'), null).catch(() => null);
  return { root: manifest.root, endpoint: manifest.endpoint, codexHome: manifest.codexHome,
    state: activation?.phase === 'active' ? 'active' : 'configured',
    activated: activation?.phase === 'active', activatedAt: activation?.activatedAt || null };
}
