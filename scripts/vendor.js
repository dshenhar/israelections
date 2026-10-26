// Copies the browser builds of preact + htm into public/vendor (served as static files).
import fs from 'node:fs';
const files = {
  'preact.mjs': 'node_modules/preact/dist/preact.mjs',
  'hooks.mjs': 'node_modules/preact/hooks/dist/hooks.mjs',
  'htm.mjs': 'node_modules/htm/dist/htm.mjs',
  'htm-preact.mjs': 'node_modules/htm/preact/index.mjs',
};
fs.mkdirSync('public/vendor', { recursive: true });
for (const [name, src] of Object.entries(files)) fs.copyFileSync(src, `public/vendor/${name}`);
console.log('vendor files copied');
