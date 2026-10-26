import { html } from 'htm/preact';
import { useEffect, useState } from 'preact/hooks';
import { QUESTIONS, isAnswered, isOpen, lockTime } from '/shared/game.js';
import {
  api, formatWhen, formatTime, timeAgo, isIOS, isStandalone, pushSupported, deviceSubscription, enablePush,
  canInstall, onInstallChange, promptInstall,
} from '../lib.js';
import { useApp, useNow, Countdown, Progress, Avatar, medal, Notice } from '../ui.js';
import { shareInvite } from './league.js';

export function Home() {
  const { state } = useApp();
  return html`
    <${Hero} />
    <${TurnoutAlert} />
    <${PushCard} />
    <${MiniBoard} />
    <${Feed} />
    <${Invite} />
    <a href="#/rules" class="card flat row" style=${{ textDecoration: 'none', color: 'inherit' }}>
      <span style=${{ fontSize: '24px' }}>📖</span>
      <div class="grow"><b>איך מחשבים נקודות?</b><div class="small muted">כל החוקים בדקה אחת</div></div>
      <span class="muted">←</span>
    </a>
    <p class="center tiny muted">👥 ${state.participants.total} משתתפים · ${state.participants.complete1} מילאו טופס מלא</p>
  `;
}

function stageProgress(state, stage) {
  const qs = QUESTIONS.filter((q) => q.stage === stage);
  return { done: qs.filter((q) => isAnswered(q, state.answers[q.id])).length, total: qs.length };
}

function myRow(state) {
  return state.leaderboard.find((p) => p.id === state.user.id);
}

function Hero() {
  const { state } = useApp();
  const now = useNow();
  const { settings, results, user } = state;
  const s1 = results.stage1;
  const first = user.name.split(' ')[0];
  const me = myRow(state);
  const total = state.leaderboard.length;

  // Stage 2 is running
  if (settings.stage2Open && s1?.final) {
    const p = stageProgress(state, 2);
    const lock = settings.stage2Lock;
    const open = !lock || now < Date.parse(lock);
    const champs = state.leaderboard.filter((x) => state.winners[1].includes(x.id));
    return html`<section class="hero">
      <h1>🏛️ שלב ב׳: הקמת הממשלה</h1>
      ${champs.length > 0 && html`<p class="small" style=${{ marginTop: '4px', opacity: 0.85 }}>👑 ${champs.length > 1 ? 'אלופי' : 'אלוף/ת'} ליל הבחירות: ${champs.map((w) => w.name).join(', ')}</p>`}
      ${open
        ? html`<p class="sub">${lock ? 'ההימורים ננעלים בעוד' : 'ההימורים פתוחים — הנעילה תיקבע לפני ההתייעצויות אצל הנשיא'}</p>
            ${lock ? html`<${Countdown} to=${lock} />` : html`<div style=${{ height: '14px' }}></div>`}
            <div class="row small" style=${{ marginBottom: '6px' }}><span class="grow">מילאת ${p.done} מתוך ${p.total}</span></div>
            <${Progress} value=${p.done} max=${p.total} />
            <a class=${`btn block ${p.done < p.total ? 'accent' : ''}`} style=${{ marginTop: '16px' }} href="#/bets/2">
              ${p.done < p.total ? 'להמר על שלב ב׳ ←' : 'לעבור על התשובות'}
            </a>`
        : html`<${Standing} me=${me} total=${total} label=${results.stage2 && Object.keys(results.stage2).length ? 'הטבלה מתעדכנת עם כל התפתחות' : 'ההימורים נעולים — מחכים להתפתחויות'} />`}
    </section>`;
  }

  // Stage 1 results are in (live or final)
  if (s1) {
    const winners = state.leaderboard.filter((p) => state.winners[1].includes(p.id));
    return html`<section class="hero">
      <h1>${s1.final ? '🏆 שלב א׳ הוכרע!' : `📡 ${s1.label}`}</h1>
      <p class="sub">${s1.final ? 'התוצאות הסופיות של ליל הבחירות' : `עודכן ${timeAgo(s1.updatedAt, now)} · הטבלה מתעדכנת בשידור חי`}</p>
      ${s1.final && winners.length > 0 &&
      html`<p style=${{ marginTop: '10px', fontWeight: 700 }}>👑 ${winners.length > 1 ? 'המנצחים' : 'המנצח/ת'}: ${winners.map((w) => w.name).join(', ')}</p>`}
      <${Standing} me=${me} total=${total} />
      <a class="btn block" style=${{ marginTop: '16px' }} href="#/board">לטבלה המלאה ←</a>
    </section>`;
  }

  const lock = settings.stage1Lock;
  if (now >= Date.parse(lock)) {
    return html`<section class="hero">
      <h1>🔒 ההימורים נעולים</h1>
      <p class="sub">הקלפיות נסגרו. ברגע שיתפרסמו המדגמים הטבלה תתעורר כאן — נשלח התראה.</p>
      <a class="btn block" style=${{ marginTop: '16px' }} href="#/crowd">מה המשרד חושב? 🧠</a>
    </section>`;
  }

  const p = stageProgress(state, 1);
  return html`<section class="hero">
    <h1>היי ${first} 👋</h1>
    <p class="sub">ההימורים על ליל הבחירות ננעלים בעוד</p>
    <${Countdown} to=${lock} />
    <div class="row small" style=${{ marginBottom: '6px' }}>
      <span class="grow">מילאת ${p.done} מתוך ${p.total} שאלות</span>
      <span style=${{ opacity: 0.75 }}>נעילה ${formatWhen(lock)}</span>
    </div>
    <${Progress} value=${p.done} max=${p.total} />
    <a class=${`btn block ${p.done < p.total ? 'accent' : ''}`} style=${{ marginTop: '16px' }} href="#/bets/1">
      ${p.done === 0 ? 'מתחילים להמר ←' : p.done < p.total ? 'להמשיך למלא ←' : 'הטופס מלא ✓ — לעבור עליו'}
    </a>
  </section>`;
}

