import { html } from 'htm/preact';
import { useEffect, useState } from 'preact/hooks';
import { PARTIES, QUESTIONS, PARTY, knessetParties } from '/shared/game.js';
import { api, toLocalInput, fromLocalInput, timeAgo } from '../lib.js';
import { useApp, Notice, Spinner, MiniSlip } from '../ui.js';

const LABELS = ['מדגם חדשות 12', 'מדגם כאן 11', 'מדגם חדשות 13', 'ספירה: 50%', 'ספירה: 90%', 'ספירה: 99%', 'תוצאות סופיות'];

export function Admin() {
  const { state, refresh, toast } = useApp();
  const [data, setData] = useState(null);

  const load = () => api('/admin/data').then(setData).catch((e) => toast(e.message, true));
  useEffect(() => {
    load();
  }, []);

  if (!state.user.isAdmin) return html`<${Notice} icon="⛔">העמוד הזה למנהלי המשחק בלבד<//>`;
  if (!data) return html`<${Spinner} />`;

  const reload = async () => {
    await Promise.all([load(), refresh()]);
  };

  return html`
    <section class="hero">
      <h1>🛠️ ניהול האתר</h1>
      <p class="sub">
        ${data.leagues.length} ליגות · ${data.users.length} משתתפים · התראות: ${data.push.users} אנשים (${data.push.n} מכשירים) · כניסה:
        ${data.mail ? `קוד במייל (${data.mail})` : 'מייל + קוד אישי'}
      </p>
      <p class="sub" style=${{ marginTop: '6px' }}>תוצאות, זמני נעילה ושלב ב׳ שמוזנים כאן חלים על כל הליגות.</p>
    </section>
    <${Stage1Results} data=${data} reload=${reload} />
    <${Stage2Panel} data=${data} reload=${reload} />
    <${LockTimes} data=${data} reload=${reload} />
    <${Broadcast} reload=${reload} />
    <${Leagues} data=${data} />
    <${Users} data=${data} reload=${reload} />
  `;
}

