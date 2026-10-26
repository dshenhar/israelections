// The whole API as an Express app. Runs as a Vercel function (api/index.js) or locally (server/index.js).
import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitUntil } from '@vercel/functions';
import { q, one, json, kvInit, kvSet, getSettings, getResults, allPredictions, hit } from './db.js';
import { mailMode, sendLoginCode } from './mail.js';
import { vapidPublicKey, saveSubscription, removeSubscription, pushToUsers, subscriptionCount, userHasPush } from './push.js';
import {
  QUESTIONS, QUESTION, PARTIES, crowdStats, scorePlayer, rankPlayers, validateAnswer, isLocked, isOpen,
  isAnswered, knessetParties, badgesFor,
} from '../public/shared/game.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const ALLOWED_DOMAINS = (process.env.ALLOWED_EMAIL_DOMAINS || '').split(',').map((s) => s.trim().toLowerCase().replace(/^@/, '')).filter(Boolean);
const SESSION_DAYS = 180;

let secretPromise;
const getSecret = () => (secretPromise ||= kvInit('secret', () => crypto.randomBytes(32).toString('hex')));

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

// ---------- helpers ----------

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

async function rateLimit(key, max, windowMs) {
  if (!(await hit(key, max, windowMs))) throw new HttpError(429, 'יותר מדי ניסיונות — נסו שוב בעוד כמה דקות');
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(pin, salt, 32).toString('hex')}`;
}

function checkPin(pin, stored) {
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(pin, salt, 32);
  return crypto.timingSafeEqual(test, Buffer.from(hash, 'hex'));
}

function normalizeEmail(raw) {
  const email = String(raw || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) throw new HttpError(400, 'כתובת מייל לא תקינה');
  if (ALLOWED_DOMAINS.length && !ALLOWED_DOMAINS.includes(email.split('@')[1])) {
    throw new HttpError(403, `אפשר להיכנס רק עם מייל של העבודה (${ALLOWED_DOMAINS.map((d) => '@' + d).join(', ')})`);
  }
  return email;
}

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function publicUser(u) {
  return u && { id: u.id, email: u.email, name: u.name, team: u.team, emoji: u.emoji, isAdmin: !!u.is_admin };
}

async function loginUser(req, res, email) {
  let user = await one('SELECT * FROM users WHERE email = $1', [email]);
  if (!user) {
    const first = !(await one('SELECT 1 FROM users LIMIT 1'));
    const admin = ADMIN_EMAILS.includes(email) || (first && !ADMIN_EMAILS.length);
    user = await one(
      `INSERT INTO users (email, is_admin, created_at) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING *`,
      [email, admin, Date.now()],
    );
  } else if (ADMIN_EMAILS.includes(email) && !user.is_admin) {
    await q('UPDATE users SET is_admin = TRUE WHERE id = $1', [user.id]);
    user.is_admin = true;
  }
  const token = crypto.randomBytes(32).toString('base64url');
  await q('INSERT INTO sessions (token, user_id, created_at) VALUES ($1, $2, $3)', [token, user.id, Date.now()]);
  res.cookie('sid', token, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: SESSION_DAYS * 86400_000, path: '/' });
  return user;
}

// Body parsing. On Vercel the runtime has already read the body and exposes it as a
// lazy `req.body`; locally it is still a stream for express.json().
const jsonParser = express.json({ limit: '64kb' });
app.use((req, res, next) => {
  if (!Object.prototype.hasOwnProperty.call(req, 'body')) return jsonParser(req, res, next);
  let body;
  try {
    body = req.body;
    if (Buffer.isBuffer(body)) body = body.toString('utf8');
    if (typeof body === 'string') body = body ? JSON.parse(body) : {};
  } catch {
    return next(new HttpError(400, 'JSON לא תקין'));
  }
  Object.defineProperty(req, 'body', { value: body && typeof body === 'object' ? body : {}, writable: true, configurable: true });
  next();
});

// CSRF guard (state-changing calls must be JSON → cross-site needs a CORS preflight) + session lookup.
app.use(
  '/api',
  wrap(async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD' && !req.is('application/json')) {
      throw new HttpError(415, 'JSON required');
    }
    const sid = parseCookies(req).sid;
    if (sid) {
      const row = await one(
        'SELECT u.*, s.created_at AS s_created FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1',
        [sid],
      );
      if (row && row.s_created > Date.now() - SESSION_DAYS * 86400_000) {
        req.user = row;
        req.sid = sid;
      }
    }
    next();
  }),
);

const requireUser = (req, res, next) => (req.user ? next() : next(new HttpError(401, 'צריך להתחבר')));
const requireAdmin = (req, res, next) => (req.user?.is_admin ? next() : next(new HttpError(403, 'למנהלים בלבד')));

// ---------- game snapshot ----------

const stageCount = (stage) => QUESTIONS.filter((q) => q.stage === stage).length;

async function computeGame() {
  const [settings, results, users, preds] = await Promise.all([
    getSettings(),
    getResults(),
    q('SELECT id, name, team, emoji FROM users WHERE name IS NOT NULL'),
    allPredictions(),
  ]);
  const crowd = crowdStats(users.map((u) => preds.get(u.id)?.answers || {}), results);
  const players = users.map((u) => {
    const p = preds.get(u.id) || { answers: {}, updated: {} };
    const score = scorePlayer(p.answers, results, crowd);
    const answered = { 1: 0, 2: 0 };
    for (const qq of QUESTIONS) if (isAnswered(qq, p.answers[qq.id])) answered[qq.stage]++;
    return {
      id: u.id,
      name: u.name,
      team: u.team || '',
      emoji: u.emoji || '🙂',
      total: score.total,
      s1: score.s1,
      s2: score.s2,
      exactSeats: score.exactSeats,
      correct: score.correct,
      resolved: score.resolved,
      loneWolf: score.loneWolf,
      answered1: answered[1],
      answered2: answered[2],
      score,
      answers: p.answers,
    };
  });
  return { settings, results, crowd, players: rankPlayers(players, 'total') };
}

function leaderboardRow(p) {
  const { score, answers, ...row } = p;
  return row;
}

function winners(players, key) {
  const scored = players.filter((p) => p[key] > 0);
  if (!scored.length) return [];
  return rankPlayers(scored.map((p) => ({ ...p })), key)
    .filter((p) => p.rank === 1)
    .map((p) => p.id);
}

// ---------- auth ----------

app.post(
  '/api/auth/start',
  wrap(async (req, res) => {
    const email = normalizeEmail(req.body.email);
    await rateLimit(`start:${req.ip}`, 30, 15 * 60_000);
    if (!mailMode()) {
      const user = await one('SELECT pin_hash FROM users WHERE email = $1', [email]);
      return res.json({ mode: 'pin', hasPin: !!user?.pin_hash });
    }
    await rateLimit(`code:${email}`, 5, 60 * 60_000);
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    const secret = await getSecret();
    await q(
      `INSERT INTO login_codes (email, code_hash, expires_at, attempts) VALUES ($1, $2, $3, 0)
       ON CONFLICT (email) DO UPDATE SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, attempts = 0`,
      [email, sha(`${secret}:${email}:${code}`), Date.now() + 15 * 60_000],
    );
    try {
      await sendLoginCode(email, code);
    } catch (err) {
      console.error('mail error', err.message);
      throw new HttpError(502, 'לא הצלחנו לשלוח מייל כרגע — נסו שוב עוד רגע');
    }
    res.json({ mode: 'code' });
  }),
);

app.post(
  '/api/auth/verify',
  wrap(async (req, res) => {
    const email = normalizeEmail(req.body.email);
    await rateLimit(`verify:${email}`, 10, 15 * 60_000);
    if (mailMode()) {
      const code = String(req.body.code || '').trim();
      const row = await one('SELECT * FROM login_codes WHERE email = $1', [email]);
      if (!row || row.expires_at < Date.now() || row.attempts >= 5) throw new HttpError(400, 'הקוד פג תוקף — בקשו קוד חדש');
      if (row.code_hash !== sha(`${await getSecret()}:${email}:${code}`)) {
        await q('UPDATE login_codes SET attempts = attempts + 1 WHERE email = $1', [email]);
        throw new HttpError(400, 'קוד שגוי');
      }
      await q('DELETE FROM login_codes WHERE email = $1', [email]);
    } else {
      const pin = String(req.body.pin || '').trim();
      if (!/^\d{4}$/.test(pin)) throw new HttpError(400, 'הקוד האישי הוא 4 ספרות');
      const existing = await one('SELECT * FROM users WHERE email = $1', [email]);
      if (existing?.pin_hash) {
        if (!checkPin(pin, existing.pin_hash)) throw new HttpError(400, 'קוד אישי שגוי. שכחת? מנהל/ת המשחק יכול/ה לאפס אותו');
      } else {
        const user = await loginUser(req, res, email);
        await q('UPDATE users SET pin_hash = $1 WHERE id = $2', [hashPin(pin), user.id]);
        return res.json({ user: publicUser(user) });
      }
    }
    const user = await loginUser(req, res, email);
    res.json({ user: publicUser(user) });
  }),
);

app.post(
  '/api/auth/logout',
  wrap(async (req, res) => {
    if (req.sid) await q('DELETE FROM sessions WHERE token = $1', [req.sid]);
    res.clearCookie('sid', { path: '/' });
    res.json({ ok: true });
  }),
);

app.get(
  '/api/config',
  wrap(async (req, res) => {
    res.json({ mailMode: mailMode() ? 'code' : 'pin', vapidPublicKey: await vapidPublicKey(), domains: ALLOWED_DOMAINS });
  }),
);

// ---------- player ----------

app.patch(
  '/api/me',
  requireUser,
  wrap(async (req, res) => {
    const name = String(req.body.name ?? req.user.name ?? '').trim().slice(0, 40);
    const team = String(req.body.team ?? req.user.team ?? '').trim().slice(0, 40);
    const emoji = String(req.body.emoji ?? req.user.emoji ?? '🙂').slice(0, 8);
    if (name.length < 2) throw new HttpError(400, 'מה השם? (לפחות 2 תווים)');
    await q('UPDATE users SET name = $1, team = $2, emoji = $3 WHERE id = $4', [name, team || null, emoji, req.user.id]);
    res.json({ user: publicUser({ ...req.user, name, team, emoji }) });
  }),
);

app.get(
  '/api/state',
  requireUser,
  wrap(async (req, res) => {
    const now = Date.now();
    const uid = req.user.id;
    const [game, myAnswers, snapshots, feed, hasPush] = await Promise.all([
      computeGame(),
      q('SELECT qid, answer, updated_at FROM predictions WHERE user_id = $1', [uid]),
      q('SELECT label, data, created_at FROM snapshots ORDER BY id'),
      q('SELECT id, title, body, url, created_at FROM feed WHERE user_id IS NULL OR user_id = $1 ORDER BY id DESC LIMIT 20', [uid]),
      userHasPush(uid),
      !req.user.last_seen || now - req.user.last_seen > 60_000
        ? q('UPDATE users SET last_seen = $1 WHERE id = $2', [now, uid])
        : null,
    ]);
    const { settings, results, crowd, players } = game;
    const me = players.find((p) => p.id === uid);
    const visibleCrowd = {};
    for (const qq of QUESTIONS) if (isLocked(qq, settings, now)) visibleCrowd[qq.id] = crowd[qq.id];
    const myHistory = snapshots
      .map((s) => {
        const d = s.data[uid];
        return d && { label: s.label, at: s.created_at, points: d[0], rank: d[1], of: d[2] };
      })
      .filter(Boolean);
    const s1Winners = results.stage1?.final ? winners(players, 's1') : [];
    const s2Winners = settings.stage2Final ? winners(players, 's2') : [];
    const myScore = me?.score || scorePlayer({}, results, crowd);
    const teams = [...new Set(players.map((p) => p.team).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'he'));

    // No background scheduler on serverless: the traffic itself drives the lock reminders.
    waitUntil(maybeRunReminders().catch((e) => console.error('reminders', e)));

    res.json({
      now,
      user: publicUser(req.user),
      settings,
      results,
      knesset: knessetParties(results),
      answers: Object.fromEntries(myAnswers.map((r) => [r.qid, r.answer])),
      answeredAt: Object.fromEntries(myAnswers.map((r) => [r.qid, r.updated_at])),
      myScore,
      badges: badgesFor(myScore, {
        stage1Winner: s1Winners.includes(uid),
        stage2Winner: s2Winners.includes(uid),
        complete1: (me?.answered1 || 0) === stageCount(1),
      }),
      leaderboard: players.map(leaderboardRow),
      winners: { 1: s1Winners, 2: s2Winners },
      crowd: visibleCrowd,
      participants: { total: players.length, complete1: players.filter((p) => p.answered1 === stageCount(1)).length },
      teams,
      history: myHistory,
      feed,
      hasPush,
    });
  }),
);

app.put(
  '/api/predictions/:qid',
  requireUser,
  wrap(async (req, res) => {
    const qq = QUESTION[req.params.qid];
    if (!qq) throw new HttpError(404, 'שאלה לא קיימת');
    if (!req.user.name) throw new HttpError(400, 'השלימו קודם את הפרופיל');
    const [settings, results] = await Promise.all([getSettings(), getResults()]);
    if (qq.stage === 2 && !settings.stage2Open) throw new HttpError(409, 'שלב ב׳ עוד לא נפתח');
    if (!isOpen(qq, settings)) throw new HttpError(409, 'ההימורים על השאלה הזו נעולים');
    let answer;
    try {
      answer = validateAnswer(qq, req.body.answer, results);
    } catch (err) {
      throw new HttpError(400, err.message);
    }
    await q(
      `INSERT INTO predictions (user_id, qid, answer, updated_at) VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT (user_id, qid) DO UPDATE SET answer = EXCLUDED.answer, updated_at = EXCLUDED.updated_at`,
      [req.user.id, qq.id, json(answer), Date.now()],
    );
    res.json({ ok: true, answer });
  }),
);

// Another player's slip — only questions that are already locked.
app.get(
  '/api/players/:id',
  requireUser,
  wrap(async (req, res) => {
    const { settings, players } = await computeGame();
    const p = players.find((x) => x.id === Number(req.params.id));
    if (!p) throw new HttpError(404, 'לא נמצא');
    const answers = {};
    const perQuestion = {};
    for (const qq of QUESTIONS) {
      const visible = p.id === req.user.id || isLocked(qq, settings);
      if (visible && p.answers[qq.id] !== undefined) answers[qq.id] = p.answers[qq.id];
      if (visible) perQuestion[qq.id] = p.score.perQuestion[qq.id];
    }
    res.json({ player: leaderboardRow(p), answers, perQuestion, badges: badgesFor(p.score) });
  }),
);

app.post(
  '/api/push/subscribe',
  requireUser,
  wrap(async (req, res) => {
    try {
      await saveSubscription(req.user.id, req.body.subscription);
    } catch {
      throw new HttpError(400, 'מנוי לא תקין');
    }
    res.json({ ok: true });
  }),
);

app.post(
  '/api/push/unsubscribe',
  requireUser,
  wrap(async (req, res) => {
    if (req.body.endpoint) await removeSubscription(String(req.body.endpoint));
    res.json({ ok: true });
  }),
);

app.post(
  '/api/push/test',
  requireUser,
  wrap(async (req, res) => {
    const sent = await pushToUsers([req.user.id], () => ({
      title: '🔔 ההתראות עובדות!',
      body: 'נעדכן אותך במדגמים, בתוצאות ובתזכורות לפני נעילה',
      url: '/',
    }));
    res.json({ sent });
  }),
);

// ---------- notifications ----------

async function addFeed(userId, title, body, url = '/') {
  await q('INSERT INTO feed (user_id, title, body, url, created_at) VALUES ($1, $2, $3, $4, $5)', [userId, title, body, url, Date.now()]);
}

async function takeSnapshot(label) {
  const { players } = await computeGame();
  const data = Object.fromEntries(players.map((p) => [p.id, [p.total, p.rank, players.length]]));
  await q('INSERT INTO snapshots (label, data, created_at) VALUES ($1, $2::jsonb, $3)', [label, json(data), Date.now()]);
  return players;
}

async function notifyStandings(label, title) {
  const players = await takeSnapshot(label);
  const byId = new Map(players.map((p) => [p.id, p]));
  await addFeed(null, title, `${label} — הטבלה התעדכנה`, '/#/board');
  return pushToUsers(null, (uid) => {
    const p = byId.get(uid);
    if (!p) return null;
    return { title, body: `${label}\nהמקום שלך: ${p.rank} מתוך ${players.length} · ${p.total} נק׳`, url: '/#/board', tag: 'standings' };
  });
}

// ---------- reminders ----------

const REMINDERS = [
  { stage: 1, key: 'stage1Lock', minutes: 180, title: '⏰ עוד 3 שעות ננעלים ההימורים', who: 'incomplete1' },
  { stage: 1, key: 'stage1Lock', minutes: 30, title: '🚨 חצי שעה לנעילה!', who: 'incomplete1' },
  { stage: 1, key: 'turnoutLock', minutes: 90, title: '🗳️ שאלת אחוז ההצבעה ננעלת בקרוב', who: 'noTurnout' },
  { stage: 2, key: 'stage2Lock', minutes: 180, title: '⏰ עוד 3 שעות ננעל שלב ב׳', who: 'incomplete2' },
  { stage: 2, key: 'stage2Lock', minutes: 30, title: '🚨 חצי שעה לנעילת שלב ב׳!', who: 'incomplete2' },
];
const REMINDER_WINDOW = 25 * 60_000;

let lastReminderCheck = 0;
async function maybeRunReminders() {
  const now = Date.now();
  if (now - lastReminderCheck < 30_000) return;
  lastReminderCheck = now;
  const settings = await getSettings();
  if (!settings.stage2Open) settings.stage2Lock = null;
  for (const r of REMINDERS) {
    const lock = settings[r.key];
    if (!lock) continue;
    const at = Date.parse(lock) - r.minutes * 60_000;
    if (now < at || now > at + REMINDER_WINDOW) continue;
    // The insert is the lock: only one server instance gets to send each reminder.
    const id = `${r.key}:${lock}:${r.minutes}`;
    const claimed = await q('INSERT INTO reminders_sent (id, sent_at) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING RETURNING id', [id, now]);
    if (!claimed.length) continue;
    const { players } = await computeGame();
    const n1 = stageCount(1);
    const n2 = stageCount(2);
    const targets = players.filter((p) =>
      r.who === 'incomplete1' ? p.answered1 < n1 : r.who === 'incomplete2' ? p.answered2 < n2 : p.answers.turnout === undefined,
    );
    const byId = new Map(targets.map((p) => [p.id, p]));
    const time = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(lock));
    const sent = await pushToUsers([...byId.keys()], (uid) => {
      const p = byId.get(uid);
      const body =
        r.who === 'noTurnout'
          ? `עוד לא ניחשת את אחוז ההצבעה — השאלה ננעלת ב-${time}`
          : `הטופס שלך עדיין לא מלא (${r.stage === 1 ? p.answered1 : p.answered2}/${r.stage === 1 ? n1 : n2}) — נועלים ב-${time}`;
      return { title: r.title, body, url: `/#/bets/${r.stage}`, tag: 'reminder' };
    });
    console.log(`reminder ${id}: sent ${sent}`);
  }
}

