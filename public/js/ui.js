import { html } from 'htm/preact';
import { createContext } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import { PARTY } from '/shared/game.js';
import { splitDuration } from './lib.js';

export const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

// Server-corrected clock, ticking every second.
export function useNow() {
  const { skew } = useApp();
  const [now, setNow] = useState(Date.now() + skew);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + skew), 1000);
    return () => clearInterval(id);
  }, [skew]);
  return now;
}

export function Slip({ pid, selected, state, onClick, disabled, share, dim }) {
  const p = PARTY[pid];
  const cls = ['slip', selected && 'selected', state, dim && 'dim'].filter(Boolean).join(' ');
  const stamp = state === 'correct' ? '✓' : state === 'wrong' ? '✗' : selected ? '✓' : null;
  return html`<button
    type="button"
    class=${cls}
    style=${{ '--party': p.color }}
    onClick=${onClick}
    disabled=${disabled}
    aria-pressed=${!!selected}
  >
    ${stamp && html`<span class="stamp">${stamp}</span>`}
    <span class="slip-letters">${p.letters}</span>
    <span class="slip-name">${p.name}</span>
    ${p.leader && html`<span class="slip-leader">${p.leader}</span>`}
    ${share !== undefined && html`<span class="share">${share}%</span>`}
  </button>`;
}

export function MiniSlip({ pid }) {
  const p = PARTY[pid];
  return html`<span class="mini-slip" style=${{ '--party': p.color }} aria-hidden="true">${p.letters}</span>`;
}

export function Countdown({ to }) {
  const now = useNow();
  const { d, h, m, s } = splitDuration(Date.parse(to) - now);
  const pad = (n) => String(n).padStart(2, '0');
  const units = d > 0 ? [[d, 'ימים'], [h, 'שעות'], [m, 'דקות'], [s, 'שניות']] : [[h, 'שעות'], [m, 'דקות'], [s, 'שניות']];
  return html`<div class="countdown" style=${{ gridTemplateColumns: `repeat(${units.length}, 1fr)` }} role="timer">
    ${units.map(([v, l]) => html`<div class="unit"><div class="v">${pad(v)}</div><div class="l">${l}</div></div>`)}
  </div>`;
}

export function Avatar({ emoji, lg }) {
  return html`<span class=${lg ? 'avatar lg' : 'avatar'} aria-hidden="true">${emoji || '🙂'}</span>`;
}

export function Notice({ icon = 'ℹ️', tone = '', children }) {
  return html`<div class=${`notice ${tone}`}><span class="i">${icon}</span><div class="grow">${children}</div></div>`;
}

export function Spinner() {
  return html`<div class="loading"><div class="spinner"></div></div>`;
}

export function Progress({ value, max, light }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return html`<div class=${light ? 'progress light' : 'progress'} role="progressbar" aria-valuenow=${value} aria-valuemax=${max}>
    <i style=${{ width: `${pct}%` }}></i>
  </div>`;
}

export const medal = (rank) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null);

export const EMOJIS = ['🙂', '😎', '🤓', '🦁', '🐯', '🦊', '🐼', '🐸', '🦄', '🐙', '🦉', '🐝', '🌵', '🍕', '🌶️', '☕', '🚀', '⚡', '🔥', '🎯', '🎩', '👑', '🧠', '🗳️'];

export function EmojiPicker({ value, onChange }) {
  return html`<div class="emojis" role="radiogroup" aria-label="אווטאר">
    ${EMOJIS.map(
      (e) => html`<button type="button" class=${value === e ? 'on' : ''} onClick=${() => onChange(e)} aria-pressed=${value === e}>${e}</button>`,
    )}
  </div>`;
}
