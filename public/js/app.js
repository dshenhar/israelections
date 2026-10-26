import { html } from 'htm/preact';
import { render } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { QUESTIONS, isOpen } from '/shared/game.js';
import { api, registerSW, resyncPush, formatTime } from './lib.js';
import { Ctx, Spinner, useApp, useNow } from './ui.js';
import { Login, Onboarding } from './pages/login.js';
import { Home } from './pages/home.js';
import { Bets } from './pages/bets.js';
import { Board, Player } from './pages/board.js';
import { Crowd } from './pages/crowd.js';
import { Me } from './pages/me.js';
import { Admin } from './pages/admin.js';
import { Rules } from './pages/rules.js';

function useHash() {
  const [hash, setHash] = useState(location.hash || '#/');
  useEffect(() => {
    const on = () => {
      setHash(location.hash || '#/');
      window.scrollTo(0, 0);
    };
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return hash;
}

function StatusPill() {
  const { state } = useApp();
  const now = useNow();
  const { settings, results } = state;
  const lock = Date.parse(settings.stage1Lock);
  const s1 = results.stage1;
  if (settings.stage2Open && s1?.final) {
    if (settings.stage2Final) return html`<span class="pill">🏁 המשחק הוכרע</span>`;
    return html`<span class="pill">🏛️ שלב ב׳</span>`;
  }
  if (s1?.final) return html`<span class="pill">🏁 תוצאות סופיות</span>`;
  if (s1) return html`<span class="pill live">${s1.label}</span>`;
  if (now >= lock) return html`<span class="pill live">ממתינים לתוצאות</span>`;
  const left = lock - now;
  if (left < 86400_000) {
    const s = Math.floor(left / 1000);
    const pad = (n) => String(n).padStart(2, '0');
    return html`<span class="pill">⏳ ${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}</span>`;
  }
  return html`<span class="pill">🔒 נעילה ${formatTime(lock)}</span>`;
}

function BottomNav({ route }) {
  const { state } = useApp();
  const now = useNow();
  const missing = QUESTIONS.some((q) => isOpen(q, state.settings, now) && state.answers[q.id] === undefined);
  const items = [
    ['', '🏠', 'בית'],
    ['bets', '🗳️', 'הימורים', missing],
    ['board', '🏆', 'טבלה'],
    ['crowd', '🧠', 'המשרד'],
    ['me', '👤', 'אני'],
  ];
  return html`<nav class="bottomnav" aria-label="ניווט">
    <div class="bottomnav-inner">
      ${items.map(
        ([id, ico, label, dot]) => html`<a href=${id === 'bets' && state.settings.stage2Open && state.results.stage1?.final ? '#/bets/2' : `#/${id}`} class=${`navitem ${route === id ? 'active' : ''}`} aria-current=${route === id ? 'page' : undefined}>
          <span class="ico">${ico}</span>${label}${dot && html`<span class="dot" aria-label="יש שאלות פתוחות"></span>`}
        </a>`,
      )}
    </div>
  </nav>`;
}

function Shell({ hash }) {
  const { state } = useApp();
  const [route, ...rest] = hash.replace(/^#\/?/, '').split('/');
  let page;
  switch (route) {
    case 'bets':
      page = html`<${Bets} stage=${Number(rest[0]) || 1} />`;
      break;
    case 'board':
      page = html`<${Board} />`;
      break;
    case 'player':
      page = html`<${Player} id=${Number(rest[0])} />`;
      break;
    case 'crowd':
      page = html`<${Crowd} />`;
      break;
    case 'me':
      page = html`<${Me} />`;
      break;
    case 'admin':
      page = html`<${Admin} />`;
      break;
    case 'rules':
      page = html`<${Rules} />`;
      break;
    default:
      page = html`<${Home} />`;
  }
  const navRoute = route === 'player' ? 'board' : route === 'admin' || route === 'rules' ? 'me' : route || '';
  return html`<div class="app">
    <header class="topbar">
      <a href="#/" class="logo" aria-label="דף הבית">
        <span class="logo-mark">61</span>
        <span class="logo-text">ליגת הבחירות</span>
      </a>
      <span class="spacer"></span>
      <${StatusPill} />
      <a href="#/me" class="avatar-btn" aria-label="האזור האישי">${state.user.emoji || '🙂'}</a>
    </header>
    <main>${page}</main>
    <${BottomNav} route=${navRoute} />
  </div>`;
}

function App() {
  const [config, setConfig] = useState(null);
  const [state, setState] = useState(null);
  const [authed, setAuthed] = useState(null);
  const [skew, setSkew] = useState(0);
  const [toastMsg, setToastMsg] = useState(null);
  const [fatal, setFatal] = useState(null);
  const toastTimer = useRef();
  const hash = useHash();

  const toast = useCallback((msg, bad = false) => {
    clearTimeout(toastTimer.current);
    setToastMsg({ msg, bad });
    toastTimer.current = setTimeout(() => setToastMsg(null), bad ? 3500 : 2000);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const s = await api('/state');
      setSkew(s.now - Date.now());
      setState(s);
      setAuthed(true);
      setFatal(null);
      return s;
    } catch (err) {
      if (err.status === 401) {
        setAuthed(false);
        setState(null);
      } else {
        setFatal(err.message);
      }
      return null;
    }
  }, []);

  useEffect(() => {
    api('/config').then(setConfig).catch(() => setConfig({ mailMode: 'pin' }));
    refresh();
    registerSW();
  }, []);

  useEffect(() => {
    if (!authed) return undefined;
    resyncPush();
    const id = setInterval(() => document.visibilityState === 'visible' && refresh(), 30_000);
    const onVis = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [authed]);

  let body;
  if (fatal && !state) {
    body = html`<div class="login"><div class="card stack center">
      <div style=${{ fontSize: '40px' }}>🛠️</div>
      <b>האפליקציה לא זמינה כרגע</b>
      <p class="small muted">${fatal}</p>
      <button class="btn" onClick=${() => { setFatal(null); refresh(); }}>לנסות שוב</button>
    </div></div>`;
  } else if (authed === null || (authed && !state) || !config) body = html`<${Spinner} />`;
  else if (!authed) body = html`<${Login} config=${config} onDone=${refresh} />`;
  else if (!state.user.name) body = html`<${Onboarding} />`;
  else body = html`<${Shell} hash=${hash} />`;

  return html`<${Ctx.Provider} value=${{ state, setState, refresh, config, skew, toast }}>
    ${body}
    ${toastMsg && html`<div class=${toastMsg.bad ? 'toast bad' : 'toast'} role="status">${toastMsg.msg}</div>`}
  <//>`;
}

render(html`<${App} />`, document.getElementById('root'));

