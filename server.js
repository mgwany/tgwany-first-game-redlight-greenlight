#!/usr/bin/env node
"use strict";

/**
 * Tiny static + API server for Red Light, Green Light.
 * Serves the game files and persists high scores to highscore.txt on disk.
 *
 *   node server.js
 *   # then open http://127.0.0.1:8000
 *
 * highscore.txt format (CSV, one entry per line):
 *   name,level
 * Ranked by level descending. Equal levels: earlier entry keeps the higher rank
 * (new ties insert after existing same-level scores).
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const ROOT = __dirname;
const SCORE_FILE = path.join(ROOT, "highscore.txt");
const PORT = Number(process.env.PORT) || 8000;
const HOST = process.env.HOST || "127.0.0.1";
const MAX_SCORES = 10;
const MAX_NAME_LEN = 20;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function ensureScoreFile() {
  if (!fs.existsSync(SCORE_FILE)) {
    fs.writeFileSync(SCORE_FILE, "", "utf8");
  }
}

function parseScores(raw) {
  const scores = [];
  for (const line of String(raw).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const comma = trimmed.lastIndexOf(",");
    if (comma <= 0) continue;
    const name = trimmed.slice(0, comma).trim();
    const level = Number.parseInt(trimmed.slice(comma + 1).trim(), 10);
    if (!name || !Number.isFinite(level) || level < 1) continue;
    scores.push({ name, level });
  }
  return rankScores(scores);
}

function rankScores(scores) {
  // Stable sort: higher level first; equal levels keep insertion order (earlier wins).
  return scores
    .map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => b.level - a.level || a.index - b.index)
    .slice(0, MAX_SCORES)
    .map(({ name, level }) => ({ name, level }));
}

function readScores() {
  ensureScoreFile();
  return parseScores(fs.readFileSync(SCORE_FILE, "utf8"));
}

function writeScores(scores) {
  const body = rankScores(scores)
    .map((s) => `${s.name},${s.level}`)
    .join("\n");
  const out = body ? `${body}\n` : "";
  fs.writeFileSync(SCORE_FILE, out, "utf8");
  return rankScores(scores);
}

function qualifies(level, scores) {
  if (!Number.isFinite(level) || level < 1) return false;
  if (scores.length < MAX_SCORES) return true;
  const lowest = scores[scores.length - 1].level;
  return level > lowest;
}

function sanitizeName(raw) {
  return String(raw || "")
    .replace(/,/g, " ")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME_LEN);
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(res, status, text, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(text),
  });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 4096) {
        reject(new Error("Body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function safeJoin(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const cleaned = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(ROOT, cleaned === path.sep ? "index.html" : cleaned);
  if (!filePath.startsWith(ROOT)) return null;
  return filePath;
}

async function handleApi(req, res, pathname) {
  if (pathname === "/api/highscores" && req.method === "GET") {
    sendJson(res, 200, { scores: readScores(), max: MAX_SCORES });
    return;
  }

  if (pathname === "/api/highscores/qualifies" && req.method === "GET") {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    const level = Number.parseInt(url.searchParams.get("level") || "", 10);
    const scores = readScores();
    sendJson(res, 200, {
      qualifies: qualifies(level, scores),
      scores,
      max: MAX_SCORES,
    });
    return;
  }

  if (pathname === "/api/highscores" && req.method === "POST") {
    let payload;
    try {
      payload = JSON.parse(await readBody(req));
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const name = sanitizeName(payload && payload.name);
    const level = Number.parseInt(payload && payload.level, 10);
    if (!name) {
      sendJson(res, 400, { error: "Name is required" });
      return;
    }
    if (!Number.isFinite(level) || level < 1) {
      sendJson(res, 400, { error: "Level must be a positive integer" });
      return;
    }

    const scores = readScores();
    if (!qualifies(level, scores)) {
      sendJson(res, 200, {
        accepted: false,
        reason: "Score does not qualify for the top 10",
        scores,
      });
      return;
    }

    const next = writeScores([...scores, { name, level }]);
    sendJson(res, 200, { accepted: true, scores: next, entry: { name, level } });
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

function serveStatic(req, res, pathname) {
  let filePath = safeJoin(pathname === "/" ? "/index.html" : pathname);
  if (!filePath) {
    sendText(res, 403, "Forbidden");
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      sendText(res, 404, "Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control":
        pathname === "/highscore.txt" ? "no-store" : "no-cache",
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

ensureScoreFile();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
  const pathname = url.pathname;

  try {
    if (pathname.startsWith("/api/")) {
      await handleApi(req, res, pathname);
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      sendText(res, 405, "Method not allowed");
      return;
    }

    serveStatic(req, res, pathname);
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: "Server error" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Red Light Green Light server at http://${HOST}:${PORT}`);
  console.log(`High scores file: ${SCORE_FILE}`);
});
