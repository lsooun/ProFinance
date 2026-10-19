import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from './app.mjs';

const port = Number(process.env.PF_PORT || process.env.PORT || 8787);
const dbPath = process.env.PF_DB_PATH || path.resolve('data/profinance.db');
const uploadDir = process.env.PF_UPLOAD_DIR || path.resolve('data/uploads');
const distDir = path.resolve('dist');
const secureCookie = process.env.PF_SECURE_COOKIE === '1';

const app = createApp({ dbPath, uploadDir, secureCookie });

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self' data:"
  );
}

function serveStatic(req, res) {
  securityHeaders(res);
  if (!fs.existsSync(distDir)) {
    res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>前端尚未构建</h1><p>请先运行 <code>npm run build</code>，再执行 <code>npm start</code>。</p>');
    return;
  }

  const url = new URL(req.url || '/', 'http://localhost');
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400).end('Bad Request');
    return;
  }

  let filePath = path.join(distDir, pathname);
  if (pathname.endsWith('/')) filePath = path.join(filePath, 'index.html');
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(distDir + path.sep) && resolved !== path.join(distDir, 'index.html')) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
    filePath = path.join(distDir, 'index.html');
  } else {
    filePath = resolved;
  }

  const ext = path.extname(filePath).toLowerCase();
  const stat = fs.statSync(filePath);
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

const server = createServer((req, res) => {
  if ((req.url || '').startsWith('/api')) {
    securityHeaders(res);
    app.handler(req, res);
    return;
  }
  serveStatic(req, res);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`ProFinance 已启动：http://127.0.0.1:${port}`);
  console.log(`数据文件：${dbPath}`);
  console.log(`附件目录：${uploadDir}`);
});

function shutdown() {
  server.close(() => {
    app.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
