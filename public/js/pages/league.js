import { html } from 'htm/preact';
import { useEffect, useState } from 'preact/hooks';
import { api, share, inviteLink, setLeagueId } from '../lib.js';
import { useApp, Notice, Spinner } from '../ui.js';

async function shareInvite(league, toast) {
  const r = await share(`בואו להמר איתי על תוצאות הבחירות בליגת ״${league.name}״ 🗳️`, inviteLink(league.id));
  if (r === 'copied') toast('הקישור הועתק ✓');
}

function JoinForm({ onJoined }) {
  const { toast } = useApp();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  async function join(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const clean = code.trim().toLowerCase().replace(/^.*[?&]l=/, '');
      const r = await api(`/leagues/${encodeURIComponent(clean)}/join`, { method: 'POST' });
      toast(`הצטרפת לליגת ״${r.league.name}״ 🎉`);
      await onJoined(r.league);
    } catch (err) {
      toast(err.message, true);
    }
    setBusy(false);
  }
  return html`<form class="stack" onSubmit=${join}>
    <input class="input ltr" placeholder="קוד הליגה או קישור ההזמנה" value=${code} onInput=${(e) => setCode(e.target.value)} autocapitalize="off" autocomplete="off" />
    <button class="btn ghost" disabled=${busy || code.trim().length < 4}>${busy ? '…' : 'הצטרפות'}</button>
  </form>`;
}

function CreateForm({ onCreated }) {
  const { toast } = useApp();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  async function create(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api('/leagues', { method: 'POST', body: { name } });
      toast('הליגה נפתחה 🎉 עכשיו שולחים את הקישור');
      await onCreated(r.league);
    } catch (err) {
      toast(err.message, true);
    }
    setBusy(false);
  }
  return html`<form class="stack" onSubmit=${create}>
    <input class="input" placeholder="למשל: ליגת הבחירות של אקמי" value=${name} onInput=${(e) => setName(e.target.value)} maxlength="40" />
    <button class="btn" disabled=${busy || name.trim().length < 2}>${busy ? '…' : 'פתיחת ליגה'}</button>
  </form>`;
}

// Shown to a player who is not in any league yet.
export function LeagueGate() {
  const { refresh, state } = useApp();
  const enter = async (league, hash = '#/') => {
    setLeagueId(league.id);
    location.hash = hash;
    await refresh();
  };
  return html`<div class="login" style=${{ alignContent: 'start', paddingTop: '40px' }}>
    <div class="login-logo">
      <div class="mark" style=${{ fontSize: '56px' }}>🏟️</div>
      <h1>היי ${state.user.name.split(' ')[0]}, באיזו ליגה משחקים?</h1>
      <p>כל מקום עבודה מתחרה בליגה משלו. ההימורים שלך אישיים ונספרים בכל ליגה שתצטרפו אליה.</p>
    </div>
    <section class="card stack">
      <div class="card-title">🔑 קיבלתי קוד או קישור</div>
      <${JoinForm} onJoined=${(l) => enter(l)} />
    </section>
    <section class="card stack">
      <div class="card-title">✨ פותחים ליגה חדשה למשרד</div>
      <p class="small muted">תקבלו קישור הזמנה לשלוח לעמיתים, ואת ניהול הליגה.</p>
      <${CreateForm} onCreated=${(l) => enter(l, '#/league')} />
    </section>
  </div>`;
}

