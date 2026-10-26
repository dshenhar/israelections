// Game definition shared by the server and the browser: parties, questions,
// answer validation and scoring. Pure functions only — no I/O here.

export const POLL_SOURCE = 'ממוצע הסקרים האחרונים של כאן 11, חדשות 12 וחדשות 13 (23.10)';

// poll = average of the final Kan / Channel 12 / Channel 13 polls (23.10.2026),
// counting a party below the threshold as 0 seats.
export const PARTIES = [
  { id: 'yashar', name: 'ישר!', leader: 'גדי איזנקוט', letters: 'דרך', bloc: 'change', poll: 22.3, color: '#f76707' },
  { id: 'likud', name: 'הליכוד', leader: 'בנימין נתניהו', letters: 'מחל', bloc: 'right', poll: 20.0, color: '#1e3a8a' },
  { id: 'together', name: 'ביחד', leader: 'נפתלי בנט', letters: 'רק', bloc: 'change', poll: 14.3, color: '#0d9488' },
  { id: 'democrats', name: 'הדמוקרטים', leader: 'יאיר גולן', letters: 'אמת', bloc: 'change', poll: 9.3, color: '#e11d48' },
  { id: 'joint', name: 'הרשימה המשותפת', leader: '', letters: 'ודם', bloc: 'arab', poll: 9.0, color: '#16a34a' },
  { id: 'yb', name: 'ישראל ביתנו', leader: 'אביגדור ליברמן', letters: 'ל', bloc: 'change', poll: 8.0, color: '#7c3aed' },
  { id: 'otzma', name: 'עוצמה יהודית', leader: 'איתמר בן גביר', letters: 'ב', bloc: 'right', poll: 8.0, color: '#b91c1c' },
  { id: 'utj', name: 'יהדות התורה', leader: '', letters: 'ג', bloc: 'right', poll: 7.7, color: '#1f2937' },
  { id: 'shas', name: 'ש״ס', leader: 'אריה דרעי', letters: 'שס', bloc: 'right', poll: 7.3, color: '#2563eb' },
  { id: 'rzp', name: 'הציונות הדתית', leader: 'בצלאל סמוטריץ׳', letters: 'ט', bloc: 'right', poll: 7.0, color: '#ca8a04' },
  { id: 'raam', name: 'רע״ם', leader: 'מנסור עבאס', letters: 'עם', bloc: 'arab', poll: 5.7, color: '#65a30d' },
  { id: 'reservists', name: 'המילואימניקים', leader: 'יועז הנדל', letters: 'די', bloc: 'none', poll: 1.3, color: '#64748b' },
  { id: 'amcha', name: 'עמך ישראל', leader: 'עופר וינטר', letters: 'ך', bloc: 'none', poll: 0, color: '#0891b2' },
];

export const PARTY = Object.fromEntries(PARTIES.map((p) => [p.id, p]));

export const EDGE_PARTIES = ['rzp', 'raam', 'reservists', 'amcha'];

export const BLOCS = {
  right: { name: 'גוש נתניהו', parties: ['likud', 'shas', 'utj', 'otzma', 'rzp'] },
  change: { name: 'גוש איזנקוט-בנט', parties: ['yashar', 'together', 'democrats', 'yb'] },
};

export const TURNOUT_HISTORY = [
  { label: '2015', value: 72.3 },
  { label: 'אפר׳ 2019', value: 68.5 },
  { label: 'ספט׳ 2019', value: 69.8 },
  { label: '2020', value: 71.5 },
  { label: '2021', value: 67.4 },
  { label: '2022', value: 70.6 },
];

export const FORMATION_HISTORY = [
  { label: '2015', text: 'הושבעה אחרי 58 יום' },
  { label: 'אפר׳ 2019', text: 'לא קמה ממשלה — בחירות חוזרות' },
  { label: 'ספט׳ 2019', text: 'לא קמה ממשלה — בחירות חוזרות' },
  { label: '2020', text: 'הושבעה אחרי 76 יום' },
  { label: '2021', text: 'הושבעה אחרי 82 יום' },
  { label: '2022', text: 'הושבעה אחרי 58 יום (29.12)' },
];

export const SEATS_TOTAL = 120;
export const MIN_SEATS = 4; // 3.25% threshold
export const LONE_WOLF_SHARE = 0.2;
export const LONE_WOLF_MIN_VOTERS = 5;

