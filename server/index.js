// Local / Docker entry point. On Vercel the same app runs from api/index.js.
import app from './app.js';
import { dbReady } from './db.js';
import { mailMode } from './mail.js';

const PORT = Number(process.env.PORT || 3000);
await dbReady();
app.listen(PORT, () => {
  console.log(`61 is up on http://localhost:${PORT} · login mode: ${mailMode() || 'pin'}`);
});
