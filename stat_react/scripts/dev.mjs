/**
 * Starts the API server first, reads LISTEN_PORT from its stdout, then starts Vite
 * with matching NIFTYOPTIMA_PORT so the dev proxy stays aligned (handles EADDRINUSE).
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const LISTEN_RE = /\[NiftyOptima\] LISTEN_PORT=(\d+)/;

const server = spawn(process.execPath, ['server/index.mjs'], {
  cwd: root,
  stdio: ['inherit', 'pipe', 'pipe'],
  env: { ...process.env },
});

let vite = null;
let buf = '';
let started = false;
let stopping = false;

const timeout = setTimeout(() => {
  console.error('[dev] Timed out waiting for API server LISTEN_PORT');
  shutdown(1);
}, 60_000);

function shutdown(code) {
  if (stopping) return;
  stopping = true;
  clearTimeout(timeout);
  if (vite && !vite.killed) vite.kill('SIGTERM');
  if (!server.killed) server.kill('SIGTERM');
  process.exit(code);
}

function startVite(portStr) {
  const viteJs = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  vite = spawn(process.execPath, [viteJs], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, NIFTYOPTIMA_PORT: portStr },
  });
  vite.on('exit', (code) => {
    if (stopping) return;
    stopping = true;
    clearTimeout(timeout);
    if (!server.killed) server.kill('SIGTERM');
    process.exit(code ?? 0);
  });
}

server.stdout.on('data', (chunk) => {
  const text = chunk.toString();
  process.stdout.write(chunk);
  if (!started) {
    buf += text;
    const m = buf.match(LISTEN_RE);
    if (m) {
      started = true;
      clearTimeout(timeout);
      startVite(m[1]);
      buf = '';
    } else if (buf.length > 16_384) {
      buf = buf.slice(-8192);
    }
  }
});

server.stderr.on('data', (chunk) => {
  process.stderr.write(chunk);
});

server.on('exit', (code) => {
  clearTimeout(timeout);
  if (!started) {
    console.error('[dev] API server exited before LISTEN_PORT');
    process.exit(1);
  }
  if (stopping) return;
  console.error('[dev] API server exited unexpectedly');
  stopping = true;
  if (vite && !vite.killed) vite.kill('SIGTERM');
  process.exit(code === 0 || code === null ? 1 : code);
});

process.on('SIGINT', () => shutdown(130));
process.on('SIGTERM', () => shutdown(143));