// Optional: an external pinger (e.g. cron-job.org every 5 minutes) can call this to make reminders punctual.
app.get(
  '/api/cron',
  wrap(async (req, res) => {
    lastReminderCheck = 0;
    await maybeRunReminders();
    res.json({ ok: true });
  }),
);

// ---------- admin ----------

app.get(
  '/api/admin/data',
  requireUser,
  requireAdmin,
  wrap(async (req, res) => {
    const [users, settings, results, push] = await Promise.all([
      q(
        `SELECT u.id, u.email, u.name, u.team, u.emoji, u.is_admin, u.created_at, u.last_seen, u.pin_hash IS NOT NULL AS has_pin,
           (SELECT COUNT(*)::int FROM predictions p WHERE p.user_id = u.id) AS answers,
           (SELECT COUNT(*)::int FROM push_subs s WHERE s.user_id = u.id) AS push
         FROM users u ORDER BY u.created_at`,
      ),
      getSettings(),
      getResults(),
      subscriptionCount(),
    ]);
    res.json({ users, settings, results, mail: mailMode(), push });
  }),
);

function parseIso(v, label) {
  if (v === null || v === '') return null;
  const t = Date.parse(v);
  if (Number.isNaN(t)) throw new HttpError(400, `${label}: תאריך לא תקין`);
  return new Date(t).toISOString();
}