const blocRanges = [
  { id: 'upto49', label: 'עד 49', min: 0, max: 49 },
  { id: '50-53', label: '50 עד 53', min: 50, max: 53 },
  { id: '54-57', label: '54 עד 57', min: 54, max: 57 },
  { id: '58-60', label: '58 עד 60', min: 58, max: 60 },
  { id: '61plus', label: '61 ומעלה', min: 61, max: 120, hint: 'רוב!' },
];

const partyOptions = PARTIES.map((p) => ({ id: p.id, label: p.name }));
const candidates = [
  { id: 'netanyahu', label: 'בנימין נתניהו' },
  { id: 'eisenkot', label: 'גדי איזנקוט' },
  { id: 'bennett', label: 'נפתלי בנט' },
  { id: 'other', label: 'מישהו אחר' },
];
const noGov = { id: 'nogov', label: 'לא תקום ממשלה — בחירות חוזרות' };
const yesNo = [
  { id: 'yes', label: 'כן' },
  { id: 'no', label: 'לא' },
];

// type:
//   pick      – choose one option (parties shown as ballot slips when options are parties)
//   range     – choose one bucket
//   threshold – pass / fail for each edge party
//   seats     – full 120-seat table
//   coalition – coalition / opposition for each party that entered the Knesset
export const QUESTIONS = [
  {
    id: 'biggest', stage: 1, type: 'pick', partyPick: true, emoji: '🏆', points: 12,
    title: 'המפלגה הגדולה',
    desc: 'איזו מפלגה תקבל הכי הרבה מנדטים?',
    options: partyOptions,
  },
  {
    id: 'threshold', stage: 1, type: 'threshold', emoji: '🚧', pointsEach: 3,
    title: 'אחוז החסימה',
    desc: '4 מפלגות על הסף. מי עוברת את ה-3.25% (4 מנדטים) ומי נשארת בחוץ?',
    parties: EDGE_PARTIES,
  },
  {
    id: 'seats', stage: 1, type: 'seats', emoji: '🪑', exact: 2, near: 1,
    title: 'מנדטים לכל מפלגה',
    desc: 'חלקו 120 מנדטים. פגיעה מדויקת = 2 נק׳, פספוס במנדט אחד = נק׳ אחת.',
  },
  {
    id: 'rightBloc', stage: 1, type: 'range', emoji: '🔵', points: 10,
    title: 'גוש נתניהו',
    desc: 'כמה מנדטים יקבלו יחד הליכוד, ש״ס, יהדות התורה, עוצמה יהודית והציונות הדתית?',
    context: 'בסקרים האחרונים: 50 בכאן, ב-12 וב-13 · 62 בערוץ 14',
    options: blocRanges,
  },
  {
    id: 'changeBloc', stage: 1, type: 'range', emoji: '🟠', points: 8,
    title: 'גוש איזנקוט-בנט',
    desc: 'כמה מנדטים יקבלו יחד ישר!, ביחד, הדמוקרטים וישראל ביתנו?',
    context: 'בסקרים האחרונים: בין 52 ל-56 בכאן, ב-12 וב-13 · 44 בערוץ 14',
    options: blocRanges,
  },
  {
    id: 'surprise', stage: 1, type: 'pick', partyPick: true, emoji: '💥', points: 12,
    title: 'הפתעת הבחירות',
    desc: 'איזו מפלגה תקבל הכי הרבה מנדטים מעל ממוצע הסקרים שלה?',
    context: 'למשל: סקרים 8, בפועל 11 ← הפתעה של +3',
    options: partyOptions,
  },
  {
    id: 'flop', stage: 1, type: 'pick', partyPick: true, emoji: '📉', points: 12,
    title: 'אכזבת הבחירות',
    desc: 'איזו מפלגה תקבל הכי הרבה מנדטים מתחת לממוצע הסקרים שלה?',
    context: 'למשל: סקרים 20, בפועל 16 ← אכזבה של 4−',
    options: partyOptions,
  },
  {
    id: 'turnout', stage: 1, type: 'range', emoji: '🗳️', points: 8, lockKey: 'turnoutLock',
    title: 'אחוז ההצבעה',
    desc: 'כמה מבעלי זכות הבחירה יצביעו? השאלה ננעלת מוקדם — לפני דיווח ההצבעה הראשון של ועדת הבחירות.',
    history: TURNOUT_HISTORY,
    options: [
      { id: 'lt68', label: 'פחות מ-68%', min: 0, max: 68 },
      { id: '68-70', label: 'בין 68 ל-70%', min: 68, max: 70 },
      { id: '70-72', label: 'בין 70 ל-72%', min: 70, max: 72 },
      { id: '72-74', label: 'בין 72 ל-74%', min: 72, max: 74 },
      { id: '74plus', label: '74% ומעלה', min: 74, max: 101 },
    ],
  },
  {
    id: 'mandate', stage: 2, type: 'pick', emoji: '🎤', points: 15,
    title: 'המנדט הראשון',
    desc: 'למי ייתן הנשיא הרצוג את המנדט הראשון להרכבת הממשלה?',
    options: candidates,
  },
  {
    id: 'recommenders', stage: 2, type: 'range', emoji: '✋', points: 8,
    title: 'כמה ימליצו עליו',
    desc: 'כמה חברי כנסת ימליצו בהתייעצויות אצל הנשיא על מי שיקבל את המנדט?',
    context: 'ב-2022 נתניהו קיבל 64 ממליצים · ב-2021 קיבל 52',
    options: [
      { id: 'upto54', label: 'עד 54', min: 0, max: 54 },
      { id: '55-60', label: '55 עד 60', min: 55, max: 60 },
      { id: '61-64', label: '61 עד 64', min: 61, max: 64 },
      { id: '65plus', label: '65 ומעלה', min: 65, max: 120 },
    ],
  },
  {
    id: 'coalition', stage: 2, type: 'coalition', emoji: '🤝', pointsEach: 2,
    title: 'קואליציה או אופוזיציה',
    desc: 'לכל מפלגה שנכנסה לכנסת: איפה תשב כשהממשלה תושבע?',
  },
  {
    id: 'pm', stage: 2, type: 'pick', emoji: '👑', points: 25,
    title: 'ראש הממשלה',
    desc: 'מי יושבע לראש הממשלה? (ברוטציה — מי שמכהן ראשון)',
    options: [...candidates, noGov],
  },
  {
    id: 'rotation', stage: 2, type: 'pick', emoji: '🔁', points: 5,
    title: 'רוטציה',
    desc: 'האם יהיה הסכם רוטציה בראשות הממשלה?',
    options: yesNo,
  },
  {
    id: 'size', stage: 2, type: 'pick', emoji: '🏛️', points: 8,
    title: 'גודל הקואליציה',
    desc: 'כמה חברי כנסת יהיו בקואליציה ביום ההשבעה?',
    options: [
      { id: 'minority', label: 'פחות מ-61 (ממשלת מיעוט)' },
      { id: '61-63', label: '61 עד 63' },
      { id: '64-67', label: '64 עד 67' },
      { id: '68plus', label: '68 ומעלה' },
      noGov,
    ],
  },
  {
    id: 'sworn', stage: 2, type: 'pick', emoji: '📅', points: 10,
    title: 'מתי תושבע הממשלה',
    desc: 'באיזה מועד תושבע הממשלה החדשה בכנסת?',
    history: FORMATION_HISTORY,
    options: [
      { id: 'nov', label: 'עד 30 בנובמבר', hint: 'מהיר במיוחד' },
      { id: 'dec1', label: 'בין 1 ל-15 בדצמבר' },
      { id: 'dec2', label: 'בין 16 ל-31 בדצמבר', hint: 'הקצב של 2022' },
      { id: 'jan', label: 'ינואר 2027' },
      { id: 'feb', label: 'פברואר 2027 ואילך' },
      noGov,
    ],
  },
  {
    id: 'arab', stage: 2, type: 'pick', emoji: '🧩', points: 5,
    title: 'מפלגה ערבית',
    desc: 'האם מפלגה ערבית תהיה בקואליציה או תתמוך בה מבחוץ?',
    context: 'ב-2021 רע״ם הייתה חלק מממשלת בנט-לפיד',
    options: yesNo,
  },
];

