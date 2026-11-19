import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSET_FILES } from './public/assets.mjs';

const root = dirname(fileURLToPath(import.meta.url));
export async function createApp() {
  const files = { '/': 'index.html', '/index.html': 'index.html', '/style.css': 'style.css', '/game.js': 'game.js', '/engine.mjs': 'engine.mjs', '/assets.mjs': 'assets.mjs' };
  for (const asset of ASSET_FILES) files[`/assets/flappy/${asset}`] = `assets/flappy/${asset}`;
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.png': 'image/png' };
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
    const path = new URL(req.url, 'http://localhost').pathname;
    if (!Object.hasOwn(files, path)) { res.writeHead(404); res.end(); return; }
    try {
      const file = files[path], content = await readFile(resolve(root, 'public', file));
      res.writeHead(200, { 'Content-Type': types[extname(file)], 'Cache-Control': 'no-cache', 'Content-Length': content.length });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) { console.error(error); res.writeHead(500); res.end(); }
  });
  return { server, close: () => new Promise(resolve => server.close(resolve)) };
}

if (typeof process !== 'undefined' && process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000), app = await createApp();
  app.server.listen(port, '127.0.0.1', () => console.log(`Flappy Bird is ready at http://localhost:${port}`));
  app.server.on('error', error => { console.error(error.message); process.exitCode = 1; });
}