app.put(
  '/api/admin/settings',
  requireUser,
  requireAdmin,
  wrap(async (req, res) => {
    const prev = await getSettings();
    const b = req.body;
    const next = { ...prev };
    if ('stage1Lock' in b) next.stage1Lock = parseIso(b.stage1Lock, 'נעילת שלב א׳');
    if ('turnoutLock' in b) next.turnoutLock = parseIso(b.turnoutLock, 'נעילת אחוז הצבעה');
    if ('stage2Lock' in b) next.stage2Lock = parseIso(b.stage2Lock, 'נעילת שלב ב׳');
    if ('stage2Open' in b) next.stage2Open = !!b.stage2Open;
    if ('stage2Final' in b) next.stage2Final = !!b.stage2Final;
    await kvSet('settings', next);
    let sent = 0;
    if (!prev.stage2Open && next.stage2Open && b.notify !== false) {
      const title = '🏛️ שלב ב׳ נפתח: הקמת הממשלה';
      const body = 'מי יקבל מנדט? מי ישב בקואליציה? מתי תושבע הממשלה? כנסו להמר';
      await addFeed(null, title, body, '/#/bets/2');
      sent = await pushToUsers(null, () => ({ title, body, url: '/#/bets/2' }));
    }
    if (!prev.stage2Final && next.stage2Final) {
      sent += await notifyStandings('תוצאות סופיות — שלב ב׳', '🏆 שלב ב׳ הוכרע!');
    }
    res.json({ settings: next, sent });
  }),
);

