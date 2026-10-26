import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  QUESTION, PARTIES, prefillSeats, validateAnswer, resolve, scoreQuestion, scorePlayer, crowdStats, rankPlayers,
  lockTime, isOpen, isLocked, stageMax, knessetParties,
} from '../public/shared/game.js';

const seats = {
  yashar: 24, likud: 22, together: 13, democrats: 9, joint: 9, yb: 7, otzma: 9, utj: 7, shas: 8, rzp: 0,
  raam: 6, reservists: 6, amcha: 0,
};
const results = { stage1: { seats, other: 0, turnout: 71.2, label: 'סופי', final: true }, stage2: {} };

test('poll prefill sums to 120 and respects the threshold', () => {
  const s = prefillSeats();
  assert.equal(Object.values(s).reduce((a, b) => a + b, 0), 120);
  assert.equal(s.amcha, 0);
  assert.equal(s.reservists, 0);
  const s2 = prefillSeats({ reservists: true, rzp: false, amcha: true });
  assert.equal(Object.values(s2).reduce((a, b) => a + b, 0), 120);
  assert.equal(s2.rzp, 0);
  assert.ok(s2.reservists >= 4 && s2.amcha >= 4);
  for (const v of Object.values(s2)) assert.ok(v === 0 || v >= 4);
});

test('seat validation enforces 120 and the threshold', () => {
  assert.throws(() => validateAnswer(QUESTION.seats, { ...seats, yashar: 23 }), /120/);
  assert.throws(() => validateAnswer(QUESTION.seats, { ...seats, rzp: 2, yashar: 22 }), /לפחות 4/);
  assert.deepEqual(validateAnswer(QUESTION.seats, seats), seats);
  assert.throws(() => validateAnswer(QUESTION.biggest, 'nope'));
  assert.equal(validateAnswer(QUESTION.turnout, '70-72'), '70-72');
});

test('derived answers', () => {
  assert.deepEqual(resolve(QUESTION.biggest, results), ['yashar']);
  assert.deepEqual(resolve(QUESTION.threshold, results), { rzp: false, raam: true, reservists: true, amcha: false });
  // right bloc: 22+8+7+9+0 = 46
  assert.deepEqual(resolve(QUESTION.rightBloc, results), ['upto49']);
  // change bloc: 24+13+9+7 = 53
  assert.deepEqual(resolve(QUESTION.changeBloc, results), ['50-53']);
  // reservists 6 - 1.3 = +4.7 is the largest beat; rzp 0 - 7 = -7 the largest miss
  assert.deepEqual(resolve(QUESTION.surprise, results), ['reservists']);
  assert.deepEqual(resolve(QUESTION.flop, results), ['rzp']);
  assert.deepEqual(resolve(QUESTION.turnout, results), ['70-72']);
  assert.equal(resolve(QUESTION.mandate, results), undefined);
});

test('turnout buckets are half-open', () => {
  const r = (t) => resolve(QUESTION.turnout, { stage1: { turnout: t } });
  assert.deepEqual(r(68), ['68-70']);
  assert.deepEqual(r(67.99), ['lt68']);
  assert.deepEqual(r(74), ['74plus']);
});

test('unresolved while seats are partial', () => {
  const partial = { stage1: { seats: { yashar: 30 } } };
  assert.equal(resolve(QUESTION.biggest, partial), undefined);
  assert.equal(scoreQuestion(QUESTION.biggest, 'yashar', partial).points, 0);
});

test('seat scoring: exact 2, off-by-one 1', () => {
  const guess = { ...seats, yashar: 23, likud: 23, together: 11 };
  const s = scoreQuestion(QUESTION.seats, guess, results);
  // yashar -1, likud +1 → near; together -2 → miss; 10 exact
  assert.equal(s.exact, 10);
  assert.equal(s.near, 2);
  assert.equal(s.points, 22);
});

test('threshold scoring is per party', () => {
  const s = scoreQuestion(QUESTION.threshold, { rzp: true, raam: true, reservists: false, amcha: false }, results);
  assert.equal(s.hits, 2);
  assert.equal(s.points, 6);
});