function Stage1Results({ data, reload }) {
  const { toast } = useApp();
  const s1 = data.results.stage1;
  const [seats, setSeats] = useState(() => Object.fromEntries(PARTIES.map((p) => [p.id, s1?.seats?.[p.id] ?? ''])));
  const [other, setOther] = useState(s1?.other || '');
  const [turnout, setTurnout] = useState(s1?.turnout ?? '');
  const [label, setLabel] = useState(s1?.label || LABELS[0]);
  const [final, setFinal] = useState(!!s1?.final);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);

  const sum = PARTIES.reduce((s, p) => s + (Number(seats[p.id]) || 0), 0) + (Number(other) || 0);
  const filled = PARTIES.filter((p) => seats[p.id] !== '').length;

  async function save() {
    if (final && !confirm('לסמן כתוצאות סופיות? המנצח/ת של שלב א׳ יוכתר/תוכתר.')) return;
    setBusy(true);
    try {
      const body = {
        seats: Object.fromEntries(PARTIES.map((p) => [p.id, seats[p.id] === '' ? null : Number(seats[p.id])])),
        other: Number(other) || 0,
        turnout: turnout === '' ? null : Number(turnout),
        label,
        final,
        notify,
      };
      const r = await api('/admin/results/stage1', { method: 'PUT', body });
      toast(notify ? `נשמר ✓ · נשלחו ${r.sent} התראות` : 'נשמר ✓');
      await reload();
    } catch (err) {
      toast(err.message, true);
    }
    setBusy(false);
  }

  async function clear() {
    if (!confirm('למחוק את כל תוצאות שלב א׳? הניקוד יתאפס.')) return;
    await api('/admin/results/stage1', { method: 'PUT', body: { clear: true } });
    setSeats(Object.fromEntries(PARTIES.map((p) => [p.id, ''])));
    setTurnout('');
    setFinal(false);
    toast('התוצאות נמחקו');
    reload();
  }

  return html`<details class="card" open>
    <summary class="card-title">📡 תוצאות שלב א׳ ${s1 ? html`<span class="tiny muted">· ${s1.label} · ${timeAgo(s1.updatedAt)}</span>` : ''}</summary>
    <div class="stack">
      <div class="field">
        <span class="label">מקור העדכון</span>
        <div class="chips">${LABELS.map((l) => html`<button type="button" class=${`chip ${label === l ? 'on' : ''}`} onClick=${() => { setLabel(l); setFinal(l === 'תוצאות סופיות'); }}>${l}</button>`)}</div>
        <input class="input" value=${label} onInput=${(e) => setLabel(e.target.value)} maxlength="60" />
      </div>
      <div class="admin-grid">
        ${PARTIES.map(
          (p) => html`<div class="field" key=${p.id}>
            <label><${MiniSlip} pid=${p.id} /> ${p.name}</label>
            <input class="input num" type="number" inputmode="numeric" min="0" max="120" value=${seats[p.id]}
              onInput=${(e) => setSeats({ ...seats, [p.id]: e.target.value })} />
          </div>`,
        )}
        <div class="field">
          <label>אחרות</label>
          <input class="input num" type="number" inputmode="numeric" min="0" max="120" value=${other} onInput=${(e) => setOther(e.target.value)} />
        </div>
        <div class="field">
          <label>🗳️ אחוז הצבעה</label>
          <input class="input num" type="number" inputmode="decimal" step="0.1" min="0" max="100" placeholder="70.6" value=${turnout} onInput=${(e) => setTurnout(e.target.value)} />
        </div>
      </div>
      <div class=${`notice ${sum === 120 ? 'good' : 'warn'}`}>
        <span class="i">${sum === 120 ? '✅' : '🧮'}</span>
        <div>סה״כ <b class="num">${sum}</b>/120 · מולאו ${filled}/${PARTIES.length} מפלגות${filled < PARTIES.length ? ' (הניקוד על מנדטים מחושב רק כשכל המפלגות מולאו — 0 למי שלא עברה)' : ''}</div>
      </div>
      <label class="check"><input type="checkbox" checked=${notify} onChange=${(e) => setNotify(e.target.checked)} /> לשלוח לכולם התראה עם המקום שלהם</label>
      <label class="check"><input type="checkbox" checked=${final} onChange=${(e) => setFinal(e.target.checked)} /> 🏁 אלו התוצאות הסופיות (הכתרת המנצח/ת)</label>
      <button class="btn block" disabled=${busy} onClick=${save}>${busy ? 'שומר…' : 'שמירה ועדכון הטבלה'}</button>
      ${s1 && html`<button class="btn quiet small" onClick=${clear}>מחיקת התוצאות</button>`}
    </div>
  </details>`;
}