export const QUESTION = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));
export const STAGES = {
  1: { id: 1, name: 'שלב א׳', title: 'ליל הבחירות', emoji: '🗳️' },
  2: { id: 2, name: 'שלב ב׳', title: 'הקמת הממשלה', emoji: '🏛️' },
};

export const isSingleChoice = (q) => q.type === 'pick' || q.type === 'range';

// ---------- timing ----------

export function lockTime(q, settings) {
  if (q.stage === 2) return settings.stage2Lock || null;
  const main = settings.stage1Lock;
  const own = q.lockKey && settings[q.lockKey];
  if (own && main) return Date.parse(own) < Date.parse(main) ? own : main;
  return own || main || null;
}

export function isLocked(q, settings, now = Date.now()) {
  const t = lockTime(q, settings);
  return !!t && now >= Date.parse(t);
}

// Can players still change this answer?
export function isOpen(q, settings, now = Date.now()) {
  if (q.stage === 2 && !settings.stage2Open) return false;
  return !isLocked(q, settings, now);
}

export function stageLockTime(stage, settings) {
  return stage === 1 ? settings.stage1Lock : settings.stage2Lock;
}

export function isAnswered(q, answer) {
  if (answer === undefined || answer === null) return false;
  if (q.type === 'threshold') return q.parties.every((p) => typeof answer[p] === 'boolean');
  return true;
}

