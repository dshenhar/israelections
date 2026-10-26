import { html } from 'htm/preact';
import { useEffect, useState } from 'preact/hooks';
import {
  QUESTIONS, STAGES, PARTIES, PARTY, EDGE_PARTIES, SEATS_TOTAL, MIN_SEATS, isOpen, isLocked, lockTime, resolve,
  isSingleChoice, isAnswered, prefillSeats, maxPoints, stageLockTime,
} from '/shared/game.js';
import { api, formatWhen, formatTime } from '../lib.js';
import { useApp, useNow, Slip, MiniSlip, Notice, Progress } from '../ui.js';

export function Bets({ stage }) {
  const { state } = useApp();
  const now = useNow();
  const { settings, answers } = state;
  const qs = QUESTIONS.filter((q) => q.stage === stage);
  const answered = qs.filter((q) => isAnswered(q, answers[q.id])).length;
  const lock = stageLockTime(stage, settings);
  const locked = lock && now >= Date.parse(lock);
  const notOpen = stage === 2 && !settings.stage2Open;

  return html`
    <div class="stagetabs">
      ${[1, 2].map((s) => {
        const st = STAGES[s];
        const l = stageLockTime(s, state.settings);
        const sub =
          s === 2 && !settings.stage2Open
            ? 'ייפתח אחרי התוצאות'
            : l && now >= Date.parse(l)
              ? '🔒 נעול'
              : l
                ? `נועל ${formatWhen(l)}`
                : 'פתוח להימורים';
        return html`<a href=${`#/bets/${s}`} class=${`stagetab ${s === stage ? 'on' : ''}`}>
          <b>${st.emoji} ${st.title}</b><span>${sub}</span>
        </a>`;
      })}
    </div>

    ${notOpen
      ? html`<${Notice} icon="🏛️">
          <b>שלב ב׳ ייפתח אחרי פרסום התוצאות הסופיות.</b> מי יקבל מנדט, מי ישב בקואליציה ומתי תושבע הממשלה. נשלח התראה כשהשלב נפתח. בינתיים — הצצה לשאלות:
        <//>`
      : locked
        ? html`<${Notice} icon="🔒">ההימורים נעולים — הנה מה שבחרת. התוצאות יתעדכנו כאן.<//>`
        : html`<div class="card flat stack" style=${{ gap: '8px' }}>
            <div class="row">
              <b class="grow">מילאת ${answered} מתוך ${qs.length}</b>
              <span class="small muted">${lock ? `נועל ${formatWhen(lock)}` : 'כל תשובה נשמרת מיד'}</span>
            </div>
            <${Progress} value=${answered} max=${qs.length} light />
          </div>`}

    ${qs.map((q) => html`<${QuestionCard} key=${q.id} q=${q} preview=${notOpen} />`)}

    ${!notOpen && !locked && answered === qs.length
      ? html`<${Notice} icon="🎉" tone="good">הטופס מלא! אפשר לשנות כל תשובה עד הנעילה.<//>`
      : null}
  `;
}

function pointsLabel(q, results) {
  if (q.type === 'threshold') return `${q.pointsEach} נק׳ × ${q.parties.length}`;
  if (q.type === 'seats') return `עד ${maxPoints(q, results)} נק׳`;
  if (q.type === 'coalition') return `${q.pointsEach} נק׳ למפלגה`;
  return `${q.points} נק׳`;
}

function optionLabel(q, id) {
  return q.options.find((o) => o.id === id)?.label || PARTY[id]?.name || id;
}

function QuestionCard({ q, preview }) {
  const { state, setState, refresh, toast } = useApp();
  const now = useNow();
  const { settings, results } = state;
  const answer = state.answers[q.id];
  const score = state.myScore.perQuestion[q.id];
  const open = !preview && isOpen(q, settings, now);
  const locked = isLocked(q, settings, now);
  const truth = resolve(q, results);
  const crowd = state.crowd[q.id];
  const ownLock = q.lockKey && lockTime(q, settings) !== settings.stage1Lock ? lockTime(q, settings) : null;

  async function save(next) {
    const prev = state.answers;
    setState((s) => ({ ...s, answers: { ...s.answers, [q.id]: next } }));
    try {
      await api(`/predictions/${q.id}`, { method: 'PUT', body: { answer: next } });
      toast('נשמר ✓');
      refresh();
      return true;
    } catch (err) {
      setState((s) => ({ ...s, answers: prev }));
      toast(err.message, true);
      refresh();
      return false;
    }
  }

  const props = { q, answer, open, truth, crowd, save, locked };
  let body;
  if (q.type === 'pick' && q.partyPick) body = html`<${PartyPick} ...${props} />`;
  else if (isSingleChoice(q)) body = html`<${OptionList} ...${props} />`;
  else if (q.type === 'threshold') body = html`<${ThresholdInput} ...${props} />`;
  else if (q.type === 'seats') body = html`<${SeatsInput} ...${props} />`;
  else if (q.type === 'coalition') body = html`<${CoalitionInput} ...${props} />`;

  return html`<section class="q-card" id=${`q-${q.id}`}>
    <div class="q-head">
      <span class="q-emoji" aria-hidden="true">${q.emoji}</span>
      <div class="grow">
        <h3>${q.title}</h3>
        <p>${q.desc}</p>
      </div>
      <span class="pts">${pointsLabel(q, results)}</span>
    </div>
    ${q.context && html`<div class="q-context">💡 ${q.context}</div>`}
    ${ownLock && !locked && html`<div class="q-context" style=${{ color: 'var(--accent)', fontWeight: 700 }}>⏰ השאלה הזו ננעלת ב-${formatTime(ownLock)}</div>`}
    <div class="q-body">${body}</div>
    <${CardFoot} q=${q} answer=${answer} score=${score} truth=${truth} open=${open} locked=${locked} preview=${preview} />
  </section>`;
}

function CardFoot({ q, answer, score, truth, open, locked, preview }) {
  const { state } = useApp();
  const provisional = q.stage === 1 && state.results.stage1 && !state.results.stage1.final;
  const tag = provisional ? html`<span class="tiny">(זמני · ${state.results.stage1.label})</span>` : null;
  if (preview) return html`<div class="q-foot">ייפתח בשלב ב׳</div>`;
  if (score?.resolved && answer !== undefined) {
    let text;
    if (isSingleChoice(q)) {
      text = score.correct
        ? html`✅ צדקת!${score.bonus ? html` 🐺 בונוס זאב בודד` : ''}`
        : html`❌ התשובה: ${truth.map((t) => optionLabel(q, t)).join(' / ')}`;
    } else if (q.type === 'seats') {
      text = html`🎯 ${score.exact} מדויקות · ${score.near} במרחק מנדט`;
    } else {
      const n = q.type === 'threshold' ? q.parties.length : Object.keys(truth).length;
      text = html`${score.hits === n ? '✅' : '☑️'} ${score.hits} מתוך ${n} נכונות`;
    }
    return html`<div class=${`q-foot ${score.points > 0 ? 'good' : 'bad'}`}>
      <span>${text} ${tag}</span><span class="earn">+${score.points}</span>
    </div>`;
  }
  if (score?.resolved) return html`<div class="q-foot bad"><span>לא ענית על השאלה ${tag}</span><span class="earn">0</span></div>`;
  if (locked) return html`<div class="q-foot">🔒 ${answer !== undefined ? 'נעול · מחכים לתוצאה' : 'נעול · לא ענית'}</div>`;
  if (open && answer !== undefined) {
    if (q.type === 'threshold' && !isAnswered(q, answer)) {
      const left = q.parties.filter((p) => typeof answer[p] !== 'boolean').length;
      return html`<div class="q-foot">✓ נשמר · חסרות עוד ${left} מפלגות</div>`;
    }
    return html`<div class="q-foot">✓ נשמר · אפשר לשנות עד הנעילה</div>`;
  }
  return html`<div class="q-foot">○ עוד לא ענית</div>`;
}

const pct = (n, of) => (of ? Math.round((n / of) * 100) : 0);

// Poll average as shown on a slip, e.g. "סקרים: 8" or "מתחת לסף".
const slipPoll = (p) => (p.poll >= MIN_SEATS ? `סקרים: ${p.poll}` : 'מתחת לסף');

function pollDetail(q, p) {
  const avg =
    p.poll >= MIN_SEATS
      ? html`ממוצע הסקרים של <b>${p.name}</b>: <b class="num">${p.poll}</b> מנדטים`
      : p.poll > 0
        ? html`<b>${p.name}</b> מתחת לאחוז החסימה ברוב הסקרים (<b class="num">${p.poll}</b> מנדטים בממוצע)`
        : html`<b>${p.name}</b> מתחת לאחוז החסימה בכל הסקרים (0 מנדטים בממוצע)`;
  if (q.id === 'surprise') return html`${avg}. כל מנדט מעל זה נספר כהפתעה.`;
  if (q.id === 'flop') {
    return p.poll > 0 ? html`${avg}. כל מנדט מתחת לזה נספר כאכזבה.` : html`${avg} — אין לה מאיפה לרדת.`;
  }
  return avg;
}

function PartyPick({ q, answer, open, truth, crowd, save }) {
  const picked = answer && PARTY[answer];
  return html`<div class="slips">
      ${q.options.map((o) => {
        const selected = answer === o.id;
        const state = truth ? (truth.includes(o.id) ? 'correct' : selected ? 'wrong' : null) : null;
        return html`<${Slip}
          key=${o.id}
          pid=${o.id}
          selected=${selected}
          state=${state}
          dim=${!open && !selected && !state}
          disabled=${!open}
          poll=${slipPoll(PARTY[o.id])}
          share=${crowd ? pct(crowd.counts[o.id], crowd.n) : undefined}
          onClick=${() => open && !selected && save(o.id)}
        />`;
      })}
    </div>
    ${picked && html`<div class="q-context" style=${{ margin: '12px 0 0' }} aria-live="polite">📊 ${pollDetail(q, picked)}</div>`}`;
}

function OptionList({ q, answer, open, truth, crowd, save }) {
  return html`
    ${q.history && q.id === 'turnout' && html`<${TurnoutHistory} data=${q.history} />`}
    ${q.history && q.id !== 'turnout' && html`<${Timeline} data=${q.history} />`}
    <div class="opts" role="radiogroup" aria-label=${q.title}>
      ${q.options.map((o) => {
        const selected = answer === o.id;
        const cls = ['opt', selected && 'selected', truth && truth.includes(o.id) && 'correct', truth && selected && !truth.includes(o.id) && 'wrong'];
        const share = crowd ? pct(crowd.counts[o.id], crowd.n) : null;
        return html`<button
          type="button"
          role="radio"
          aria-checked=${selected}
          class=${cls.filter(Boolean).join(' ')}
          disabled=${!open}
          onClick=${() => open && !selected && save(o.id)}
        >
          ${share !== null && html`<span class="bar" style=${{ width: `${share}%` }}></span>`}
          <span class="radio">${selected || (truth && truth.includes(o.id)) ? (truth && selected && !truth.includes(o.id) ? '✗' : '✓') : ''}</span>
          <span class="lbl">${o.label}</span>
          ${o.hint && html`<span class="hint">${o.hint}</span>`}
          ${share !== null && html`<span class="share">${share}%</span>`}
        </button>`;
      })}
    </div>
  `;
}

function TurnoutHistory({ data }) {
  const min = 64;
  const max = 74;
  return html`<div class="label" style=${{ marginBottom: '6px' }}>אחוזי ההצבעה בבחירות הקודמות</div>
    <div class="hist" role="img" aria-label=${data.map((d) => `${d.label}: ${d.value}%`).join(', ')}>
      ${data.map(
        (d, i) => html`<div class=${`col ${i === data.length - 1 ? 'last' : ''}`}>
          <span class="v">${d.value}%</span>
          <span class="bar" style=${{ height: `${Math.round(12 + ((d.value - min) / (max - min)) * 70)}px` }}></span>
          <span class="l">${d.label}</span>
        </div>`,
      )}
    </div>`;
}

function Timeline({ data }) {
  return html`<div class="label" style=${{ marginBottom: '6px' }}>כמה זמן לקח בפעמים הקודמות</div>
    <div class="timeline">
      ${data.map((d) => html`<div class="t"><b>${d.label}</b><span>${d.text}</span></div>`)}
    </div>`;
}

function ThresholdInput({ q, answer = {}, open, truth, crowd, save }) {
  const { state } = useApp();
  const actual = state.results.stage1?.seats;
  return html`<div>
    ${q.parties.map((pid) => {
      const p = PARTY[pid];
      const v = answer[pid];
      const t = truth?.[pid];
      const passPct = crowd?.perParty?.[pid] ? pct(crowd.pass[pid], crowd.perParty[pid]) : null;
      return html`<div class="prow" key=${pid}>
        <${MiniSlip} pid=${pid} />
        <div class="pname">
          <b>${p.name}</b>
          <span>
            ${truth !== undefined
              ? html`${t ? `✅ עברה · ${actual[pid]} מנדטים` : '⛔ לא עברה'}${typeof v === 'boolean' ? (v === t ? ' · צדקת' : ' · טעית') : ''}`
              : passPct !== null
                ? `${passPct}% מהמשרד חושבים שתעבור`
                : `סקרים: ${p.poll >= MIN_SEATS ? `${p.poll} מנדטים` : 'מתחת לסף'}`}
          </span>
        </div>
        <div class="seg tone" role="radiogroup" aria-label=${p.name}>
          <button type="button" class=${v === true ? 'on yes' : ''} disabled=${!open} aria-pressed=${v === true}
            onClick=${() => open && v !== true && save({ ...answer, [pid]: true })}>עוברת</button>
          <button type="button" class=${v === false ? 'on no' : ''} disabled=${!open} aria-pressed=${v === false}
            onClick=${() => open && v !== false && save({ ...answer, [pid]: false })}>לא עוברת</button>
        </div>
      </div>`;
    })}
  </div>`;
}

function seatBounds(pid, threshold) {
  const t = threshold?.[pid];
  if (t === false) return { fixedZero: true };
  if (t === true) return { minPass: true };
  return {};
}

function SeatsInput({ q, answer, open, truth, crowd, save }) {
  const { state } = useApp();
  const threshold = state.answers.threshold;
  const [draft, setDraft] = useState(() => answer || prefillSeats(threshold));
  const [busy, setBusy] = useState(false);
  // Polling returns fresh objects every time, so react to content changes only.
  const answerKey = answer ? JSON.stringify(answer) : '';
  const thresholdKey = threshold ? JSON.stringify(threshold) : '';
  useEffect(() => {
    if (answer) setDraft(answer);
  }, [answerKey]);
  useEffect(() => {
    if (thresholdKey) syncWithThreshold();
  }, [thresholdKey]);

  const sum = Object.values(draft).reduce((a, b) => a + b, 0);
  const dirty = !answer || PARTIES.some((p) => answer[p.id] !== draft[p.id]);
  const inconsistent = EDGE_PARTIES.some((pid) => typeof threshold?.[pid] === 'boolean' && threshold[pid] !== draft[pid] > 0);

  function step(pid, dir) {
    setDraft((d) => {
      const v = d[pid];
      const b = seatBounds(pid, threshold);
      let n = v;
      if (dir > 0) n = v === 0 ? MIN_SEATS : Math.min(60, v + 1);
      else n = v === MIN_SEATS ? (b.minPass ? MIN_SEATS : 0) : Math.max(0, v - 1);
      if (b.fixedZero) n = 0;
      return { ...d, [pid]: n };
    });
  }

  function resetToPolls() {
    setDraft(prefillSeats(threshold));
  }

  // Bring the draft in line with the threshold answers (e.g. after changing them).
  function syncWithThreshold() {
    setDraft((d) => {
      const next = { ...d };
      for (const pid of EDGE_PARTIES) {
        if (threshold?.[pid] === false) next[pid] = 0;
        if (threshold?.[pid] === true && next[pid] === 0) next[pid] = MIN_SEATS;
      }
      return next;
    });
  }

  async function submit() {
    setBusy(true);
    await save(draft);
    setBusy(false);
  }

  // Shown twice: pinned above the table while filling it in, and again after the last party.
  const sumBar = (where) => html`<div class=${`seat-sum ${where} ${sum === SEATS_TOTAL ? 'ok' : ''}`}>
    <span class="count num">${sum}/120</span>
    <span class="msg">
      ${sum === SEATS_TOTAL
        ? dirty
          ? 'מושלם! אפשר לשמור'
          : 'נשמר ✓'
        : sum < SEATS_TOTAL
          ? `נותרו ${SEATS_TOTAL - sum} מנדטים לחלק`
          : `${sum - SEATS_TOTAL} מנדטים יותר מדי`}
    </span>
    <button type="button" class="btn" disabled=${sum !== SEATS_TOTAL || !dirty || busy} onClick=${submit}>${busy ? '…' : 'שמירה'}</button>
  </div>`;

  if (!open) {
    const mine = answer;
    return html`<div>
      ${!mine && html`<p class="muted small">לא מילאת את טבלת המנדטים.</p>`}
      <table class="crowd-table">
        <thead>
          <tr>
            <th>מפלגה</th>
            <th>שלך</th>
            ${crowd && html`<th>המשרד</th>`}
            <th>סקרים</th>
            ${truth && html`<th>בפועל</th>`}
            ${truth && mine && html`<th></th>`}
          </tr>
        </thead>
        <tbody>
          ${PARTIES.map((p) => {
            const d = truth && mine ? Math.abs(mine[p.id] - truth[p.id]) : null;
            return html`<tr key=${p.id}>
              <td><span class="row" style=${{ gap: '8px' }}><${MiniSlip} pid=${p.id} /> ${p.name}</span></td>
              <td><b>${mine ? mine[p.id] : '—'}</b></td>
              ${crowd && html`<td>${crowd.avg[p.id]}</td>`}
              <td class="muted">${p.poll}</td>
              ${truth && html`<td><b>${truth[p.id]}</b></td>`}
              ${truth && mine && html`<td><span class=${`diff ${d === 0 ? 'ex' : d === 1 ? 'nr' : 'ms'}`}>${d === 0 ? '+2' : d === 1 ? '+1' : '0'}</span></td>`}
            </tr>`;
          })}
        </tbody>
      </table>
    </div>`;
  }

  return html`<div>
    ${!answer && html`<${Notice} icon="✨">מילאנו לך את ממוצע הסקרים כנקודת פתיחה — עכשיו תורך לשנות.<//>`}
    ${inconsistent &&
    html`<div style=${{ marginTop: '8px' }}>
      <${Notice} icon="⚠️" tone="warn">
        הטבלה לא תואמת את התשובות שלך באחוז החסימה.
        <button type="button" class="btn quiet small" onClick=${syncWithThreshold}>לתקן אוטומטית</button>
      <//>
    </div>`}
    <div style=${{ marginTop: '10px' }}>
      ${sumBar('top')}
      ${PARTIES.map((p) => {
        const v = draft[p.id];
        const b = seatBounds(p.id, threshold);
        return html`<div class=${`prow ${v === 0 ? 'zero' : ''}`} key=${p.id}>
          <${MiniSlip} pid=${p.id} />
          <div class="pname">
            <b>${p.name}</b>
            <span>${b.fixedZero ? 'לא עוברת לפי הניחוש שלך' : `סקרים: ${p.poll >= MIN_SEATS ? p.poll : 'מתחת לסף'}`}</span>
          </div>
          <div class="stepper">
            <button type="button" aria-label=${`פחות ל${p.name}`} disabled=${b.fixedZero || v === 0 || (b.minPass && v === MIN_SEATS)} onClick=${() => step(p.id, -1)}>−</button>
            <span class="v" aria-live="polite">${v}</span>
            <button type="button" aria-label=${`עוד ל${p.name}`} disabled=${b.fixedZero} onClick=${() => step(p.id, 1)}>+</button>
          </div>
        </div>`;
      })}
    </div>
    <button type="button" class="btn quiet small" onClick=${resetToPolls}>↺ חזרה לממוצע הסקרים</button>
    ${sumBar('bottom')}
  </div>`;
}

function CoalitionInput({ q, answer = {}, open, truth, crowd, save }) {
  const { state } = useApp();
  const parties = state.knesset;
  const seats = state.results.stage1?.seats || {};
  if (!parties.length) {
    return html`<p class="muted small">רשימת המפלגות תיקבע לפי התוצאות הסופיות של הבחירות.</p>`;
  }
  const coalSeats = parties.filter((pid) => answer[pid] === 'coalition').reduce((s, pid) => s + seats[pid], 0);
  return html`<div>
    <div class=${`notice ${coalSeats >= 61 ? 'good' : ''}`} style=${{ marginBottom: '6px' }}>
      <span class="i">🧮</span>
      <div class="grow">הקואליציה שלך: <b class="num">${coalSeats}</b> מנדטים ${coalSeats >= 61 ? '— יש רוב ✓' : '— עדיין אין 61'}</div>
    </div>
    ${parties.map((pid) => {
      const p = PARTY[pid];
      const v = answer[pid];
      const t = truth?.[pid];
      const coalPct = crowd?.perParty?.[pid] ? pct(crowd.coalition[pid], crowd.perParty[pid]) : null;
      return html`<div class="prow" key=${pid}>
        <${MiniSlip} pid=${pid} />
        <div class="pname">
          <b>${p.name}</b>
          <span>
            ${seats[pid]} מנדטים
            ${t ? ` · בפועל: ${t === 'coalition' ? 'קואליציה' : 'אופוזיציה'}${v ? (v === t ? ' ✓' : ' ✗') : ''}` : coalPct !== null ? ` · ${coalPct}% אומרים קואליציה` : ''}
          </span>
        </div>
        <div class="seg tone" role="radiogroup" aria-label=${p.name}>
          <button type="button" class=${v === 'coalition' ? 'on coal' : ''} disabled=${!open} aria-pressed=${v === 'coalition'}
            onClick=${() => open && v !== 'coalition' && save({ ...answer, [pid]: 'coalition' })}>קואליציה</button>
          <button type="button" class=${v === 'opposition' ? 'on opp' : ''} disabled=${!open} aria-pressed=${v === 'opposition'}
            onClick=${() => open && v !== 'opposition' && save({ ...answer, [pid]: 'opposition' })}>אופוזיציה</button>
        </div>
      </div>`;
    })}
  </div>`;
}
