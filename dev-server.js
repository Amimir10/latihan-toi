const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 5173;
const BACKEND_ORIGIN = process.env.AI_BACKEND_ORIGIN || "http://127.0.0.1:8788";
const TUTOR_PATH = "/v1/ai/tutor";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function proxyTutor(req, res) {
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const backend = new URL(BACKEND_ORIGIN);
    const headers = { ...req.headers };
    delete headers.host;
    const upstream = http.request({
      hostname: backend.hostname,
      port: backend.port || 80,
      path: TUTOR_PATH,
      method: req.method,
      headers: {
        ...headers,
        host: backend.host
      }
    }, (response) => {
      const forwardHeaders = { ...response.headers };
      delete forwardHeaders.connection;
      delete forwardHeaders["transfer-encoding"];
      res.writeHead(response.statusCode || 502, forwardHeaders);
      response.pipe(res);
    });
    upstream.on("error", () => {
      sendJson(res, 502, {
        ok: false,
        error: {
          code: "DEV_PROXY_ERROR",
          message: "Backend AI tidak dapat dijangkau."
        }
      });
    });
    upstream.end(Buffer.concat(chunks));
  });
}

function serveStatic(req, res, pathname) {
  let requested;
  try {
    requested = decodeURIComponent(pathname);
  } catch (error) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Permintaan tidak valid.");
    return;
  }
  const relative = requested.replace(/^\/+/, "") || "index.html";
  let filePath = path.resolve(ROOT, relative);
  const rootPrefix = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;
  if (filePath !== ROOT && !filePath.startsWith(rootPrefix)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Akses ditolak.");
    return;
  }
  if (relative.endsWith("/")) filePath = path.join(filePath, "index.html");
  fs.stat(filePath, (error, stats) => {
    if (!error && stats.isDirectory()) {
      serveStatic(req, res, path.posix.join(pathname, "index.html"));
      return;
    }
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Halaman tidak ditemukan.");
      return;
    }
    fs.readFile(filePath, (readError, data) => {
      if (readError) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("File tidak dapat dibaca.");
        return;
      }
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-store"
      });
      res.end(data);
    });
  });
}

const server = http.createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  } catch (error) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Permintaan tidak valid.");
    return;
  }
  if (url.pathname === TUTOR_PATH) {
    proxyTutor(req, res);
    return;
  }
  serveStatic(req, res, url.pathname);
});

server.listen(PORT, () => {
  process.stdout.write(`Frontend lokal: http://127.0.0.1:${PORT}/\n`);
  process.stdout.write(`Proxy AI Tutor: ${TUTOR_PATH} -> ${BACKEND_ORIGIN}${TUTOR_PATH}\n`);
});