function intOrNull(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 120) throw new HttpError(400, 'מספר מנדטים לא תקין');
  return n;
}

app.put(
  '/api/admin/results/stage1',
  requireUser,
  requireAdmin,
  wrap(async (req, res) => {
    const b = req.body;
    const results = await getResults();
    if (b.clear) {
      results.stage1 = null;
      await kvSet('results', results);
      return res.json({ results });
    }
    const seats = {};
    for (const p of PARTIES) {
      const n = intOrNull(b.seats?.[p.id]);
      if (n !== null) {
        if (n > 0 && n < 4) throw new HttpError(400, `${p.name}: 1–3 מנדטים לא אפשרי (אחוז חסימה)`);
        seats[p.id] = n;
      }
    }
    const other = intOrNull(b.other) || 0;
    const sum = Object.values(seats).reduce((s, n) => s + n, 0) + other;
    if (sum > 120) throw new HttpError(400, `סך המנדטים ${sum} — יותר מ-120`);
    let turnout = null;
    if (b.turnout !== '' && b.turnout !== null && b.turnout !== undefined) {
      turnout = Number(b.turnout);
      if (!(turnout > 0 && turnout < 100)) throw new HttpError(400, 'אחוז הצבעה לא תקין');
    }
    const label = String(b.label || '').trim().slice(0, 60) || 'עדכון תוצאות';
    results.stage1 = { seats, other, turnout, label, final: !!b.final, updatedAt: Date.now() };
    await kvSet('results', results);
    let sent = 0;
    if (b.notify) {
      sent = await notifyStandings(label, b.final ? '🏆 שלב א׳ הוכרע — התוצאות הסופיות!' : `📡 ${label}`);
    } else if (Object.keys(seats).length === PARTIES.length) {
      await takeSnapshot(label);
    }
    res.json({ results, sent, sum });
  }),
);

