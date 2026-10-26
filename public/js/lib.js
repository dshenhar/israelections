// Small shared helpers: API calls, time formatting (Israel time), push setup.

export async function api(path, { method = 'GET', body } = {}) {
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (method !== 'GET') {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body ?? {});
  }
  const res = await fetch(`/api${path}`, opts);
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    const err = new Error(data?.error || 'משהו השתבש, נסו שוב');
    err.status = res.status;
    throw err;
  }
  return data;
}

// ---------- time ----------

export const TZ = 'Asia/Jerusalem';

const fmtDay = new Intl.DateTimeFormat('he-IL', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'numeric' });
const fmtTime = new Intl.DateTimeFormat('he-IL', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const fmtShort = new Intl.DateTimeFormat('he-IL', { timeZone: TZ, day: 'numeric', month: 'numeric' });

export const formatTime = (t) => fmtTime.format(new Date(t));
export const formatDay = (t) => fmtDay.format(new Date(t));
export const formatShort = (t) => fmtShort.format(new Date(t));

export function formatWhen(t) {
  const d = new Date(t);
  const today = fmtShort.format(new Date());
  const day = fmtShort.format(d);
  return day === today ? `היום ב-${fmtTime.format(d)}` : `${fmtDay.format(d)} ב-${fmtTime.format(d)}`;
}

export function timeAgo(t, now = Date.now()) {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'עכשיו';
  const m = Math.round(s / 60);
  if (m < 60) return m === 1 ? 'לפני דקה' : `לפני ${m} דק׳`;
  const h = Math.round(m / 60);
  if (h < 24) return h === 1 ? 'לפני שעה' : `לפני ${h} שעות`;
  return formatWhen(t);
}

export function splitDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

function tzOffset(t) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
      .formatToParts(new Date(t))
      .map((p) => [p.type, p.value]),
  );
  const wall = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  return wall - Math.floor(t / 1000) * 1000;
}

// ISO → "YYYY-MM-DDTHH:mm" in Israel time, for <input type="datetime-local">
export function toLocalInput(iso) {
  if (!iso) return '';
  const t = Date.parse(iso);
  return new Date(t + tzOffset(t)).toISOString().slice(0, 16);
}

// "YYYY-MM-DDTHH:mm" in Israel time → ISO
export function fromLocalInput(v) {
  if (!v) return null;
  const wall = Date.parse(`${v}:00Z`);
  let t = wall - tzOffset(wall);
  t = wall - tzOffset(t);
  return new Date(t).toISOString();
}

// ---------- device / push ----------

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export function registerSW() {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);
  return navigator.serviceWorker.register('/sw.js').catch(() => null);
}

function keyToBytes(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function deviceSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function enablePush(vapidKey) {
  if (!pushSupported()) throw new Error('המכשיר הזה לא תומך בהתראות');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('ההתראות נחסמו. אפשר לאשר אותן בהגדרות הדפדפן');
  await registerSW();
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(vapidKey) });
  await api('/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
  return sub;
}

export async function disablePush() {
  const sub = await deviceSubscription();
  if (!sub) return;
  await api('/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => {});
  await sub.unsubscribe();
}

// Keep the server in sync with a subscription this device already has.
export async function resyncPush() {
  if (!pushSupported() || Notification.permission !== 'granted') return null;
  const sub = await deviceSubscription();
  if (sub) await api('/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } }).catch(() => {});
  return sub;
}

// Android / desktop "install app" prompt
let installEvent = null;
const installListeners = new Set();
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvent = e;
  installListeners.forEach((f) => f());
});
export const canInstall = () => !!installEvent;
export function onInstallChange(f) {
  installListeners.add(f);
  return () => installListeners.delete(f);
}
export async function promptInstall() {
  if (!installEvent) return;
  installEvent.prompt();
  await installEvent.userChoice.catch(() => null);
  installEvent = null;
  installListeners.forEach((f) => f());
}

export async function share(text) {
  const url = location.origin;
  if (navigator.share) {
    try {
      await navigator.share({ title: '61 · ליגת הבחירות', text, url });
      return 'shared';
    } catch {
      return null;
    }
  }
  await navigator.clipboard?.writeText(`${text} ${url}`);
  return 'copied';
}