export function LeaguePage() {
  const { state, refresh, toast } = useApp();
  const league = state.league;
  const isAdmin = league.role === 'admin' || state.user.isAdmin;

  async function switchTo(id) {
    setLeagueId(id);
    await refresh();
    toast('עברת ליגה');
  }

  async function leave() {
    if (!confirm(`לצאת מליגת ״${league.name}״? ההימורים שלך נשמרים ויישארו בליגות האחרות.`)) return;
    try {
      await api(`/leagues/${league.id}/leave`, { method: 'POST' });
      setLeagueId(null);
      location.hash = '#/';
      await refresh();
    } catch (err) {
      toast(err.message, true);
    }
  }

  async function copy(text, msg) {
    try {
      await navigator.clipboard.writeText(text);
      toast(msg);
    } catch {
      toast(text);
    }
  }

  return html`
    <section class="hero">
      <p class="sub">הליגה שלך</p>
      <h1>🏟️ ${league.name}</h1>
      <div class="row" style=${{ marginTop: '14px', gap: '8px' }}>
        <span class="pill" style=${{ fontSize: '15px' }}>👥 ${league.members} משתתפים</span>
        <button type="button" class="pill ltr" style=${{ border: 0, color: 'inherit', fontSize: '15px', letterSpacing: '0.08em' }}
          onClick=${() => copy(league.id, 'הקוד הועתק ✓')} aria-label="העתקת קוד הליגה">🔑 ${league.id}</button>
      </div>
      <button class="btn block accent" style=${{ marginTop: '16px' }} onClick=${() => shareInvite(league, toast)}>📨 שליחת קישור הזמנה</button>
      <button type="button" class="hero-link" onClick=${() => copy(inviteLink(league.id), 'הקישור הועתק ✓')}>
        <span class="ltr">${inviteLink(league.id).replace(/^https?:\/\//, '')}</span> · 📋 העתקה
      </button>
    </section>

    ${isAdmin && html`<${LeagueAdmin} league=${league} />`}

    <section class="card stack">
      <div class="card-title">🗂️ הליגות שלי</div>
      ${state.leagues.map(
        (l) => html`<div class="row" key=${l.id}>
          <div class="grow">
            <b>${l.name}</b>
            <div class="tiny muted">${l.members} משתתפים${l.role === 'admin' ? ' · מנהל/ת' : ''}</div>
          </div>
          ${l.id === league.id ? html`<span class="chip on">נוכחית</span>` : html`<button class="btn small ghost" onClick=${() => switchTo(l.id)}>מעבר</button>`}
        </div>`,
      )}
    </section>

    <details class="card">
      <summary class="card-title">🔑 הצטרפות לליגה נוספת</summary>
      <${JoinForm} onJoined=${(l) => switchTo(l.id)} />
    </details>
    <details class="card">
      <summary class="card-title">✨ פתיחת ליגה חדשה</summary>
      <p class="small muted" style=${{ marginBottom: '10px' }}>למשל לחברים או למשפחה. אותם הימורים נספרים בכל הליגות שלך.</p>
      <${CreateForm} onCreated=${(l) => switchTo(l.id)} />
    </details>

    <button class="btn quiet" onClick=${leave}>יציאה מהליגה הזו</button>
  `;
}

