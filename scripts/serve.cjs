const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep) || !types[path.extname(file)]) {
    res.writeHead(404).end(); return;
  }
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] + '; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(4173, '127.0.0.1', () => console.log('Sahra: http://127.0.0.1:4173'));
