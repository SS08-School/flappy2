import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { ASSET_FILES } from './public/assets.mjs';
import { SKINS } from './public/engine.mjs';

const scrypt = promisify(scryptCallback);
const root = dirname(fileURLToPath(import.meta.url));
export function weekStart(date = new Date()) {
  const d = new Date(date); d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  return d.toISOString().slice(0, 10);
}
export async function createApp({ database = resolve(root, 'data/flabby.sqlite'), now = () => Date.now() } = {}) {
  if (database !== ':memory:') await mkdir(dirname(database), { recursive: true });
  const db = new DatabaseSync(database);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE, salt TEXT NOT NULL, hash TEXT NOT NULL, skin TEXT NOT NULL DEFAULT 'classic', created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS runs (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), started INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS scores (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), score INTEGER NOT NULL, week TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS scores_week ON scores(week, user_id, score);
    CREATE TABLE IF NOT EXISTS rewards (user_id INTEGER NOT NULL REFERENCES users(id), week TEXT NOT NULL, rank INTEGER NOT NULL, UNIQUE(user_id, week));
    UPDATE users SET skin='classic' WHERE skin NOT IN ('classic','rose','blue');`);
  const limits = new Map();
  let requests = 0;
  const currentWeek = () => weekStart(new Date(now()));
  const board = (week) => db.prepare(`SELECT u.id, u.name, MAX(s.score) AS score, MIN(s.created) AS first_run FROM scores s JOIN users u ON u.id=s.user_id ${week ? 'WHERE s.week=?' : ''} GROUP BY u.id ORDER BY score DESC, first_run ASC, u.id ASC LIMIT 10`).all(...(week ? [week] : []));
  const award = () => {
    for (const { week } of db.prepare('SELECT DISTINCT week FROM scores WHERE week < ?').all(currentWeek())) {
      board(week).forEach((row, i) => db.prepare('INSERT OR IGNORE INTO rewards(user_id,week,rank) VALUES(?,?,?)').run(row.id, week, i + 1));
    }
  };
  const profile = (id) => {
    award();
    const user = db.prepare('SELECT id,name,skin FROM users WHERE id=?').get(id);
    const stats = db.prepare('SELECT COALESCE(MAX(score),0) AS best,COUNT(*) AS flights FROM scores WHERE user_id=?').get(id);
    const weekly = db.prepare('SELECT COALESCE(MAX(score),0) AS best FROM scores WHERE user_id=? AND week=?').get(id, currentWeek());
    const rewards = db.prepare('SELECT week,rank FROM rewards WHERE user_id=? ORDER BY week DESC').all(id);
    return { ...user, ...stats, weekly: weekly.best, rewards };
  };
  const sessionUser = (req) => {
    const token = req.headers.cookie?.match(/(?:^|;\s*)flabby_session=([a-f0-9]{64})(?:;|$)/)?.[1];
    return token ? db.prepare('SELECT user_id FROM sessions WHERE token=? AND expires>?').get(token, now())?.user_id : null;
  };
  const session = (id, req, res) => {
    const token = randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(token, id, now() + 30 * 86400000);
    const secure = globalThis.process?.env.COOKIE_SECURE === '1' || req.socket.encrypted;
    res.setHeader('Set-Cookie', `flabby_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure ? '; Secure' : ''}`);
  };
  const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
  const readBody = async (req) => {
    if (!req.headers['content-type']?.startsWith('application/json')) fail(415, 'Send JSON data.');
    let size = 0, chunks = [];
    for await (const chunk of req) { size += chunk.length; if (size > 4096) fail(413, 'Request is too large.'); chunks.push(chunk); }
    try { const data = JSON.parse(Buffer.concat(chunks).toString()); if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error(); return data; } catch { fail(400, 'Invalid JSON.'); }
  };
  const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    try {
      if (++requests % 100 === 0) {
        db.prepare('DELETE FROM sessions WHERE expires<?').run(now());
        db.prepare('DELETE FROM runs WHERE started<?').run(now() - 86400000);
        for (const [key, value] of limits) if (value.until < now()) limits.delete(key);
      }
      const path = new URL(req.url, 'http://localhost').pathname;
      if (!path.startsWith('/api/')) {
        if (req.method !== 'GET' && req.method !== 'HEAD') fail(405, 'Method not allowed.');
        const files = { '/': 'index.html', '/index.html': 'index.html', '/style.css': 'style.css', '/game.js': 'game.js', '/engine.mjs': 'engine.mjs', '/assets.mjs': 'assets.mjs' };
        for (const asset of ASSET_FILES) files[`/assets/flappy/${asset}`] = `assets/flappy/${asset}`;
        if (!Object.hasOwn(files, path)) fail(404, 'Page not found.');
        const file = files[path], content = await readFile(resolve(root, 'public', file));
        res.writeHead(200, { 'Content-Type': { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.png': 'image/png', '.wav': 'audio/wav' }[extname(file)], 'Cache-Control': 'no-cache', 'Content-Length': content.length });
        res.end(req.method === 'HEAD' ? undefined : content); return;
      }
      if (req.method !== 'GET') {
        if (req.headers.origin && req.headers.origin !== `${req.socket.encrypted ? 'https' : 'http'}://${req.headers.host}`) fail(403, 'Request origin is not allowed.');
        if (req.headers['sec-fetch-site'] === 'cross-site') fail(403, 'Request origin is not allowed.');
      }
      const userId = sessionUser(req);
      if (path === '/api/me' && req.method === 'GET') return json(res, 200, { user: userId ? profile(userId) : null });
      if ((path === '/api/register' || path === '/api/login') && req.method === 'POST') {
        const ip = req.socket.remoteAddress;
        const limit = limits.get(ip) || { count: 0, until: now() + 900000 };
        if (limit.until < now()) { limit.count = 0; limit.until = now() + 900000; }
        if (++limit.count > 20) fail(429, 'Too many attempts. Please try again in 15 minutes.');
        limits.set(ip, limit);
        const { name, password } = await readBody(req);
        if (typeof name !== 'string' || !/^[A-Za-z0-9_]{3,18}$/.test(name)) fail(400, 'Use 3–18 letters, numbers, or underscores for your name.');
        if (typeof password !== 'string' || password.length < 8 || password.length > 128) fail(400, 'Use a password between 8 and 128 characters.');
        let user = db.prepare('SELECT * FROM users WHERE name=?').get(name);
        if (path === '/api/register') {
          if (user) fail(409, 'That pilot name is already taken.');
          const salt = randomBytes(16).toString('hex');
          const hash = (await scrypt(password, salt, 64)).toString('hex');
          // Another request may have registered the same name while hashing.
          if (db.prepare('SELECT id FROM users WHERE name=?').get(name)) fail(409, 'That pilot name is already taken.');
          const result = db.prepare('INSERT INTO users(name,salt,hash,created) VALUES(?,?,?,?)').run(name, salt, hash, now());
          user = { id: Number(result.lastInsertRowid) };
        } else {
          const hash = await scrypt(password, user?.salt || 'unregistered-user-salt', 64);
          if (!user || !timingSafeEqual(Buffer.from(user.hash, 'hex'), hash)) fail(401, 'Pilot name or password is incorrect.');
        }
        session(user.id, req, res); return json(res, 200, { user: profile(user.id) });
      }
      if (path === '/api/logout' && req.method === 'POST') {
        const token = req.headers.cookie?.match(/flabby_session=([a-f0-9]{64})/)?.[1];
        if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(token);
        res.setHeader('Set-Cookie', 'flabby_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
        return json(res, 200, { ok: true });
      }
      if (path === '/api/leaderboard' && req.method === 'GET') {
        award();
        const allTime = new URL(req.url, 'http://localhost').searchParams.get('period') === 'all';
        const week = currentWeek(), reset = new Date(`${week}T00:00:00Z`); reset.setUTCDate(reset.getUTCDate() + 7);
        return json(res, 200, { entries: board(allTime ? null : week).map((row, i) => ({ rank: i + 1, name: row.name, score: row.score, you: row.id === userId })), week, resets: reset.toISOString() });
      }
      if (!userId) fail(401, 'Sign in to save your flight.');
      if (path === '/api/runs' && req.method === 'POST') {
        await readBody(req);
        const token = randomBytes(24).toString('hex');
        db.prepare('DELETE FROM runs WHERE user_id=?').run(userId);
        db.prepare('INSERT INTO runs VALUES(?,?,?)').run(token, userId, now());
        return json(res, 201, { token });
      }
      if (path === '/api/scores' && req.method === 'POST') {
        const { token, score } = await readBody(req);
        if (typeof token !== 'string' || !Number.isInteger(score) || score < 0 || score > 100000) fail(400, 'Invalid flight score.');
        const run = db.prepare('SELECT * FROM runs WHERE token=? AND user_id=?').get(token, userId);
        if (!run) fail(409, 'This flight has already been saved or has expired.');
        const seconds = (now() - run.started) / 1000;
        if (seconds > 86400 || score > Math.floor(seconds * .9) + 2) fail(400, 'Score does not match the flight duration.');
        db.exec('BEGIN');
        try {
          db.prepare('DELETE FROM runs WHERE token=?').run(token);
          db.prepare('INSERT INTO scores(user_id,score,week,created) VALUES(?,?,?,?)').run(userId, score, currentWeek(), now());
          db.exec('COMMIT');
        } catch (error) { db.exec('ROLLBACK'); throw error; }
        return json(res, 201, { user: profile(userId) });
      }
      if (path === '/api/skin' && req.method === 'POST') {
        const { skin } = await readBody(req);
        const outfit = SKINS.find(candidate => candidate.id === skin);
        if (!outfit || profile(userId).best < outfit.threshold) fail(400, 'This bird is still locked.');
        db.prepare('UPDATE users SET skin=? WHERE id=?').run(skin, userId);
        return json(res, 200, { user: profile(userId) });
      }
      fail(404, 'Route not found.');
    } catch (error) {
      if (!error.status) console.error(error);
      if (!res.headersSent) json(res, error.status || 500, { error: error.status ? error.message : 'Something went wrong. Please try again.' });
      else res.end();
    }
  });
  return { server, db, close: async () => { await new Promise(resolve => server.close(resolve)); db.close(); } };
}

if (typeof process !== 'undefined' && process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const app = await createApp();
  app.server.listen(port, '127.0.0.1', () => console.log(`Flabby Bird is ready at http://localhost:${port}`));
  app.server.on('error', error => { console.error(error.message); process.exitCode = 1; });
}
