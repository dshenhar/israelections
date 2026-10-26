import { html } from 'htm/preact';
import { useEffect, useState } from 'preact/hooks';
import { stageMax } from '/shared/game.js';
import {
  api, pushSupported, deviceSubscription, enablePush, disablePush, isIOS, isStandalone, formatShort, formatTime,
} from '../lib.js';
import { useApp, Avatar, EmojiPicker, medal, Notice } from '../ui.js';

const ALL_BADGES = [
  { id: 'king1', emoji: '👑', title: 'מלך/ת ליל הבחירות', desc: 'מקום ראשון בשלב א׳' },
  { id: 'king2', emoji: '🏛️', title: 'מלך/ת הקואליציה', desc: 'מקום ראשון בשלב ב׳' },
  { id: 'sniper', emoji: '🎯', title: 'צלף/ית', desc: '3+ פגיעות מדויקות במנדטים' },
  { id: 'prophet', emoji: '🔮', title: 'נביא/ה', desc: 'זיהית את הפתעת הבחירות' },
  { id: 'wolf', emoji: '🐺', title: 'זאב בודד', desc: 'צדקת כשכמעט כולם טעו' },
  { id: 'edge', emoji: '🚧', title: 'שומר/ת הסף', desc: 'כל ניחושי אחוז החסימה נכונים' },
  { id: 'full', emoji: '✅', title: 'טופס מלא', desc: 'ענית על כל שאלות שלב א׳' },
];

export function Me() {
  const { state } = useApp();
  const me = state.leaderboard.find((p) => p.id === state.user.id) || { total: 0, s1: 0, s2: 0, rank: '—' };
  const sc = state.myScore;
  const [editing, setEditing] = useState(false);
  const earned = new Set(state.badges.map((b) => b.id));

  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    location.hash = '#/';
    location.reload();
  }

  return html`
    ${editing
      ? html`<${EditProfile} onDone=${() => setEditing(false)} />`
      : html`<section class="card row">
          <${Avatar} emoji=${state.user.emoji} lg />
          <div class="grow">
            <h2 style=${{ fontSize: '22px' }}>${state.user.name}</h2>
            <div class="muted small">${state.user.team || 'ללא צוות'} · <span class="ltr">${state.user.email}</span></div>
          </div>
          <button class="btn small ghost" onClick=${() => setEditing(true)}>עריכה</button>
        </section>`}

    <div class="tiles">
      <div class="tile"><div class="v">${me.total}</div><div class="l">נקודות</div></div>
      <div class="tile"><div class="v">${state.results.stage1 ? medal(me.rank) || me.rank : '—'}</div><div class="l">מקום מתוך ${state.leaderboard.length}</div></div>
      <div class="tile"><div class="v">${sc.resolved ? `${Math.round((sc.correct / sc.resolved) * 100)}%` : '—'}</div><div class="l">דיוק (${sc.correct}/${sc.resolved} שאלות)</div></div>
      <div class="tile"><div class="v">${sc.exactSeats}</div><div class="l">פגיעות מדויקות במנדטים</div></div>
    </div>

    <section class="card stack">
      <div class="card-title">📊 לפי שלבים</div>
      ${[
        [1, '🗳️ ליל הבחירות', me.s1],
        [2, '🏛️ הקמת הממשלה', me.s2],
      ].map(
        ([stage, label, pts]) => html`<div>
          <div class="row small" style=${{ marginBottom: '4px' }}>
            <b class="grow">${label}</b><span class="num">${pts} מתוך ${stageMax(stage, state.results)}</span>
          </div>
          <div class="progress light"><i style=${{ width: `${(pts / stageMax(stage, state.results)) * 100}%` }}></i></div>
        </div>`,
      )}
    </section>

    <${History} />

    <section class="card">
      <div class="card-title" style=${{ marginBottom: '10px' }}>🏅 תגים</div>
      <div class="badges">
        ${ALL_BADGES.map(
          (b) => html`<div class=${`badge ${earned.has(b.id) ? '' : 'locked'}`}>
            <span class="e">${b.emoji}</span><b>${b.title}</b><span>${b.desc}</span>
          </div>`,
        )}
      </div>
    </section>

    <${PushSettings} />

    <a href="#/rules" class="card flat row" style=${{ textDecoration: 'none', color: 'inherit' }}>
      <span style=${{ fontSize: '22px' }}>📖</span><b class="grow">חוקי המשחק והניקוד</b><span class="muted">←</span>
    </a>
    <a href="#/league" class="card flat row" style=${{ textDecoration: 'none', color: 'inherit' }}>
      <span style=${{ fontSize: '22px' }}>🏟️</span>
      <div class="grow"><b>הליגות שלי</b><div class="small muted">${state.league.name} · הזמנת חברים, מעבר ליגה${state.league.role === 'admin' ? ', ניהול' : ''}</div></div>
      <span class="muted">←</span>
    </a>
    ${state.user.isAdmin &&
    html`<a href="#/admin" class="card flat row" style=${{ textDecoration: 'none', color: 'inherit' }}>
      <span style=${{ fontSize: '22px' }}>🛠️</span>
      <div class="grow"><b>ניהול האתר</b><div class="small muted">תוצאות, זמני נעילה ושלב ב׳ — לכל הליגות</div></div>
      <span class="muted">←</span>
    </a>`}
    <button class="btn quiet" onClick=${logout}>התנתקות</button>
  `;
}

