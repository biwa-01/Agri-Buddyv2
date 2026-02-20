/**
 * HTTPS reverse proxy for mobile dev (iOS Safari SpeechRecognition requires HTTPS).
 * Proxies https://0.0.0.0:3001 → http://localhost:3000 (including WebSocket for HMR).
 *
 * Usage: npm run dev (terminal 1) + npm run dev:s (terminal 2)
 *   Or:  npm run dev:s (spawns next dev automatically)
 */
import { createServer } from 'node:https';
import { request } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const key = readFileSync(join(root, 'certificates/localhost-key.pem'));
const cert = readFileSync(join(root, 'certificates/localhost.pem'));

// Spawn next dev if port 3000 is not already in use
const checkPort = () => new Promise(resolve => {
  const req = request({ hostname: 'localhost', port: 3000, path: '/', timeout: 500 });
  req.on('response', () => resolve(true));
  req.on('error', () => resolve(false));
  req.end();
});

const startNextDev = async () => {
  if (await checkPort()) {
    console.log('next dev already running on :3000');
    return;
  }
  console.log('Starting next dev on :3000 ...');
  const child = spawn('npx', ['next', 'dev'], { cwd: root, stdio: 'inherit' });
  child.on('exit', code => { console.log(`next dev exited (${code})`); process.exit(code ?? 1); });
  process.on('SIGINT', () => { child.kill('SIGINT'); process.exit(); });
  process.on('SIGTERM', () => { child.kill('SIGTERM'); process.exit(); });
  // Wait for next dev to be ready
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    if (await checkPort()) return;
  }
  console.error('next dev failed to start within 30s');
  child.kill();
  process.exit(1);
};

await startNextDev();

// HTTPS proxy server
const server = createServer({ key, cert }, (clientReq, clientRes) => {
  const proxyReq = request({
    hostname: 'localhost', port: 3000,
    path: clientReq.url, method: clientReq.method,
    headers: { ...clientReq.headers, host: 'localhost:3000' },
  }, proxyRes => {
    clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(clientRes);
  });
  clientReq.pipe(proxyReq);
  proxyReq.on('error', () => clientRes.end());
});

// WebSocket upgrade (Turbopack HMR)
server.on('upgrade', (req, socket, head) => {
  const proxyReq = request({
    hostname: 'localhost', port: 3000,
    path: req.url, method: 'GET',
    headers: { ...req.headers, host: 'localhost:3000' },
  });
  proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    const headers = Object.entries(proxyRes.headers)
      .map(([k, v]) => `${k}: ${v}`).join('\r\n');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\n${headers}\r\n\r\n`);
    if (proxyHead.length) socket.write(proxyHead);
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
    proxySocket.on('error', () => socket.end());
    socket.on('error', () => proxySocket.end());
  });
  proxyReq.on('error', () => socket.end());
  proxyReq.end();
});

server.listen(3001, '0.0.0.0', () => {
  console.log('\n  HTTPS proxy ready:');
  console.log('  - https://localhost:3001');
  console.log('  - https://192.168.11.12:3001');
  console.log('  → proxying to http://localhost:3000\n');
});
