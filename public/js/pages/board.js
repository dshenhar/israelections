import { html } from 'htm/preact';
import { useEffect, useState } from 'preact/hooks';
import { QUESTIONS, PARTIES, PARTY, STAGES, rankPlayers, isSingleChoice } from '/shared/game.js';
import { api } from '../lib.js';
import { useApp, Avatar, medal, Notice, Spinner, MiniSlip } from '../ui.js';

const KEYS = [
  ['total', 'כללי'],
  ['s1', 'שלב א׳'],
  ['s2', 'שלב ב׳'],
];

export function Board() {
  const { state } = useApp();
  const [key, setKey] = useState('total');
  const [mode, setMode] = useState('people');
  const [team, setTeam] = useState('');
  const hasResults = !!state.results.stage1;

  const ranked = rankPlayers(state.leaderboard.map((p) => ({ ...p })), key);
  const rows = team ? ranked.filter((p) => p.team === team) : ranked;
  const n1 = QUESTIONS.filter((q) => q.stage === 1).length;

  return html`
    <div class="seg" role="tablist">
      ${KEYS.map(([k, l]) => html`<button role="tab" aria-selected=${key === k} class=${key === k ? 'on' : ''} onClick=${() => setKey(k)}>${l}</button>`)}
    </div>
    <div class="row">
      <div class="seg grow" role="tablist">
        <button role="tab" aria-selected=${mode === 'people'} class=${mode === 'people' ? 'on' : ''} onClick=${() => setMode('people')}>👤 שחקנים</button>
        <button role="tab" aria-selected=${mode === 'teams'} class=${mode === 'teams' ? 'on' : ''} onClick=${() => setMode('teams')}>👥 צוותים</button>
      </div>
      ${mode === 'people' &&
      state.teams.length > 0 &&
      html`<select class="input" style=${{ width: 'auto', padding: '8px 10px', fontSize: '14px' }} value=${team} onChange=${(e) => setTeam(e.target.value)} aria-label="סינון לפי צוות">
        <option value="">כל הצוותים</option>
        ${state.teams.map((t) => html`<option value=${t}>${t}</option>`)}
      </select>`}
    </div>

    ${!hasResults &&
    html`<${Notice} icon="⏳">הטבלה תתעורר עם פרסום המדגמים. בינתיים — מי כבר מילא את הטופס?<//>`}

    ${mode === 'teams'
      ? html`<${TeamBoard} players=${ranked} k=${key} />`
      : html`
          ${hasResults && !team && rows.length >= 3 && rows[0][key] > 0 && html`<${Podium} rows=${rows} k=${key} />`}
          <section class="card">
            <div class="lb">
              ${rows.length === 0 && html`<p class="muted center">אין עדיין משתתפים</p>`}
              ${rows.map(
                (p) => html`<a href=${`#/player/${p.id}`} class=${`lb-row ${p.id === state.user.id ? 'me' : ''}`} key=${p.id}>
                  <span class=${`lb-rank ${hasResults && medal(p.rank) ? 'medal' : ''}`}>${hasResults ? medal(p.rank) || p.rank : ''}</span>
                  <${Avatar} emoji=${p.emoji} />
                  <span class="lb-name">
                    <b>${p.name}${p.id === state.user.id ? ' (אני)' : ''}</b>
                    <span>${[p.team, !hasResults && (p.answered1 === n1 ? '✅ טופס מלא' : `${p.answered1}/${n1} שאלות`)].filter(Boolean).join(' · ')}</span>
                  </span>
                  ${hasResults && html`<span class="lb-pts">${p[key]} <small>נק׳</small></span>`}
                </a>`,
              )}
            </div>
          </section>
        `}
  `;
}

function Podium({ rows, k }) {
  const order = [rows[1], rows[0], rows[2]];
  const heights = [70, 96, 56];
  return html`<section class="card podium">
    ${order.map(
      (p, i) => html`<a class="p" href=${`#/player/${p.id}`}>
        <${Avatar} emoji=${p.emoji} />
        <span class="nm">${p.name}</span>
        <span class="small muted num">${p[k]} נק׳</span>
        <span class="block" style=${{ height: `${heights[i]}px` }}>${medal(p.rank) || p.rank}</span>
      </a>`,
    )}
  </section>`;
}

function TeamBoard({ players, k }) {
  const { state } = useApp();
  const groups = new Map();
  for (const p of players) {
    if (!p.team) continue;
    if (!groups.has(p.team)) groups.set(p.team, []);
    groups.get(p.team).push(p);
  }
  const teams = [...groups.entries()]
    .map(([name, members]) => ({
      name,
      members,
      avg: Math.round((members.reduce((s, m) => s + m[k], 0) / members.length) * 10) / 10,
      best: [...members].sort((a, b) => b[k] - a[k])[0],
    }))
    .sort((a, b) => b.avg - a.avg || b.members.length - a.members.length);
  const myTeam = state.user.team;
  if (!teams.length) return html`<${Notice} icon="👥">עוד אין צוותים. מוסיפים צוות באזור האישי.<//>`;
  return html`<section class="card">
    <p class="small muted" style=${{ marginBottom: '6px' }}>הדירוג לפי ממוצע הנקודות של חברי הצוות — כדי שגם צוות קטן יוכל לנצח</p>
    <div class="lb">
      ${teams.map(
        (t, i) => html`<div class=${`lb-row ${t.name === myTeam ? 'me' : ''}`} key=${t.name}>
          <span class=${`lb-rank ${medal(i + 1) ? 'medal' : ''}`}>${medal(i + 1) || i + 1}</span>
          <span class="avatar">👥</span>
          <span class="lb-name">
            <b>${t.name}</b>
            <span>${t.members.length} חברים · הכי טוב: ${t.best.emoji} ${t.best.name}</span>
          </span>
          <span class="lb-pts">${t.avg} <small>ממוצע</small></span>
        </div>`,
      )}
    </div>
  </section>`;
}

function answerText(q, a, knesset) {
  if (a === undefined) return html`<span class="muted">לא ענה/תה</span>`;
  if (isSingleChoice(q)) return q.options.find((o) => o.id === a)?.label || a;
  if (q.type === 'threshold') {
    return q.parties
      .filter((pid) => typeof a[pid] === 'boolean')
      .map((pid) => `${PARTY[pid].name} ${a[pid] ? '✓' : '✗'}`)
      .join(' · ');
  }
  if (q.type === 'seats') {
    return html`<span class="row wrap" style=${{ gap: '6px' }}>
      ${PARTIES.filter((p) => a[p.id] > 0).map((p) => html`<span class="row" style=${{ gap: '4px' }}><${MiniSlip} pid=${p.id} /><b class="num">${a[p.id]}</b></span>`)}
    </span>`;
  }
  if (q.type === 'coalition') {
    const coal = (knesset || []).filter((pid) => a[pid] === 'coalition').map((pid) => PARTY[pid].name);
    return coal.length ? `קואליציה: ${coal.join(', ')}` : '—';
  }
  return '';
}

export function Player({ id }) {
  const { state } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const resultsKey = state.results.stage1?.updatedAt;

  useEffect(() => {
    api(`/players/${id}?league=${encodeURIComponent(state.league.id)}`).then(setData).catch((e) => setError(e.message));
  }, [id, resultsKey, state.league.id]);

  if (error) return html`<${Notice} icon="😕">${error}<//>`;
  if (!data) return html`<${Spinner} />`;
  const p = data.player;
  const isMe = p.id === state.user.id;

  return html`
    <a href="#/board" class="btn quiet small" style=${{ justifySelf: 'start' }}>→ חזרה לטבלה</a>
    <section class="card row">
      <${Avatar} emoji=${p.emoji} lg />
      <div class="grow">
        <h2 style=${{ fontSize: '22px' }}>${p.name}</h2>
        <div class="muted small">${p.team || 'ללא צוות'}</div>
        <div class="row" style=${{ marginTop: '6px', gap: '14px' }}>
          <span><b class="display" style=${{ fontSize: '22px' }}>${p.total}</b> <span class="small muted">נק׳</span></span>
          <span class="small muted">מקום ${p.rank} · שלב א׳ ${p.s1} · שלב ב׳ ${p.s2}</span>
        </div>
      </div>
    </section>
    ${data.badges.length > 0 &&
    html`<div class="row wrap" style=${{ gap: '6px' }}>
      ${data.badges.map((b) => html`<span class="chip" title=${b.desc || ''}>${b.emoji} ${b.title}</span>`)}
    </div>`}
    ${[1, 2].map((stage) => {
      const qs = QUESTIONS.filter((q) => q.stage === stage && data.perQuestion[q.id]);
      if (!qs.length) return null;
      return html`<section class="card">
        <div class="card-title" style=${{ marginBottom: '6px' }}>${STAGES[stage].emoji} ${STAGES[stage].title}</div>
        ${qs.map((q) => {
          const s = data.perQuestion[q.id];
          return html`<div class="feed-item" key=${q.id}>
            <span style=${{ fontSize: '20px' }}>${q.emoji}</span>
            <div class="grow">
              <b>${q.title}</b>
              <div class="small" style=${{ marginTop: '2px' }}>${answerText(q, data.answers[q.id], state.knesset)}</div>
            </div>
            ${s.resolved && html`<span class=${`display ltr-num ${s.points > 0 ? '' : 'muted'}`} style=${{ fontSize: '18px', color: s.points > 0 ? 'var(--good)' : undefined }}>+${s.points}</span>`}
          </div>`;
        })}
      </section>`;
    })}
    ${!isMe &&
    !Object.keys(data.perQuestion).length &&
    html`<${Notice} icon="🔒">הימורים של אחרים נחשפים רק אחרי הנעילה.<//>`}
  `;
}