// ---------- context ----------

// Parties that entered the Knesset according to the stage-1 results.
export function knessetParties(results) {
  const seats = results?.stage1?.seats;
  if (!seats) return [];
  return PARTIES.filter((p) => (seats[p.id] || 0) > 0).map((p) => p.id);
}

export function maxPoints(q, results) {
  if (q.type === 'threshold') return q.pointsEach * q.parties.length;
  if (q.type === 'seats') return q.exact * PARTIES.length;
  if (q.type === 'coalition') return q.pointsEach * (knessetParties(results).length || 12);
  return q.points;
}

export function stageMax(stage, results) {
  return QUESTIONS.filter((q) => q.stage === stage).reduce((s, q) => s + maxPoints(q, results), 0);
}

// ---------- validation ----------

// Returns a normalized answer or throws an Error with a Hebrew message.
export function validateAnswer(q, answer, results) {
  const fail = (msg) => {
    throw new Error(msg);
  };
  if (isSingleChoice(q)) {
    if (typeof answer !== 'string' || !q.options.some((o) => o.id === answer)) fail('תשובה לא חוקית');
    return answer;
  }
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) fail('תשובה לא חוקית');
  if (q.type === 'threshold') {
    const out = {};
    for (const pid of q.parties) if (typeof answer[pid] === 'boolean') out[pid] = answer[pid];
    if (!Object.keys(out).length) fail('לא נבחרה אף מפלגה');
    return out;
  }
  if (q.type === 'seats') {
    const out = {};
    let sum = 0;
    for (const p of PARTIES) {
      const n = answer[p.id];
      if (!Number.isInteger(n) || n < 0 || n > SEATS_TOTAL) fail(`מספר מנדטים לא חוקי ל${p.name}`);
      if (n > 0 && n < MIN_SEATS) fail(`${p.name}: מפלגה שעוברת את אחוז החסימה מקבלת לפחות 4 מנדטים`);
      out[p.id] = n;
      sum += n;
    }
    if (sum !== SEATS_TOTAL) fail(`סך המנדטים צריך להיות 120 (כרגע ${sum})`);
    return out;
  }
  if (q.type === 'coalition') {
    const allowed = knessetParties(results);
    const out = {};
    for (const pid of allowed) if (answer[pid] === 'coalition' || answer[pid] === 'opposition') out[pid] = answer[pid];
    if (!Object.keys(out).length) fail('לא נבחרה אף מפלגה');
    return out;
  }
  fail('שאלה לא מוכרת');
}

// ---------- resolution: what is the correct answer? ----------

function bucketOf(options, value, halfOpen) {
  return options.find((o) => (halfOpen ? value >= o.min && value < o.max : value >= o.min && value <= o.max))?.id;
}

function blocSum(seats, bloc) {
  return BLOCS[bloc].parties.reduce((s, pid) => s + (seats[pid] || 0), 0);
}

function seatsComplete(s1) {
  return !!s1?.seats && PARTIES.every((p) => Number.isInteger(s1.seats[p.id]));
}

export function partyDiffs(seats) {
  return Object.fromEntries(PARTIES.map((p) => [p.id, Math.round(((seats[p.id] || 0) - p.poll) * 10) / 10]));
}

