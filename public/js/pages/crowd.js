import { html } from 'htm/preact';
import { QUESTIONS, PARTIES, PARTY, STAGES, isSingleChoice, resolve } from '/shared/game.js';
import { formatWhen } from '../lib.js';
import { useApp, Notice, MiniSlip } from '../ui.js';

const pct = (n, of) => (of ? Math.round((n / of) * 100) : 0);

export function Crowd() {
  const { state } = useApp();
  const visible = QUESTIONS.filter((q) => state.crowd[q.id]);

  if (!visible.length) {
    return html`
      <section class="hero">
        <h1>🧠 מה המשרד חושב?</h1>
        <p class="sub">ההימורים של כולם נחשפים ברגע הנעילה — כדי שאף אחד לא יעתיק.</p>
        <p style=${{ marginTop: '14px', fontWeight: 700 }}>🔓 נחשף ${formatWhen(state.settings.stage1Lock)}</p>
      </section>
      <${Notice} icon="👥">כבר הימרו ${state.participants.total} אנשים · ${state.participants.complete1} מילאו טופס מלא<//>
    `;
  }

  return html`
    <section class="hero">
      <h1>🧠 חכמת ההמונים</h1>
      <p class="sub">כך הימר המשרד — ומי צדק יותר: הסקרים או אנחנו?</p>
    </section>
    ${[1, 2].map((stage) => {
      const qs = visible.filter((q) => q.stage === stage);
      if (!qs.length) return null;
      return html`<div class="section-title">${STAGES[stage].emoji} ${STAGES[stage].title}</div>
        ${qs.map((q) => html`<${CrowdCard} key=${q.id} q=${q} />`)}`;
    })}
  `;
}

function CrowdCard({ q }) {
  const { state } = useApp();
  const c = state.crowd[q.id];
  const truth = resolve(q, state.results);
  let body;
  if (isSingleChoice(q)) {
    const opts = [...q.options].filter((o) => c.counts[o.id] > 0 || !q.partyPick).sort((a, b) => (q.partyPick ? c.counts[b.id] - c.counts[a.id] : 0));
    body = html`<div class="opts">
      ${opts.map((o) => {
        const share = pct(c.counts[o.id], c.n);
        const right = truth?.includes(o.id);
        return html`<div class=${`opt ${right ? 'correct' : ''}`} key=${o.id}>
          <span class="bar" style=${{ width: `${share}%` }}></span>
          ${q.partyPick ? html`<span style=${{ zIndex: 1 }}><${MiniSlip} pid=${o.id} /></span>` : html`<span class="radio">${right ? '✓' : ''}</span>`}
          <span class="lbl">${o.label}</span>
          <span class="share">${share}% · ${c.counts[o.id]}</span>
        </div>`;
      })}
    </div>`;
  } else if (q.type === 'threshold') {
    body = q.parties.map((pid) => {
      const share = pct(c.pass[pid], c.perParty[pid]);
      return html`<div class="prow" key=${pid}>
        <${MiniSlip} pid=${pid} />
        <div class="pname">
          <b>${PARTY[pid].name}</b>
          <span>${share}% חושבים שתעבור${truth ? ` · בפועל: ${truth[pid] ? 'עברה ✅' : 'לא עברה ⛔'}` : ''}</span>
        </div>
        <div class="meter" style=${{ width: '110px' }}>
          <i style=${{ width: `${share}%`, background: 'var(--good)' }}></i>
          <i style=${{ width: `${100 - share}%`, background: 'var(--bad)' }}></i>
        </div>
      </div>`;
    });
  } else if (q.type === 'seats') {
    body = html`<${SeatsCrowd} c=${c} truth=${truth} />`;
  } else if (q.type === 'coalition') {
    body = state.knesset.map((pid) => {
      const share = pct(c.coalition[pid], c.perParty[pid]);
      return html`<div class="prow" key=${pid}>
        <${MiniSlip} pid=${pid} />
        <div class="pname">
          <b>${PARTY[pid].name}</b>
          <span>${share}% קואליציה${truth?.[pid] ? ` · בפועל: ${truth[pid] === 'coalition' ? 'קואליציה' : 'אופוזיציה'}` : ''}</span>
        </div>
        <div class="meter" style=${{ width: '110px' }}>
          <i style=${{ width: `${share}%`, background: 'var(--blue)' }}></i>
          <i style=${{ width: `${100 - share}%`, background: 'var(--ink)' }}></i>
        </div>
      </div>`;
    });
  }
  return html`<section class="card">
    <div class="row" style=${{ marginBottom: '10px' }}>
      <span style=${{ fontSize: '22px' }}>${q.emoji}</span>
      <b class="grow" style=${{ fontSize: '16px' }}>${q.title}</b>
      <span class="tiny muted">${c.n} הימורים</span>
    </div>
    ${body}
  </section>`;
}

function SeatsCrowd({ c, truth }) {
  let verdict = null;
  if (truth && c.n) {
    const err = (get) => PARTIES.reduce((s, p) => s + Math.abs(get(p) - truth[p.id]), 0);
    const office = Math.round(err((p) => c.avg[p.id]) * 10) / 10;
    const polls = Math.round(err((p) => p.poll) * 10) / 10;
    verdict =
      office < polls
        ? html`<${Notice} icon="🎉" tone="good">המשרד ניצח את הסקרים! סטייה כוללת של ${office} מנדטים מול ${polls} בסקרים<//>`
        : html`<${Notice} icon="📊">הסקרים ניצחו הפעם: סטייה של ${polls} מנדטים מול ${office} של המשרד<//>`;
  }
  return html`
    <table class="crowd-table">
      <thead>
        <tr><th>מפלגה</th><th>המשרד</th><th>סקרים</th>${truth && html`<th>בפועל</th>`}</tr>
      </thead>
      <tbody>
        ${PARTIES.map(
          (p) => html`<tr key=${p.id}>
            <td><span class="row" style=${{ gap: '8px' }}><${MiniSlip} pid=${p.id} /> ${p.name}</span></td>
            <td><b>${c.avg[p.id]}</b></td>
            <td class="muted">${p.poll}</td>
            ${truth && html`<td><b>${truth[p.id]}</b></td>`}
          </tr>`,
        )}
      </tbody>
    </table>
    ${verdict && html`<div style=${{ marginTop: '10px' }}>${verdict}</div>`}
  `;
}