function LeagueAdmin({ league }) {
  const { state, refresh, toast } = useApp();
  const [data, setData] = useState(null);
  const [name, setName] = useState(league.name);
  const [code, setCode] = useState(league.id);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [q, setQ] = useState('');

  const load = () => api(`/leagues/${league.id}/members`).then(setData).catch((e) => toast(e.message, true));
  useEffect(() => {
    load();
    setName(league.name);
    setCode(league.id);
  }, [league.id]);

  async function saveCode(e) {
    e.preventDefault();
    const next = code.trim().toLowerCase();
    if (next === league.id) return;
    if (!confirm(`לשנות את קוד הליגה ל-${next}? קישורים ישנים ימשיכו לעבוד.`)) return;
    try {
      const r = await api(`/leagues/${league.id}`, { method: 'PATCH', body: { code: next } });
      setLeagueId(r.id);
      await refresh();
      toast(`הקוד עודכן ✓ הקישור החדש: ${inviteLink(r.id).replace(/^https?:\/\//, '')}`);
    } catch (err) {
      toast(err.message, true);
    }
  }

  async function call(path, method, payload, msg) {
    try {
      const r = await api(path, { method, body: payload });
      if (msg) toast(typeof msg === 'function' ? msg(r) : msg);
      await Promise.all([load(), refresh()]);
      return r;
    } catch (err) {
      toast(err.message, true);
      return null;
    }
  }

  const list = (data?.members || []).filter((m) => !q || `${m.name} ${m.email} ${m.team}`.toLowerCase().includes(q.toLowerCase()));

  return html`
    <details class="card">
      <summary class="card-title">✏️ שם וקוד הליגה</summary>
      <div class="stack">
        <form class="field" onSubmit=${(e) => { e.preventDefault(); call(`/leagues/${league.id}`, 'PATCH', { name }, 'השם עודכן ✓'); }}>
          <label for="lname">שם</label>
          <div class="row">
            <input id="lname" class="input grow" value=${name} onInput=${(e) => setName(e.target.value)} maxlength="40" />
            <button class="btn small">שמירה</button>
          </div>
        </form>
        <form class="field" onSubmit=${saveCode}>
          <label for="lcode">קוד (מופיע בקישור ההזמנה)</label>
          <div class="row">
            <input id="lcode" class="input grow ltr" value=${code} maxlength="30" autocapitalize="off" autocomplete="off" spellcheck="false"
              onInput=${(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} />
            <button class="btn small" disabled=${code === league.id || code.length < 3}>שמירה</button>
          </div>
          <span class="tiny muted ltr">${inviteLink(code || league.id).replace(/^https?:\/\//, '')}</span>
          <span class="tiny muted">אותיות באנגלית, ספרות ומקף (3–30 תווים). קישורים עם הקוד הישן ימשיכו לעבוד.</span>
        </form>
      </div>
    </details>

    <details class="card">
      <summary class="card-title">📣 הודעה לכל הליגה</summary>
      <div class="stack">
        <input class="input" placeholder="כותרת (למשל: 🍕 פיצה על חשבון המנצח/ת!)" value=${title} onInput=${(e) => setTitle(e.target.value)} maxlength="80" />
        <textarea class="input" rows="3" placeholder="תוכן (לא חובה)" value=${body} onInput=${(e) => setBody(e.target.value)} maxlength="300"></textarea>
        <button class="btn" disabled=${!title.trim()} onClick=${async () => {
          if (!confirm('לשלוח לכל חברי הליגה?')) return;
          const r = await call(`/leagues/${league.id}/broadcast`, 'POST', { title, body }, (x) => `נשלח ✓ (${x.sent} מכשירים)`);
          if (r) { setTitle(''); setBody(''); }
        }}>שליחה בפוש + בעדכונים</button>
      </div>
    </details>

    <details class="card">
      <summary class="card-title">👥 ניהול משתתפים ${data ? `(${data.members.length})` : ''}</summary>
      ${!data
        ? html`<${Spinner} />`
        : html`
            <input class="input" placeholder="חיפוש…" value=${q} onInput=${(e) => setQ(e.target.value)} />
            ${list.map(
              (m) => html`<div class="user-row" key=${m.id}>
                <div class="row">
                  <span>${m.emoji || '🙂'}</span>
                  <b class="grow">${m.name || '(לא השלים/ה פרופיל)'} ${m.role === 'admin' ? '🛠️' : ''}</b>
                  <span class="tiny muted">${m.answers} תשובות · ${m.push ? '🔔' : '🔕'}</span>
                </div>
                <div class="tiny muted"><span class="ltr">${m.email}</span>${m.team ? ` · ${m.team}` : ''}</div>
                ${m.id !== state.user.id &&
                html`<div class="row wrap" style=${{ gap: '6px' }}>
                  ${!data.mail && m.has_pin && (m.leagues === 1 || state.user.isAdmin)
                    ? html`<button class="btn small ghost" onClick=${() => confirm('לאפס את הקוד האישי? בכניסה הבאה ייבחר קוד חדש.') && call(`/leagues/${league.id}/members/${m.id}`, 'PATCH', { resetPin: true }, 'הקוד אופס')}>איפוס קוד</button>`
                    : null}
                  <button class="btn small ghost" onClick=${() => call(`/leagues/${league.id}/members/${m.id}`, 'PATCH', { role: m.role === 'admin' ? 'member' : 'admin' }, m.role === 'admin' ? 'הניהול הוסר' : 'מנהל/ת חדש/ה')}>
                    ${m.role === 'admin' ? 'הסרת ניהול' : 'הפיכה למנהל/ת'}
                  </button>
                  <button class="btn small danger" onClick=${() => confirm(`להוציא את ${m.name || m.email} מהליגה?`) && call(`/leagues/${league.id}/members/${m.id}`, 'DELETE', {}, 'הוצא/ה מהליגה')}>הוצאה</button>
                </div>`}
              </div>`,
            )}
          `}
    </details>
  `;
}

export { shareInvite };