app.put(
  '/api/admin/results/stage2',
  requireUser,
  requireAdmin,
  wrap(async (req, res) => {
    const b = req.body;
    const results = await getResults();
    const stage2 = {};
    for (const qq of QUESTIONS.filter((x) => x.stage === 2)) {
      const v = b[qq.id];
      if (v === undefined || v === null || v === '') continue;
      if (qq.type === 'coalition') {
        const out = {};
        for (const pid of knessetParties(results)) if (v[pid] === 'coalition' || v[pid] === 'opposition') out[pid] = v[pid];
        if (Object.keys(out).length) stage2[qq.id] = out;
      } else {
        if (!qq.options.some((o) => o.id === v)) throw new HttpError(400, `ערך לא חוקי ל${qq.title}`);
        stage2[qq.id] = v;
      }
    }
    results.stage2 = stage2;
    await kvSet('results', results);
    let sent = 0;
    if (b.notify) {
      const label = String(b.label || '').trim().slice(0, 60) || 'עדכון בהקמת הממשלה';
      sent = await notifyStandings(label, `🏛️ ${label}`);
    }
    res.json({ results, sent });
  }),
);

app.post(
  '/api/admin/broadcast',
  requireUser,
  requireAdmin,
  wrap(async (req, res) => {
    const title = String(req.body.title || '').trim().slice(0, 80);
    const body = String(req.body.body || '').trim().slice(0, 300);
    if (!title) throw new HttpError(400, 'צריך כותרת');
    await addFeed(null, title, body);
    const sent = await pushToUsers(null, () => ({ title, body, url: '/' }));
    res.json({ sent });
  }),
);