// Returns the correct answer for a question, or undefined when it is not known yet.
// Single-choice questions resolve to an array of correct option ids (ties count for everyone).
export function resolve(q, results) {
  const s1 = results?.stage1;
  const s2 = results?.stage2 || {};
  if (q.stage === 1) {
    if (q.id === 'turnout') {
      if (typeof s1?.turnout !== 'number') return undefined;
      const b = bucketOf(q.options, s1.turnout, true);
      return b ? [b] : undefined;
    }
    if (!seatsComplete(s1)) return undefined;
    const seats = s1.seats;
    switch (q.id) {
      case 'biggest': {
        const max = Math.max(...PARTIES.map((p) => seats[p.id]));
        return PARTIES.filter((p) => seats[p.id] === max).map((p) => p.id);
      }
      case 'threshold':
        return Object.fromEntries(q.parties.map((pid) => [pid, seats[pid] > 0]));
      case 'seats':
        return { ...seats };
      case 'rightBloc':
        return [bucketOf(q.options, blocSum(seats, 'right'))];
      case 'changeBloc':
        return [bucketOf(q.options, blocSum(seats, 'change'))];
      case 'surprise':
      case 'flop': {
        const d = partyDiffs(seats);
        const vals = Object.values(d);
        const target = q.id === 'surprise' ? Math.max(...vals) : Math.min(...vals);
        return PARTIES.filter((p) => d[p.id] === target).map((p) => p.id);
      }
    }
    return undefined;
  }
  const v = s2[q.id];
  if (v === undefined || v === null || v === '') return undefined;
  if (q.type === 'coalition') return typeof v === 'object' && Object.keys(v).length ? v : undefined;
  return [v];
}

// ---------- crowd ----------

// Aggregates everybody's answers. `all` is an array of {qid: answer} maps.
export function crowdStats(all, results) {
  const out = {};
  for (const q of QUESTIONS) {
    const answers = all.map((p) => p[q.id]).filter((a) => a !== undefined && a !== null);
    if (isSingleChoice(q)) {
      const counts = Object.fromEntries(q.options.map((o) => [o.id, 0]));
      for (const a of answers) if (a in counts) counts[a]++;
      out[q.id] = { n: answers.length, counts };
    } else if (q.type === 'threshold') {
      const pass = {};
      const n = {};
      for (const pid of q.parties) {
        const vals = answers.map((a) => a[pid]).filter((x) => typeof x === 'boolean');
        n[pid] = vals.length;
        pass[pid] = vals.filter(Boolean).length;
      }
      out[q.id] = { n: answers.length, pass, perParty: n };
    } else if (q.type === 'seats') {
      const avg = {};
      for (const p of PARTIES) {
        avg[p.id] = answers.length ? Math.round((answers.reduce((s, a) => s + (a[p.id] || 0), 0) / answers.length) * 10) / 10 : 0;
      }
      out[q.id] = { n: answers.length, avg };
    } else if (q.type === 'coalition') {
      const coal = {};
      const n = {};
      for (const pid of knessetParties(results)) {
        const vals = answers.map((a) => a[pid]).filter(Boolean);
        n[pid] = vals.length;
        coal[pid] = vals.filter((x) => x === 'coalition').length;
      }
      out[q.id] = { n: answers.length, coalition: coal, perParty: n };
    }
  }
  return out;
}

// ---------- scoring ----------

// Scores one question. Returns {points, max, resolved, correct, bonus, hits?}
export function scoreQuestion(q, answer, results, crowd) {
  const max = maxPoints(q, results);
  const truth = resolve(q, results);
  const base = { points: 0, bonus: 0, max, resolved: truth !== undefined, answered: answer !== undefined && answer !== null };
  if (truth === undefined || !base.answered) return base;

  if (isSingleChoice(q)) {
    const correct = truth.includes(answer);
    let bonus = 0;
    const c = crowd?.[q.id];
    if (correct && c && c.n >= LONE_WOLF_MIN_VOTERS && c.counts[answer] / c.n < LONE_WOLF_SHARE) {
      bonus = Math.round(q.points / 2);
    }
    return { ...base, correct, points: correct ? q.points + bonus : 0, bonus };
  }
  if (q.type === 'threshold') {
    let hits = 0;
    for (const pid of q.parties) if (typeof answer[pid] === 'boolean' && answer[pid] === truth[pid]) hits++;
    return { ...base, hits, correct: hits === q.parties.length, points: hits * q.pointsEach };
  }
  if (q.type === 'seats') {
    let exact = 0;
    let near = 0;
    for (const p of PARTIES) {
      const d = Math.abs((answer[p.id] ?? -99) - truth[p.id]);
      if (d === 0) exact++;
      else if (d === 1) near++;
    }
    return { ...base, exact, near, correct: exact === PARTIES.length, points: exact * q.exact + near * q.near };
  }
  if (q.type === 'coalition') {
    let hits = 0;
    for (const pid of Object.keys(truth)) if (answer[pid] && answer[pid] === truth[pid]) hits++;
    return { ...base, hits, correct: hits === Object.keys(truth).length, points: hits * q.pointsEach };
  }
  return base;
}

