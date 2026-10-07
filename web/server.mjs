// Tiny production server for InstaCloud: serves dist/ with SPA fallback, runtime config and a health check.
// Usage: npm run build && npm start   (PORT defaults to 8080)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, 'dist');
const port = Number(process.env.PORT) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
};

function runtimeConfig() {
  const env = process.env;
  return {
    supabaseUrl: env.SUPABASE_URL || env.VITE_SUPABASE_URL || '',
    supabaseAnonKey: env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '',
    demoTripId: env.DEMO_TRIP_ID || env.VITE_DEMO_TRIP_ID || '',
  };
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

async function serveFile(req, res, file, cache) {
  const ext = path.extname(file).toLowerCase();
  const info = await stat(file);
  res.writeHead(200, {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': cache,
  });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    const p = decodeURIComponent(url.pathname);

    if (p === '/api/health') {
      return send(res, 200, JSON.stringify({ ok: true, time: new Date().toISOString() }), {
        'Content-Type': 'application/json', 'Cache-Control': 'no-store',
      });
    }
    if (p === '/api/config') {
      return send(res, 200, JSON.stringify(runtimeConfig()), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    }
    if (p === '/config.js') {
      return send(res, 200, `window.__AUSFLIEGER_CONFIG__ = ${JSON.stringify(runtimeConfig())};\n`, {
        'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store',
      });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');

    const file = path.normalize(path.join(dist, p));
    if (!file.startsWith(dist)) return send(res, 400, 'Bad request');
    const isAsset = p.startsWith('/assets/');
    try {
      const info = await stat(file);
      if (info.isFile()) {
        return await serveFile(req, res, file, isAsset ? 'public, max-age=31536000, immutable' : 'no-cache');
      }
    } catch {
      if (isAsset || path.extname(p)) return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
    }
    // SPA fallback
    const html = await readFile(path.join(dist, 'index.html'));
    return send(res, 200, req.method === 'HEAD' ? '' : html, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-cache' });
  } catch (err) {
    console.error(err);
    send(res, 500, 'Internal server error');
  }
});

server.listen(port, () => console.log(`Ausflieger web listening on http://localhost:${port}`));
