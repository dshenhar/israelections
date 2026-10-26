// Postgres access. In production (Vercel) DATABASE_URL points at Neon / any Postgres;
// locally, with no DATABASE_URL, an embedded PGlite database is kept in ./data.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;

let runQuery;
if (url) {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 10_000,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
  });
  runQuery = async (text, params) => (await pool.query(text, params)).rows;
} else if (process.env.VERCEL) {
  // Vercel has no writable disk, so a real database is required.
  runQuery = async () => {
    const err = new Error('חסר חיבור למסד נתונים: ב-Vercel צריך לחבר Neon בלשונית Storage ולפרוס מחדש');
    err.status = 503;
    err.expose = true;
    throw err;
  };
} else {
  const { PGlite } = await import('@electric-sql/pglite');
  const dir = path.join(process.env.DATA_DIR || path.resolve('data'), 'pg');
  fs.mkdirSync(dir, { recursive: true });
  const local = new PGlite(dir);
  runQuery = async (text, params) => (await local.query(text, params)).rows;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    team TEXT,
    emoji TEXT,
    pin_hash TEXT,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DOUBLE PRECISION NOT NULL,
    last_seen DOUBLE PRECISION
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at DOUBLE PRECISION NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS login_codes (
    email TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL,
    expires_at DOUBLE PRECISION NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS predictions (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    qid TEXT NOT NULL,
    answer JSONB NOT NULL,
    updated_at DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (user_id, qid)
  )`,
  `CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value JSONB NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS push_subs (
    endpoint TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    data JSONB NOT NULL,
    created_at DOUBLE PRECISION NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS feed (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT,
    url TEXT,
    created_at DOUBLE PRECISION NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS snapshots (
    id SERIAL PRIMARY KEY,
    label TEXT NOT NULL,
    data JSONB NOT NULL,
    created_at DOUBLE PRECISION NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at DOUBLE PRECISION NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS reminders_sent (id TEXT PRIMARY KEY, sent_at DOUBLE PRECISION NOT NULL)`,
  // Leagues: each workplace competes in its own league; bets are per user and count in every league they join.
  `CREATE TABLE IF NOT EXISTS leagues (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at DOUBLE PRECISION NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS league_members (
    league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    team TEXT,
    joined_at DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (league_id, user_id)
  )`,
  `CREATE INDEX IF NOT EXISTS league_members_user ON league_members (user_id)`,
  `ALTER TABLE feed ADD COLUMN IF NOT EXISTS league_id TEXT REFERENCES leagues(id) ON DELETE CASCADE`,
  `ALTER TABLE snapshots ADD COLUMN IF NOT EXISTS league_id TEXT REFERENCES leagues(id) ON DELETE CASCADE`,
  // Old codes of leagues whose code was changed, so links already sent keep working.
  `CREATE TABLE IF NOT EXISTS league_aliases (
    alias TEXT PRIMARY KEY,
    league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE
  )`,
];

const ID_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export function newLeagueId() {
  return Array.from(crypto.randomBytes(6), (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join('');
}

// Games that started before leagues existed: everyone moves into one league with its own code.
// Runs once per database (the kv row is the claim, so concurrent cold starts don't repeat it).
async function migrateToLeagues() {
  const claimed = await runQuery(
    `INSERT INTO kv (key, value) VALUES ('leagues_migrated', $1::jsonb) ON CONFLICT (key) DO NOTHING RETURNING key`,
    [json(Date.now())],
  );
  if (!claimed.length) return;
  const [{ users }] = await runQuery('SELECT COUNT(*)::int AS users FROM users');
  const [{ leagues }] = await runQuery('SELECT COUNT(*)::int AS leagues FROM leagues');
  if (!users || leagues) return;
  const id = newLeagueId();
  const now = Date.now();
  await runQuery('INSERT INTO leagues (id, name, created_by, created_at) VALUES ($1, $2, (SELECT MIN(id) FROM users), $3)', [id, 'הליגה של המשרד', now]);
  await runQuery(
    `INSERT INTO league_members (league_id, user_id, role, team, joined_at)
     SELECT $1, id, CASE WHEN is_admin THEN 'admin' ELSE 'member' END, team, created_at FROM users
     ON CONFLICT DO NOTHING`,
    [id],
  );
  await runQuery('UPDATE snapshots SET league_id = $1 WHERE league_id IS NULL', [id]);
}

async function migrate() {
  for (let attempt = 0; ; attempt++) {
    try {
      for (const stmt of SCHEMA) await runQuery(stmt);
      await migrateToLeagues();
      return;
    } catch (err) {
      // Two cold starts creating the same table at once can collide — the second try sees it.
      if (attempt >= 2) throw err;
      await new Promise((r) => setTimeout(r, 300));
    }
  }
}

let ready;
export function dbReady() {
  ready ||= migrate().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

export async function q(text, params = []) {
  await dbReady();
  return runQuery(text, params);
}

export async function one(text, params) {
  return (await q(text, params))[0];
}

export const json = (v) => JSON.stringify(v);

export async function kvGet(key, fallback = null) {
  const row = await one('SELECT value FROM kv WHERE key = $1', [key]);
  return row ? row.value : fallback;
}

export async function kvSet(key, value) {
  await q('INSERT INTO kv (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, json(value)]);
}

// Sets the value only if the key is missing; returns whatever is stored afterwards.
export async function kvInit(key, make) {
  const existing = await kvGet(key);
  if (existing) return existing;
  await q('INSERT INTO kv (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO NOTHING', [key, json(make())]);
  return kvGet(key);
}

export const DEFAULT_SETTINGS = {
  // Election day, 27.10.2026 — Israel is on UTC+2 after the 25.10 clock change.
  stage1Lock: '2026-10-27T22:00:00+02:00',
  turnoutLock: '2026-10-27T10:00:00+02:00',
  stage2Open: false,
  stage2Lock: null,
  stage2Final: false,
};

export async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...(await kvGet('settings', {})) };
}

export async function getResults() {
  return kvGet('results', { stage1: null, stage2: {} });
}

// Predictions grouped by player; pass ids to load only those players.
export async function allPredictions(ids) {
  if (ids && !ids.length) return new Map();
  const rows = ids
    ? await q('SELECT user_id, qid, answer, updated_at FROM predictions WHERE user_id = ANY($1::int[])', [ids])
    : await q('SELECT user_id, qid, answer, updated_at FROM predictions');
  const byUser = new Map();
  for (const r of rows) {
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, { answers: {}, updated: {} });
    const u = byUser.get(r.user_id);
    u.answers[r.qid] = r.answer;
    u.updated[r.qid] = r.updated_at;
  }
  return byUser;
}

// Fixed-window counter shared by every server instance. Returns false once over the limit.
export async function hit(key, max, windowMs) {
  const now = Date.now();
  const row = await one(
    `INSERT INTO rate_limits (key, count, reset_at) VALUES ($1, 1, $2)
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN rate_limits.reset_at < $3 THEN 1 ELSE rate_limits.count + 1 END,
       reset_at = CASE WHEN rate_limits.reset_at < $3 THEN $2 ELSE rate_limits.reset_at END
     RETURNING count`,
    [key, now + windowMs, now],
  );
  return row.count <= max;
}