function Standing({ me, total, label }) {
  if (!me) return null;
  return html`<div class="bigrank">
      <div>
        <div class="small" style=${{ opacity: 0.75 }}>המקום שלך</div>
        <div class="n">${medal(me.rank) || me.rank}<small> מתוך ${total}</small></div>
      </div>
      <div>
        <div class="small" style=${{ opacity: 0.75 }}>נקודות</div>
        <div class="n">${me.total}</div>
      </div>
    </div>
    ${label && html`<p class="sub">${label}</p>`}`;
}

function TurnoutAlert() {
  const { state } = useApp();
  const now = useNow();
  const q = QUESTIONS.find((x) => x.id === 'turnout');
  const lock = lockTime(q, state.settings);
  if (!lock || !isOpen(q, state.settings, now) || state.answers.turnout !== undefined) return null;
  if (Date.parse(lock) - now > 24 * 3600_000) return null;
  return html`<${Notice} icon="⏰" tone="warn">
    <b>שאלת אחוז ההצבעה ננעלת ב-${formatTime(lock)}</b> — לפני דיווח ההצבעה הראשון. <a href="#/bets/1">לענות עכשיו</a>
  <//>`;
}

function PushCard() {
  const { state, config, toast, refresh } = useApp();
  const [sub, setSub] = useState(undefined);
  const [installable, setInstallable] = useState(canInstall());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    deviceSubscription().then(setSub).catch(() => setSub(null));
    return onInstallChange(() => setInstallable(canInstall()));
  }, []);

  if (isIOS() && !isStandalone()) {
    return html`<div class="card stack">
      <div class="card-title">📲 התקנה לאייפון</div>
      <p class="small muted">כדי לקבל התראות (מדגמים, תזכורות לפני נעילה, המקום שלך בטבלה) צריך להוסיף את האפליקציה למסך הבית:</p>
      <ol class="small" style=${{ margin: 0, paddingInlineStart: '20px' }}>
        <li>לוחצים על כפתור השיתוף <b>⬆︎</b> בתחתית ספארי</li>
        <li>בוחרים <b>״הוספה למסך הבית״</b></li>
        <li>פותחים את 61 מהמסך הבית ומפעילים התראות</li>
      </ol>
    </div>`;
  }

  if (installable) {
    return html`<div class="card row">
      <span style=${{ fontSize: '28px' }}>📲</span>
      <div class="grow"><b>התקנת האפליקציה</b><div class="small muted">גישה מהירה מהמסך הבית</div></div>
      <button class="btn small ghost" onClick=${promptInstall}>התקנה</button>
    </div>`;
  }

  if (!pushSupported() || sub === undefined || sub) return null;
  if (Notification.permission === 'denied') return null;

  async function on() {
    setBusy(true);
    try {
      const s = await enablePush(config.vapidPublicKey);
      setSub(s);
      await api('/push/test', { method: 'POST' });
      toast('ההתראות הופעלו 🔔');
      refresh();
    } catch (err) {
      toast(err.message, true);
    }
    setBusy(false);
  }

  return html`<div class="card row">
    <span style=${{ fontSize: '28px' }}>🔔</span>
    <div class="grow">
      <b>התראות לטלפון</b>
      <div class="small muted">תזכורת לפני נעילה, המדגמים ב-22:00 והמקום שלך בטבלה${state.hasPush ? ' (כבר פעיל במכשיר אחר)' : ''}</div>
    </div>
    <button class="btn small" onClick=${on} disabled=${busy}>${busy ? '…' : 'הפעלה'}</button>
  </div>`;
}

