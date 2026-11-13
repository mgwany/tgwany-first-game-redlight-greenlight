/**
 * High-score API for Red Light, Green Light.
 *
 * Endpoints:
 *   GET  /.netlify/functions/highscores
 *   POST /.netlify/functions/highscores  body: { "name": "Ada", "level": 7 }
 *   (also available as /api/highscores via netlify.toml redirect)
 *
 * Persistence: Netlify Blobs store `rlgl-scores`, blob key `highscore.txt`.
 * Value is the same comma-delimited CSV as the repo's highscore.txt example:
 *   name,level
 * Ranking: level descending; equal levels keep earlier entries higher.
 *
 * Local filesystem is not durable across Function invocations on Netlify,
 * so Blobs is required in production. During `netlify dev`, if Blobs is
 * unavailable, the Function falls back to the repo's highscore.txt file.
 */

import { getStore } from "@netlify/blobs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const STORE_NAME = "rlgl-scores";
const BLOB_KEY = "highscore.txt";
const MAX_SCORES = 10;
const MAX_NAME_LEN = 20;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LOCAL_FILE = path.join(ROOT, "highscore.txt");

function isLocalDev() {
  return process.env.NETLIFY_DEV === "true" || process.env.CONTEXT === "dev";
}

function parseScores(raw) {
  const scores = [];
  for (const line of String(raw || "").split(/\r?\n/)) {
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
  return scores
    .map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => b.level - a.level || a.index - b.index)
    .slice(0, MAX_SCORES)
    .map(({ name, level }) => ({ name, level }));
}

function toCsv(scores) {
  const body = rankScores(scores)
    .map((s) => `${s.name},${s.level}`)
    .join("\n");
  return body ? `${body}\n` : "";
}

function qualifies(level, scores) {
  if (!Number.isFinite(level) || level < 1) return false;
  if (scores.length < MAX_SCORES) return true;
  return level > scores[scores.length - 1].level;
}

function sanitizeName(raw) {
  return String(raw || "")
    .replace(/,/g, " ")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME_LEN);
}

function json(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function getScoreStore() {
  return getStore({ name: STORE_NAME, consistency: "strong" });
}

async function readLocalFile() {
  try {
    return await fs.readFile(LOCAL_FILE, "utf8");
  } catch {
    return "";
  }
}

async function writeLocalFile(csv) {
  await fs.writeFile(LOCAL_FILE, csv, "utf8");
}

async function readScores() {
  try {
    const store = getScoreStore();
    const raw = await store.get(BLOB_KEY);
    return { scores: parseScores(raw || ""), storage: "netlify-blobs" };
  } catch (err) {
    if (!isLocalDev()) throw err;
    console.warn("Blobs read failed; using local highscore.txt", err.message || err);
    return { scores: parseScores(await readLocalFile()), storage: "local-file" };
  }
}

async function writeScores(scores) {
  const ranked = rankScores(scores);
  const csv = toCsv(ranked);

  try {
    const store = getScoreStore();
    await store.set(BLOB_KEY, csv);
    return { scores: ranked, storage: "netlify-blobs" };
  } catch (err) {
    if (!isLocalDev()) throw err;
    console.warn("Blobs write failed; using local highscore.txt", err.message || err);
    await writeLocalFile(csv);
    return { scores: ranked, storage: "local-file" };
  }
}

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Cache-Control": "no-store",
      },
    });
  }

  try {
    if (req.method === "GET") {
      const { scores, storage } = await readScores();
      return json(200, {
        scores,
        max: MAX_SCORES,
        storage,
        blobKey: BLOB_KEY,
      });
    }

    if (req.method === "POST") {
      let payload;
      try {
        payload = await req.json();
      } catch {
        return json(400, { error: "Invalid JSON body" });
      }

      const name = sanitizeName(payload && payload.name);
      const level = Number.parseInt(payload && payload.level, 10);
      if (!name) return json(400, { error: "Name is required" });
      if (!Number.isFinite(level) || level < 1) {
        return json(400, { error: "Level must be a positive integer" });
      }

      const { scores } = await readScores();
      if (!qualifies(level, scores)) {
        return json(200, {
          accepted: false,
          reason: "Score does not qualify for the top 10",
          scores,
        });
      }

      const saved = await writeScores([...scores, { name, level }]);
      return json(200, {
        accepted: true,
        scores: saved.scores,
        entry: { name, level },
        storage: saved.storage,
        blobKey: BLOB_KEY,
      });
    }

    return json(405, { error: "Method not allowed" });
  } catch (err) {
    console.error(err);
    return json(500, {
      error:
        err && err.message
          ? err.message
          : "Server error reading/writing high scores",
    });
  }
};
