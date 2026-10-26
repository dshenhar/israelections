import webpush from 'web-push';
import { db, kvGet, kvSet } from './db.js';

let keys = kvGet('vapid');
if (!keys) {
  keys = webpush.generateVAPIDKeys();
  kvSet('vapid', keys);
}
webpush.setVapidDetails(`mailto:${process.env.VAPID_EMAIL || 'admin@example.com'}`, keys.publicKey, keys.privateKey);

export const vapidPublicKey = keys.publicKey;

export function saveSubscription(userId, sub) {
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) throw new Error('bad subscription');
  db.prepare(
    `INSERT INTO push_subs (endpoint, user_id, data, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, data = excluded.data`,
  ).run(sub.endpoint, userId, JSON.stringify(sub), Date.now());
}

export function removeSubscription(endpoint) {
  db.prepare('DELETE FROM push_subs WHERE endpoint = ?').run(endpoint);
}

export function subscriptionCount() {
  return db.prepare('SELECT COUNT(*) AS n, COUNT(DISTINCT user_id) AS users FROM push_subs').get();
}

export function userHasPush(userId) {
  return !!db.prepare('SELECT 1 FROM push_subs WHERE user_id = ? LIMIT 1').get(userId);
}

async function sendOne(row, payload) {
  try {
    await webpush.sendNotification(JSON.parse(row.data), JSON.stringify(payload), { TTL: 6 * 3600, urgency: 'high' });
    return true;
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) removeSubscription(row.endpoint);
    else console.warn('push failed', err.statusCode || err.message);
    return false;
  }
}

// payloadFor(userId) returns {title, body, url} or null to skip that user.
export async function pushToUsers(userIds, payloadFor) {
  const rows = userIds
    ? db.prepare(`SELECT * FROM push_subs WHERE user_id IN (${userIds.map(() => '?').join(',') || 'NULL'})`).all(...userIds)
    : db.prepare('SELECT * FROM push_subs').all();
  let sent = 0;
  const cache = new Map();
  await Promise.all(
    rows.map(async (row) => {
      if (!cache.has(row.user_id)) cache.set(row.user_id, payloadFor(row.user_id));
      const payload = cache.get(row.user_id);
      if (payload && (await sendOne(row, payload))) sent++;
    }),
  );
  return sent;
}
