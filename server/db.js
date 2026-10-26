import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const dataDir = process.env.DATA_DIR || path.resolve('data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, 'game.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    team TEXT,
    emoji TEXT,
    pin_hash TEXT,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    last_seen INTEGER
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS login_codes (
    email TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS predictions (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    qid TEXT NOT NULL,
    answer TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, qid)
  );
  CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS push_subs (
    endpoint TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS feed (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT,
    url TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY,
    label TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

export function kvGet(key, fallback = null) {
  const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(key);
  return row ? JSON.parse(row.value) : fallback;
}

export function kvSet(key, value) {
  db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    JSON.stringify(value),
  );
}

export const DEFAULT_SETTINGS = {
  // Election day, 27.10.2026 — Israel is on UTC+2 after the 25.10 clock change.
  stage1Lock: '2026-10-27T22:00:00+02:00',
  turnoutLock: '2026-10-27T10:00:00+02:00',
  stage2Open: false,
  stage2Lock: null,
  stage1Final: false,
  stage2Final: false,
};

export function getSettings() {
  return { ...DEFAULT_SETTINGS, ...kvGet('settings', {}) };
}

export function getResults() {
  return kvGet('results', { stage1: null, stage2: {} });
}

export function allPredictions() {
  const rows = db.prepare('SELECT user_id, qid, answer, updated_at FROM predictions').all();
  const byUser = new Map();
  for (const r of rows) {
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, { answers: {}, updated: {} });
    const u = byUser.get(r.user_id);
    u.answers[r.qid] = JSON.parse(r.answer);
    u.updated[r.qid] = r.updated_at;
  }
  return byUser;
}
