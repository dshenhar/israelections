import { html } from 'htm/preact';
import { useEffect, useState } from 'preact/hooks';
import { api, getPendingJoin } from '../lib.js';
import { useApp, EmojiPicker, EMOJIS } from '../ui.js';

export function Login({ config, onDone }) {
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [secret, setSecret] = useState('');
  const [info, setInfo] = useState(null);
  const [invite, setInvite] = useState(null);

  useEffect(() => {
    const code = getPendingJoin();
    if (code) api(`/leagues/${encodeURIComponent(code)}/public`).then((r) => setInvite(r.league)).catch(() => {});
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function start(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await api('/auth/start', { method: 'POST', body: { email } });
      setInfo(r);
      setSecret('');
      setStep('secret');
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  async function verify(e) {
    e?.preventDefault();
    setError('');
    setBusy(true);
    try {
      const body = info.mode === 'code' ? { email, code: secret } : { email, pin: secret };
      await api('/auth/verify', { method: 'POST', body });
      await onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const len = info?.mode === 'code' ? 6 : 4;
  const newPin = info?.mode === 'pin' && !info.hasPin;

  return html`<div class="login">
    <div class="login-logo">
      <div class="mark">61</div>
      <h1>ליגת ניחושי הבחירות</h1>
      <p>מהמרים על תוצאות הבחירות לכנסת ה-26 ועל הקמת הממשלה — ומי שהכי צודק לוקח את המשרד</p>
    </div>
    ${invite &&
    html`<div class="notice good">
      <span class="i">🎟️</span>
      <div class="grow">הוזמנת לליגת <b>״${invite.name}״</b> (${invite.members} משתתפים). נכנסים עם המייל — וההצטרפות אוטומטית.</div>
    </div>`}

    ${step === 'email'
      ? html`<form class="card stack" onSubmit=${start}>
          <div class="field">
            <label for="email">המייל שלך</label>
            <input
              id="email"
              class="input"
              type="email"
              inputmode="email"
              autocomplete="email"
              placeholder=${config.domains?.length ? `name@${config.domains[0]}` : 'name@company.co.il'}
              value=${email}
              onInput=${(e) => setEmail(e.target.value)}
              required
              autofocus
            />
          </div>
          ${error && html`<div class="error">${error}</div>`}
          <button class="btn block" disabled=${busy || !email}>${busy ? 'רגע…' : 'המשך'}</button>
        </form>`
      : html`<form class="card stack" onSubmit=${verify}>
          <div class="field">
            <label for="secret">
              ${info.mode === 'code'
                ? html`שלחנו קוד בן 6 ספרות ל-<b class="ltr">${email}</b>`
                : newPin
                  ? 'בחרו קוד אישי בן 4 ספרות — תצטרכו אותו כדי להיכנס מטלפון או ממחשב אחר'
                  : 'הקוד האישי שלך (4 ספרות)'}
            </label>
            <input
              id="secret"
              class="input code"
              type=${info.mode === 'pin' ? 'password' : 'text'}
              inputmode="numeric"
              autocomplete=${info.mode === 'code' ? 'one-time-code' : newPin ? 'new-password' : 'current-password'}
              maxlength=${len}
              pattern=${`\\d{${len}}`}
              value=${secret}
              onInput=${(e) => {
                const v = e.target.value.replace(/\D/g, '').slice(0, len);
                setSecret(v);
              }}
              required
              autofocus
            />
          </div>
          ${info.mode === 'code' && html`<p class="small muted">לא הגיע? כדאי להציץ גם בתיקיית הספאם.</p>`}
          ${error && html`<div class="error">${error}</div>`}
          <button class="btn block" disabled=${busy || secret.length !== len}>${busy ? 'רגע…' : newPin ? 'שמירה וכניסה' : 'כניסה'}</button>
          <button type="button" class="btn quiet" onClick=${() => { setStep('email'); setError(''); }}>← מייל אחר</button>
        </form>`}
  </div>`;
}

export function Onboarding() {
  const { state, refresh } = useApp();
  const [name, setName] = useState('');
  const [team, setTeam] = useState('');
  const [emoji, setEmoji] = useState(EMOJIS[Math.floor(Math.random() * EMOJIS.length)]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/me', { method: 'PATCH', body: { name, team, emoji } });
      location.hash = '#/';
      await refresh();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return html`<div class="login">
    <div class="login-logo">
      <div class="mark" style=${{ fontSize: '64px' }}>${emoji}</div>
      <h1>נעים להכיר!</h1>
      <p>ככה יראו אותך בטבלה של המשרד</p>
    </div>
    <form class="card stack" onSubmit=${save}>
      <div class="field">
        <label for="name">שם</label>
        <input id="name" class="input" autocomplete="name" placeholder="למשל: דנה כ." value=${name} onInput=${(e) => setName(e.target.value)} required autofocus maxlength="40" />
      </div>
      <div class="field">
        <label for="team">צוות / מחלקה <span class="muted">(לליגת הצוותים)</span></label>
        <input id="team" class="input" list="teams" placeholder="למשל: פיתוח" value=${team} onInput=${(e) => setTeam(e.target.value)} maxlength="40" />
        <datalist id="teams">${state.teams.map((t) => html`<option value=${t} />`)}</datalist>
      </div>
      <div class="field">
        <span class="label">אווטאר</span>
        <${EmojiPicker} value=${emoji} onChange=${setEmoji} />
      </div>
      ${error && html`<div class="error">${error}</div>`}
      <button class="btn block" disabled=${busy || name.trim().length < 2}>${busy ? 'רגע…' : 'יאללה, להמר! 🗳️'}</button>
    </form>
  </div>`;
}
