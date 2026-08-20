import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vite = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const children = new Set();

function start(args) {
  const child = spawn(process.execPath, args, {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
  });
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}

function wait(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error('子进程退出：' + (signal || code)));
    });
  });
}

function stop() {
  for (const child of children) child.kill('SIGTERM');
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    stop();
    process.exit(0);
  });
}

await wait(start([vite, 'build']));
const watcher = start([vite, 'build', '--watch']);
const dashboard = start(['--watch', 'server/dashboard-cli.js']);

dashboard.once('exit', (code) => {
  watcher.kill('SIGTERM');
  process.exit(code || 0);
});
watcher.once('exit', (code) => {
  dashboard.kill('SIGTERM');
  process.exit(code || 0);
});