export function scorePlayer(answers, results, crowd) {
  const perQuestion = {};
  const totals = { 1: 0, 2: 0 };
  let resolved = 0;
  let correct = 0;
  let exactSeats = 0;
  let loneWolf = 0;
  for (const q of QUESTIONS) {
    const s = scoreQuestion(q, answers[q.id], results, crowd);
    perQuestion[q.id] = s;
    totals[q.stage] += s.points;
    if (s.resolved && s.answered) {
      resolved++;
      if (s.points > 0) correct++;
    }
    if (s.exact) exactSeats = s.exact;
    if (s.bonus) loneWolf++;
  }
  return { perQuestion, s1: totals[1], s2: totals[2], total: totals[1] + totals[2], resolved, correct, exactSeats, loneWolf };
}

// Sorts players and assigns competition ranks (1,2,2,4). Ties broken by exact seat hits.
export function rankPlayers(players, key = 'total') {
  const sorted = [...players].sort(
    (a, b) => b[key] - a[key] || (key !== 's2' ? b.exactSeats - a.exactSeats : 0) || a.name.localeCompare(b.name, 'he'),
  );
  let prev = null;
  sorted.forEach((p, i) => {
    const same = prev && prev[key] === p[key] && (key === 's2' || prev.exactSeats === p.exactSeats);
    p.rank = same ? prev.rank : i + 1;
    prev = p;
  });
  return sorted;
}

// Prefills a seat table from the polls, respecting threshold choices, summing to 120.
export function prefillSeats(threshold = {}) {
  const raw = PARTIES.map((p) => {
    const fails = threshold[p.id] === false || (threshold[p.id] === undefined && p.poll < MIN_SEATS);
    const v = fails ? 0 : Math.max(MIN_SEATS, p.poll);
    return { id: p.id, v, floor: Math.floor(v), frac: v - Math.floor(v) };
  });
  let sum = raw.reduce((s, r) => s + r.floor, 0);
  const out = Object.fromEntries(raw.map((r) => [r.id, r.floor]));
  const order = raw.filter((r) => r.v > 0).sort((a, b) => b.frac - a.frac || b.v - a.v);
  let i = 0;
  while (sum < SEATS_TOTAL && order.length) {
    out[order[i % order.length].id]++;
    sum++;
    i++;
  }
  i = 0;
  const shrink = [...order].reverse();
  while (sum > SEATS_TOTAL && shrink.length) {
    const r = shrink[i % shrink.length];
    if (out[r.id] > MIN_SEATS) {
      out[r.id]--;
      sum--;
    }
    i++;
    if (i > 1000) break;
  }
  return out;
}

export function badgesFor(score, extra = {}) {
  const b = [];
  if (extra.stage1Winner) b.push({ id: 'king1', emoji: '👑', title: 'מלך/ת ליל הבחירות' });
  if (extra.stage2Winner) b.push({ id: 'king2', emoji: '🏛️', title: 'מלך/ת הקואליציה' });
  if (score.exactSeats >= 3) b.push({ id: 'sniper', emoji: '🎯', title: 'צלף/ית', desc: `${score.exactSeats} פגיעות מדויקות במנדטים` });
  if (score.perQuestion.surprise?.points > 0) b.push({ id: 'prophet', emoji: '🔮', title: 'נביא/ה', desc: 'זיהית את הפתעת הבחירות' });
  if (score.loneWolf > 0) b.push({ id: 'wolf', emoji: '🐺', title: 'זאב בודד', desc: 'צדקת כשכמעט כולם טעו' });
  if (score.perQuestion.threshold?.correct) b.push({ id: 'edge', emoji: '🚧', title: 'שומר/ת הסף', desc: 'כל ניחושי אחוז החסימה נכונים' });
  if (extra.complete1) b.push({ id: 'full', emoji: '✅', title: 'טופס מלא', desc: 'ענית על כל שאלות שלב א׳' });
  return b;
}
