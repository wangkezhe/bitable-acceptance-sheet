const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const host = '127.0.0.1';
const port = Number(process.env.PORT || 4173);
const root = path.join(__dirname, 'dist');
const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

function sendFile(filePath, response) {
  const extension = path.extname(filePath).toLowerCase();
  response.writeHead(200, { 'Content-Type': types[extension] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(response);
}

http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, `http://${host}`).pathname);
  const target = path.resolve(root, pathname.replace(/^\/+/, ''));

  if (!target.startsWith(root)) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  fs.stat(target, (error, stats) => {
    if (!error && stats.isFile()) {
      sendFile(target, response);
      return;
    }

    sendFile(path.join(root, 'index.html'), response);
  });
}).listen(port, host, () => {
  console.log(`Preview ready at http://${host}:${port}`);
});