function MiniBoard() {
  const { state } = useApp();
  if (!state.results.stage1) return null;
  const top = state.leaderboard.slice(0, 5);
  const me = myRow(state);
  const rows = me && !top.some((p) => p.id === me.id) ? [...top, me] : top;
  return html`<section class="card">
    <div class="row" style=${{ marginBottom: '6px' }}>
      <div class="card-title grow">🏆 הטבלה</div>
      <a href="#/board" class="small">הכל ←</a>
    </div>
    <div class="lb">
      ${rows.map(
        (p) => html`<a href=${`#/player/${p.id}`} class=${`lb-row ${p.id === state.user.id ? 'me' : ''}`}>
          <span class=${`lb-rank ${medal(p.rank) ? 'medal' : ''}`}>${medal(p.rank) || p.rank}</span>
          <${Avatar} emoji=${p.emoji} />
          <span class="lb-name"><b>${p.name}</b><span>${p.team}</span></span>
          <span class="lb-pts">${p.total}</span>
        </a>`,
      )}
    </div>
  </section>`;
}

function Feed() {
  const { state } = useApp();
  const now = useNow();
  if (!state.feed.length) return null;
  return html`<section class="card">
    <div class="card-title" style=${{ marginBottom: '4px' }}>📣 עדכונים</div>
    ${state.feed.slice(0, 6).map(
      (f) => html`<div class="feed-item">
        <div class="grow">
          <b>${f.title}</b>
          ${f.body && html`<p>${f.body}</p>`}
        </div>
        <span class="tiny muted" style=${{ whiteSpace: 'nowrap' }}>${timeAgo(f.created_at, now)}</span>
      </div>`,
    )}
  </section>`;
}

function Invite() {
  const { state, toast } = useApp();
  const league = state.league;
  return html`<div class="card row">
    <span style=${{ fontSize: '28px' }}>🤝</span>
    <div class="grow">
      <b>הזמינו את הצוות</b>
      <div class="small muted">קישור הצטרפות לליגת ״${league.name}״ · <a href="#/league">קוד ${league.id}</a></div>
    </div>
    <button class="btn small ghost" onClick=${() => shareInvite(league, toast)}>שיתוף</button>
  </div>`;
}
