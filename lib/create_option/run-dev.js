/**
 * Starts the API server (port 3001) then Vite so live NIFTY works with a single: npm run dev
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const server = spawn('node', [path.join(__dirname, 'server.js')], {
  stdio: 'inherit',
  shell: true,
  cwd: __dirname,
});

const vite = spawn('npm', ['run', 'dev:vite'], {
  stdio: 'inherit',
  shell: true,
  cwd: __dirname,
  env: { ...process.env },
});

function killAll() {
  server.kill();
  vite.kill();
  process.exit(0);
}

process.on('SIGINT', killAll);
process.on('SIGTERM', killAll);

server.on('error', (err) => {
  console.error('API server failed to start:', err.message);
});
vite.on('error', (err) => {
  console.error('Vite failed to start:', err.message);
});
