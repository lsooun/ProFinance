import { spawn } from 'node:child_process';
import path from 'node:path';

const isWindows = process.platform === 'win32';
const apiPort = process.env.PF_PORT || '8787';

const api = spawn(
  process.execPath,
  ['--disable-warning=ExperimentalWarning', '--watch', 'server/index.mjs'],
  {
    stdio: 'inherit',
    env: { ...process.env, PF_PORT: apiPort },
    shell: isWindows,
  }
);

const viteBin = path.resolve('node_modules', 'vite', 'bin', 'vite.js');
const vite = spawn(process.execPath, [viteBin], {
  stdio: 'inherit',
  env: { ...process.env, PF_API_PORT: apiPort },
  shell: isWindows,
});

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of [api, vite]) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 300);
}

api.on('exit', (code) => {
  if (!shuttingDown) {
    console.error(`[api] 进程退出，代码 ${code ?? 0}`);
    shutdown(code ?? 1);
  }
});
vite.on('exit', (code) => {
  if (!shuttingDown) shutdown(code ?? 1);
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
