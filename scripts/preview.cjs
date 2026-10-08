const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const port = Number(process.env.AUP_PREVIEW_PORT || 8768);
const routes = new Map([
  ['/s', ['preview.html', 'text/html; charset=utf-8']],
  ['/amazon-unit-price.user.js', ['amazon-unit-price.user.js', 'text/javascript; charset=utf-8']]
]);
const server = http.createServer((request, response) => {
  const route = routes.get(new URL(request.url, 'http://localhost').pathname);
  if (!route) { response.writeHead(404); response.end('Not found'); return; }
  response.writeHead(200, { 'Content-Type': route[1], 'Cache-Control': 'no-store' });
  response.end(fs.readFileSync(path.join(root, route[0])));
});
server.listen(port, '127.0.0.1', () => console.log(`Local preview: http://127.0.0.1:${port}/s`));
// Temporary preview process; it cannot remain running indefinitely.
setTimeout(() => server.close(), 15 * 60 * 1000).unref();
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
