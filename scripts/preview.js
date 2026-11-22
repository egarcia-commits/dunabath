#!/usr/bin/env node
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const BASE = String(cfg.site.basePath || '').replace(/\/$/, '') || '';
const PORT = Number(process.env.PORT || 4173);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function resolve(urlPath) {
  let p = decodeURIComponent((urlPath || '/').split('?')[0]);
  if (BASE && (p === BASE || p === BASE + '/')) p = '/';
  else if (BASE && p.startsWith(BASE + '/')) p = p.slice(BASE.length);
  if (p.endsWith('/')) p += 'index.html';
  const rel = p.replace(/^\/+/, '');
  const file = path.normalize(path.join(DIST, rel));
  if (!file.startsWith(DIST)) return null;
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  if (fs.existsSync(file + '.html')) return file + '.html';
  const asDir = path.join(file, 'index.html');
  if (fs.existsSync(asDir)) return asDir;
  return null;
}

const server = http.createServer((req, res) => {
  const file = resolve(req.url);
  if (!file) {
    const f404 = path.join(DIST, '404.html');
    const body = fs.existsSync(f404) ? fs.readFileSync(f404) : 'Not found';
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(body);
    return;
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('Preview http://127.0.0.1:' + PORT + (BASE || '/') );
});