test('lone wolf bonus: +50% when under 20% picked it, with at least 5 voters', () => {
  const all = [
    { biggest: 'yashar' }, { biggest: 'likud' }, { biggest: 'likud' }, { biggest: 'likud' }, { biggest: 'likud' }, { biggest: 'likud' },
  ];
  const crowd = crowdStats(all, results);
  const s = scoreQuestion(QUESTION.biggest, 'yashar', results, crowd);
  assert.equal(s.points, 18);
  assert.equal(s.bonus, 6);
  const fewVoters = crowdStats(all.slice(0, 3), results);
  assert.equal(scoreQuestion(QUESTION.biggest, 'yashar', results, fewVoters).points, 12);
});

test('ties: every tied party counts as correct', () => {
  const tie = { stage1: { seats: { ...seats, likud: 24, together: 11 } } };
  assert.deepEqual(resolve(QUESTION.biggest, tie), ['yashar', 'likud']);
  assert.equal(scoreQuestion(QUESTION.biggest, 'likud', tie).points, 12);
});

test('stage 2 scoring and coalition', () => {
  const r = {
    ...results,
    stage2: { mandate: 'eisenkot', pm: 'eisenkot', coalition: { yashar: 'coalition', likud: 'opposition', together: 'coalition' } },
  };
  assert.equal(scoreQuestion(QUESTION.pm, 'eisenkot', r).points, 25);
  const c = scoreQuestion(QUESTION.coalition, { yashar: 'coalition', likud: 'coalition', together: 'coalition' }, r);
  assert.equal(c.hits, 2);
  assert.equal(c.points, 4);
  assert.deepEqual(knessetParties(r).length, 11);
  assert.throws(() => validateAnswer(QUESTION.coalition, { amcha: 'coalition' }, r));
});

test('each stage is worth 100 points', () => {
  const r = { stage1: { seats: { ...seats, rzp: 4, yashar: 20 } } }; // 12 parties in the Knesset
  assert.equal(stageMax(1, r), 100);
  assert.equal(stageMax(2, r), 100);
});

test('full player score and ranking', () => {
  const a = scorePlayer({ biggest: 'yashar', seats, turnout: '70-72' }, results, {});
  assert.equal(a.s1, 12 + 26 + 8);
  const players = [
    { name: 'א', total: 10, exactSeats: 3 },
    { name: 'ב', total: 10, exactSeats: 5 },
    { name: 'ג', total: 12, exactSeats: 0 },
    { name: 'ד', total: 10, exactSeats: 5 },
  ];
  const ranked = rankPlayers(players);
  assert.deepEqual(ranked.map((p) => [p.name, p.rank]), [['ג', 1], ['ב', 2], ['ד', 2], ['א', 4]]);
});

test('locks', () => {
  const settings = { stage1Lock: '2026-10-27T22:00:00+02:00', turnoutLock: '2026-10-27T10:00:00+02:00', stage2Open: false, stage2Lock: null };
  const at = (s) => Date.parse(s);
  assert.equal(lockTime(QUESTION.turnout, settings), settings.turnoutLock);
  assert.ok(isOpen(QUESTION.turnout, settings, at('2026-10-27T09:59:00+02:00')));
  assert.ok(!isOpen(QUESTION.turnout, settings, at('2026-10-27T10:00:00+02:00')));
  assert.ok(isOpen(QUESTION.biggest, settings, at('2026-10-27T21:59:00+02:00')));
  assert.ok(isLocked(QUESTION.biggest, settings, at('2026-10-27T22:00:00+02:00')));
  assert.ok(!isOpen(QUESTION.pm, settings, at('2026-10-27T12:00:00+02:00')));
  assert.ok(isOpen(QUESTION.pm, { ...settings, stage2Open: true }, at('2026-10-27T12:00:00+02:00')));
});

test('party list is consistent', () => {
  assert.equal(PARTIES.length, 13);
  assert.equal(new Set(PARTIES.map((p) => p.letters)).size, 13);
});