function EditProfile({ onDone }) {
  const { state, refresh, toast } = useApp();
  const [name, setName] = useState(state.user.name);
  const [team, setTeam] = useState(state.user.team || '');
  const [emoji, setEmoji] = useState(state.user.emoji || '🙂');
  async function save(e) {
    e.preventDefault();
    try {
      await api('/me', { method: 'PATCH', body: { name, team, emoji, league: state.league.id } });
      await refresh();
      toast('הפרופיל עודכן ✓');
      onDone();
    } catch (err) {
      toast(err.message, true);
    }
  }
  return html`<form class="card stack" onSubmit=${save}>
    <div class="field"><label for="n">שם</label><input id="n" class="input" value=${name} onInput=${(e) => setName(e.target.value)} maxlength="40" /></div>
    <div class="field">
      <label for="t">צוות / מחלקה</label>
      <input id="t" class="input" list="teams2" value=${team} onInput=${(e) => setTeam(e.target.value)} maxlength="40" />
      <datalist id="teams2">${state.teams.map((t) => html`<option value=${t} />`)}</datalist>
    </div>
    <div class="field"><span class="label">אווטאר</span><${EmojiPicker} value=${emoji} onChange=${setEmoji} /></div>
    <div class="row"><button class="btn grow">שמירה</button><button type="button" class="btn ghost" onClick=${onDone}>ביטול</button></div>
  </form>`;
}

function History() {
  const { state } = useApp();
  const h = state.history;
  if (!h.length) return null;
  if (h.length === 1) {
    return html`<section class="card">
      <div class="card-title">📈 ההיסטוריה שלך</div>
      <p class="small muted" style=${{ marginTop: '6px' }}>${h[0].label}: מקום ${h[0].rank} עם ${h[0].points} נק׳. הגרף יופיע אחרי העדכון הבא.</p>
    </section>`;
  }
  const W = 320;
  const H = 130;
  const pad = 22;
  const maxRank = Math.max(...h.map((x) => x.of), 2);
  const x = (i) => pad + (i * (W - pad * 2)) / (h.length - 1);
  const y = (r) => pad + ((r - 1) * (H - pad * 2)) / (maxRank - 1);
  const d = h.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.rank).toFixed(1)}`).join(' ');
  return html`<section class="card">
    <div class="card-title" style=${{ marginBottom: '6px' }}>📈 המקום שלך לאורך הערב</div>
    <svg class="chart" viewBox=${`0 0 ${W} ${H + 18}`} role="img" aria-label=${h.map((p) => `${p.label}: מקום ${p.rank}`).join(', ')}>
      <line x1=${pad} x2=${W - pad} y1=${y(1)} y2=${y(1)} stroke="var(--line)" stroke-dasharray="3 4" />
      <path d=${d} fill="none" stroke="var(--blue)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" />
      ${h.map(
        (p, i) => html`<g>
          <circle cx=${x(i)} cy=${y(p.rank)} r="5" fill="var(--surface)" stroke="var(--blue)" stroke-width="2.5" />
          <text x=${x(i)} y=${y(p.rank) - 10} text-anchor="middle" font-size="12" font-weight="700" fill="var(--ink)">${p.rank}</text>
          <text x=${x(i)} y=${H + 14} text-anchor="middle" font-size="10" fill="var(--muted)">${formatTime(p.at)}</text>
        </g>`,
      )}
    </svg>
    <p class="tiny muted">המספרים = המקום שלך בטבלה בכל עדכון · ${formatShort(h[0].at)}</p>
  </section>`;
}

function PushSettings() {
  const { config, toast, refresh } = useApp();
  const [sub, setSub] = useState(undefined);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    deviceSubscription().then(setSub).catch(() => setSub(null));
  }, []);

  if (!pushSupported()) {
    return html`<section class="card stack">
      <div class="card-title">🔔 התראות</div>
      ${isIOS() && !isStandalone()
        ? html`<p class="small muted">באייפון צריך קודם להוסיף את האפליקציה למסך הבית (כפתור השיתוף ⬆︎ ← ״הוספה למסך הבית״), ואז להפעיל התראות מתוכה.</p>`
        : html`<p class="small muted">הדפדפן הזה לא תומך בהתראות.</p>`}
    </section>`;
  }

  async function toggle() {
    setBusy(true);
    try {
      if (sub) {
        await disablePush();
        setSub(null);
        toast('ההתראות כובו במכשיר הזה');
      } else {
        setSub(await enablePush(config.vapidPublicKey));
        toast('ההתראות הופעלו 🔔');
      }
      refresh();
    } catch (err) {
      toast(err.message, true);
    }
    setBusy(false);
  }

  async function test() {
    const r = await api('/push/test', { method: 'POST' }).catch(() => null);
    toast(r?.sent ? 'נשלחה התראת בדיקה' : 'לא הצלחנו לשלוח — נסו לכבות ולהדליק', !r?.sent);
  }

  return html`<section class="card stack">
    <div class="row">
      <div class="card-title grow">🔔 התראות במכשיר הזה</div>
      <button class=${`btn small ${sub ? 'ghost' : ''}`} onClick=${toggle} disabled=${busy || sub === undefined}>${sub ? 'כיבוי' : 'הפעלה'}</button>
    </div>
    <p class="small muted">תזכורות לפני נעילה, המדגמים ב-22:00, עדכוני ספירה עם המקום שלך, פתיחת שלב ב׳ ומתן המנדט.</p>
    ${sub && html`<button class="btn quiet small" style=${{ justifySelf: 'start' }} onClick=${test}>שליחת התראת בדיקה</button>`}
    ${typeof Notification !== 'undefined' && Notification.permission === 'denied' &&
    html`<${Notice} icon="🚫" tone="warn">ההתראות חסומות בדפדפן. אפשר לאשר אותן בהגדרות האתר.<//>`}
  </section>`;
}