app.patch(
  '/api/admin/users/:id',
  requireUser,
  requireAdmin,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const u = await one('SELECT * FROM users WHERE id = $1', [id]);
    if (!u) throw new HttpError(404, 'לא נמצא');
    if ('isAdmin' in req.body) {
      if (id === req.user.id && !req.body.isAdmin) throw new HttpError(400, 'אי אפשר להסיר הרשאת ניהול מעצמך');
      await q('UPDATE users SET is_admin = $1 WHERE id = $2', [!!req.body.isAdmin, id]);
    }
    if ('team' in req.body) await q('UPDATE users SET team = $1 WHERE id = $2', [String(req.body.team || '').trim().slice(0, 40) || null, id]);
    if ('name' in req.body && String(req.body.name).trim().length >= 2) {
      await q('UPDATE users SET name = $1 WHERE id = $2', [String(req.body.name).trim().slice(0, 40), id]);
    }
    if (req.body.resetPin) {
      await q('UPDATE users SET pin_hash = NULL WHERE id = $1', [id]);
      await q('DELETE FROM sessions WHERE user_id = $1', [id]);
    }
    res.json({ ok: true });
  }),
);

app.delete(
  '/api/admin/users/:id',
  requireUser,
  requireAdmin,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (id === req.user.id) throw new HttpError(400, 'אי אפשר למחוק את עצמך');
    await q('DELETE FROM users WHERE id = $1', [id]);
    res.json({ ok: true });
  }),
);

// ---------- static (local / Docker only — on Vercel the CDN serves public/) ----------

app.use(express.static(path.join(root, 'public'), { index: 'index.html', setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));
app.get('/healthz', (req, res) => res.json({ ok: true }));
app.use('/api', (req, res) => res.status(404).json({ error: 'not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 && !err.expose ? 'שגיאת שרת' : err.message });
});

export default app;
