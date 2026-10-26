import webpush from 'web-push';
import { q, one, json, kvInit } from './db.js';

let keysPromise;
async function vapid() {
  keysPromise ||= kvInit('vapid', () => webpush.generateVAPIDKeys()).then((keys) => {
    webpush.setVapidDetails(`mailto:${process.env.VAPID_EMAIL || 'admin@example.com'}`, keys.publicKey, keys.privateKey);
    return keys;
  });
  return keysPromise;
}

export async function vapidPublicKey() {
  return (await vapid()).publicKey;
}

export async function saveSubscription(userId, sub) {
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) throw new Error('bad subscription');
  await q(
    `INSERT INTO push_subs (endpoint, user_id, data, created_at) VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, data = EXCLUDED.data`,
    [sub.endpoint, userId, json(sub), Date.now()],
  );
}

export async function removeSubscription(endpoint) {
  await q('DELETE FROM push_subs WHERE endpoint = $1', [endpoint]);
}

export async function subscriptionCount() {
  return one('SELECT COUNT(*)::int AS n, COUNT(DISTINCT user_id)::int AS users FROM push_subs');
}

export async function userHasPush(userId) {
  return !!(await one('SELECT 1 FROM push_subs WHERE user_id = $1 LIMIT 1', [userId]));
}

async function sendOne(row, payload) {
  try {
    await webpush.sendNotification(row.data, JSON.stringify(payload), { TTL: 6 * 3600, urgency: 'high' });
    return true;
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) await removeSubscription(row.endpoint);
    else console.warn('push failed', err.statusCode || err.message);
    return false;
  }
}

// payloadFor(userId) returns {title, body, url} or null to skip that user.
// userIds = null sends to everybody.
export async function pushToUsers(userIds, payloadFor) {
  await vapid();
  if (userIds && !userIds.length) return 0;
  const rows = userIds
    ? await q('SELECT * FROM push_subs WHERE user_id = ANY($1::int[])', [userIds])
    : await q('SELECT * FROM push_subs');
  const results = await Promise.all(
    rows.map((row) => {
      const payload = payloadFor(row.user_id);
      return payload ? sendOne(row, payload) : false;
    }),
  );
  return results.filter(Boolean).length;
}