function Stage2Panel({ data, reload }) {
  const { toast } = useApp();
  const s = data.settings;
  const s2 = data.results.stage2 || {};
  const knesset = knessetParties(data.results);
  const [vals, setVals] = useState(() => ({ ...s2, coalition: { ...(s2.coalition || {}) } }));
  const [lock, setLock] = useState(toLocalInput(s.stage2Lock));
  const [label, setLabel] = useState('');
  const [notify, setNotify] = useState(true);
  const qs = QUESTIONS.filter((q) => q.stage === 2 && q.type !== 'coalition');

  async function settings(body, msg) {
    try {
      const r = await api('/admin/settings', { method: 'PUT', body });
      toast(r.sent ? `${msg} · נשלחו ${r.sent} התראות` : msg);
      reload();
    } catch (err) {
      toast(err.message, true);
    }
  }

  async function saveResults() {
    try {
      const r = await api('/admin/results/stage2', { method: 'PUT', body: { ...vals, label, notify: notify && !!label } });
      toast(r.sent ? `נשמר ✓ · נשלחו ${r.sent} התראות` : 'נשמר ✓');
      reload();
    } catch (err) {
      toast(err.message, true);
    }
  }

  return html`<details class="card" open=${s.stage2Open}>
    <summary class="card-title">🏛️ שלב ב׳ — הקמת הממשלה</summary>
    <div class="stack">
      ${!data.results.stage1?.final && html`<${Notice} icon="💡" tone="warn">כדאי לפתוח את שלב ב׳ רק אחרי שהזנתם תוצאות סופיות — רשימת המפלגות לשאלת הקואליציה נקבעת לפיהן.<//>`}
      <div class="row">
        <b class="grow">${s.stage2Open ? '✅ השלב פתוח להימורים' : 'השלב סגור'}</b>
        <button class=${`btn small ${s.stage2Open ? 'ghost' : ''}`} onClick=${() => settings({ stage2Open: !s.stage2Open }, s.stage2Open ? 'השלב נסגר' : 'שלב ב׳ נפתח 🎉')}>
          ${s.stage2Open ? 'סגירה' : 'פתיחה + התראה לכולם'}
        </button>
      </div>
      <div class="field">
        <label for="l2">נעילת ההימורים (לפני ההתייעצויות אצל הנשיא)</label>
        <div class="row">
          <input id="l2" class="input grow" type="datetime-local" value=${lock} onInput=${(e) => setLock(e.target.value)} />
          <button class="btn small" onClick=${() => settings({ stage2Lock: fromLocalInput(lock) }, 'זמן הנעילה עודכן')}>שמירה</button>
        </div>
      </div>
      <div class="section-title">תוצאות (מעדכנים כל אחת כשהיא מתבררת)</div>
      ${qs.map(
        (q) => html`<div class="field" key=${q.id}>
          <label>${q.emoji} ${q.title}</label>
          <select class="input" value=${vals[q.id] || ''} onChange=${(e) => setVals({ ...vals, [q.id]: e.target.value || null })}>
            <option value="">— עדיין לא ידוע —</option>
            ${q.options.map((o) => html`<option value=${o.id}>${o.label}</option>`)}
          </select>
        </div>`,
      )}
      <div class="field">
        <label>🤝 קואליציה / אופוזיציה ביום ההשבעה</label>
        ${!knesset.length && html`<p class="small muted">אין עדיין תוצאות שלב א׳</p>`}
        ${knesset.map(
          (pid) => html`<div class="prow" key=${pid}>
            <${MiniSlip} pid=${pid} /><div class="pname"><b>${PARTY[pid].name}</b></div>
            <select class="input" style=${{ width: '150px' }} value=${vals.coalition[pid] || ''}
              onChange=${(e) => setVals({ ...vals, coalition: { ...vals.coalition, [pid]: e.target.value || undefined } })}>
              <option value="">—</option><option value="coalition">קואליציה</option><option value="opposition">אופוזיציה</option>
            </select>
          </div>`,
        )}
      </div>
      <div class="field">
        <label for="lbl2">כותרת לעדכון (למשל: ״הנשיא הטיל את המשימה על…״)</label>
        <input id="lbl2" class="input" value=${label} onInput=${(e) => setLabel(e.target.value)} maxlength="60" />
      </div>
      <label class="check"><input type="checkbox" checked=${notify} onChange=${(e) => setNotify(e.target.checked)} /> לשלוח התראה עם המקום בטבלה (צריך כותרת)</label>
      <button class="btn block" onClick=${saveResults}>שמירת תוצאות שלב ב׳</button>
      <label class="check">
        <input type="checkbox" checked=${s.stage2Final} onChange=${(e) => settings({ stage2Final: e.target.checked }, e.target.checked ? 'שלב ב׳ הוכרע 🏆' : 'בוטל')} />
        🏁 שלב ב׳ הוכרע (הכתרת אלוף/ת הקואליציה)
      </label>
    </div>
  </details>`;
}

function LockTimes({ data, reload }) {
  const { toast } = useApp();
  const [l1, setL1] = useState(toLocalInput(data.settings.stage1Lock));
  const [lt, setLt] = useState(toLocalInput(data.settings.turnoutLock));
  async function save() {
    try {
      await api('/admin/settings', { method: 'PUT', body: { stage1Lock: fromLocalInput(l1), turnoutLock: fromLocalInput(lt) } });
      toast('זמני הנעילה עודכנו ✓');
      reload();
    } catch (err) {
      toast(err.message, true);
    }
  }
  return html`<details class="card">
    <summary class="card-title">⏱️ זמני נעילה (שעון ישראל)</summary>
    <div class="stack">
      <div class="field"><label for="l1">נעילת שלב א׳</label><input id="l1" class="input" type="datetime-local" value=${l1} onInput=${(e) => setL1(e.target.value)} /></div>
      <div class="field"><label for="lt">נעילת שאלת אחוז ההצבעה</label><input id="lt" class="input" type="datetime-local" value=${lt} onInput=${(e) => setLt(e.target.value)} /></div>
      <button class="btn" onClick=${save}>שמירה</button>
    </div>
  </details>`;
}

function Broadcast({ reload }) {
  const { toast } = useApp();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  async function send() {
    if (!confirm('לשלוח את ההודעה לכולם?')) return;
    try {
      const r = await api('/admin/broadcast', { method: 'POST', body: { title, body } });
      toast(`נשלח ✓ (${r.sent} מכשירים)`);
      setTitle('');
      setBody('');
      reload();
    } catch (err) {
      toast(err.message, true);
    }
  }
  return html`<details class="card">
    <summary class="card-title">📣 הודעה לכל המשתתפים בכל הליגות</summary>
    <div class="stack">
      <input class="input" placeholder="כותרת (למשל: 🔥 עוד שעה לנעילה!)" value=${title} onInput=${(e) => setTitle(e.target.value)} maxlength="80" />
      <textarea class="input" rows="3" placeholder="תוכן (לא חובה)" value=${body} onInput=${(e) => setBody(e.target.value)} maxlength="300"></textarea>
      <button class="btn" disabled=${!title.trim()} onClick=${send}>שליחה בפוש + בעדכונים</button>
    </div>
  </details>`;
}

function Leagues({ data }) {
  return html`<details class="card">
    <summary class="card-title">🏟️ ליגות (${data.leagues.length})</summary>
    ${data.leagues.map(
      (l) => html`<div class="row user-row" key=${l.id} style=${{ display: 'flex' }}>
        <div class="grow"><b>${l.name}</b><div class="tiny muted">נפתחה ע״י ${l.creator || '—'} · קוד <span class="ltr">${l.id}</span></div></div>
        <span class="small num">${l.members} 👥</span>
      </div>`,
    )}
  </details>`;
}

function Users({ data, reload }) {
  const { toast, state } = useApp();
  const [q, setQ] = useState('');
  const list = data.users.filter((u) => !q || `${u.name} ${u.email} ${u.team}`.toLowerCase().includes(q.toLowerCase()));
  async function patch(u, body, msg) {
    try {
      await api(`/admin/users/${u.id}`, { method: 'PATCH', body });
      toast(msg);
      reload();
    } catch (err) {
      toast(err.message, true);
    }
  }
  async function remove(u) {
    if (!confirm(`למחוק את ${u.name || u.email} וכל ההימורים שלו/ה?`)) return;
    try {
      await api(`/admin/users/${u.id}`, { method: 'DELETE' });
      toast('נמחק');
      reload();
    } catch (err) {
      toast(err.message, true);
    }
  }
  return html`<details class="card">
    <summary class="card-title">👥 משתתפים (${data.users.length})</summary>
    <input class="input" placeholder="חיפוש…" value=${q} onInput=${(e) => setQ(e.target.value)} />
    ${list.map(
      (u) => html`<div class="user-row" key=${u.id}>
        <div class="row">
          <span>${u.emoji || '🙂'}</span>
          <b class="grow">${u.name || '(לא השלים/ה פרופיל)'} ${u.is_admin ? '🛠️' : ''}</b>
          <span class="tiny muted">${u.answers} תשובות · ${u.push ? '🔔' : '🔕'}</span>
        </div>
        <div class="tiny muted ltr">${u.email}${u.team ? ` · ${u.team}` : ''}</div>
        <div class="row wrap" style=${{ gap: '6px' }}>
          ${!data.mail && u.has_pin ? html`<button class="btn small ghost" onClick=${() => confirm('לאפס את הקוד האישי? בכניסה הבאה הוא/היא יבחרו קוד חדש.') && patch(u, { resetPin: true }, 'הקוד אופס')}>איפוס קוד</button>` : null}
          ${u.id !== state.user.id &&
          html`<button class="btn small ghost" onClick=${() => patch(u, { isAdmin: !u.is_admin }, u.is_admin ? 'ההרשאה הוסרה' : 'מנהל/ת חדש/ה')}>${u.is_admin ? 'הסרת ניהול' : 'הפיכה למנהל/ת'}</button>`}
          ${u.id !== state.user.id && html`<button class="btn small danger" onClick=${() => remove(u)}>מחיקה</button>`}
        </div>
      </div>`,
    )}
  </details>`;
}
