import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const firstPort = Number(process.env.PORT) || 3001;

function canListen(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '0.0.0.0', () => server.close(() => resolve(true)));
  });
}

let port = firstPort;
while (port < firstPort + 20 && !(await canListen(port))) port += 1;
if (port >= firstPort + 20) throw new Error(`No available backend port found between ${firstPort} and ${firstPort + 19}.`);
if (port !== firstPort) console.warn(`[Vera dev] Backend port ${firstPort} is occupied; using ${port} for this run.`);

const concurrentlyCli = fileURLToPath(new URL('../node_modules/concurrently/dist/bin/concurrently.js', import.meta.url));
const child = spawn(process.execPath, [concurrentlyCli, '-k', '-n', 'backend,frontend', '-c', 'blue,green', 'npm:dev:server', 'npm:dev:client'], {
  stdio: 'inherit',
  env: { ...process.env, VERA_BACKEND_PORT: String(port), VERA_API_PORT: String(port) },
});

const stop = () => child.kill('SIGTERM');
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
child.once('error', (error) => { console.error('[Vera dev] Could not start dev processes:', error); process.exitCode = 1; });
child.once('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
