// Sends login codes. Configure ONE of: RESEND_API_KEY, BREVO_API_KEY, or SMTP_HOST.
// With nothing configured, login falls back to email + personal PIN.
import nodemailer from 'nodemailer';

const FROM = process.env.MAIL_FROM || '';
const APP_NAME = '61 · ליגת הבחירות';

export function mailMode() {
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.BREVO_API_KEY) return 'brevo';
  if (process.env.SMTP_HOST) return 'smtp';
  return null;
}

let transport;
function smtp() {
  transport ||= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transport;
}

function codeHtml(code) {
  return `<div dir="rtl" style="font-family:Arial,sans-serif;text-align:center;padding:24px">
    <div style="font-size:40px;font-weight:900;color:#13235b">61</div>
    <p style="font-size:16px">קוד הכניסה שלך לליגת ניחושי הבחירות:</p>
    <div style="font-size:36px;letter-spacing:8px;font-weight:700;background:#eef2fb;border-radius:12px;padding:12px 0;margin:12px auto;max-width:260px">${code}</div>
    <p style="color:#666;font-size:13px">הקוד תקף ל-15 דקות. אם לא ביקשת אותו — אפשר להתעלם.</p>
  </div>`;
}

export async function sendLoginCode(to, code) {
  const subject = `${code} – קוד הכניסה שלך ל-61`;
  const text = `קוד הכניסה שלך: ${code} (תקף ל-15 דקות)`;
  const html = codeHtml(code);
  const mode = mailMode();
  if (mode === 'resend') {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM || `${APP_NAME} <onboarding@resend.dev>`, to: [to], subject, text, html }),
    });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
    return;
  }
  if (mode === 'brevo') {
    const m = /^(.*)<(.+)>$/.exec(FROM);
    const sender = m ? { name: m[1].trim(), email: m[2].trim() } : { name: APP_NAME, email: FROM };
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender, to: [{ email: to }], subject, textContent: text, htmlContent: html }),
    });
    if (!r.ok) throw new Error(`Brevo ${r.status}: ${await r.text()}`);
    return;
  }
  if (mode === 'smtp') {
    await smtp().sendMail({ from: FROM || process.env.SMTP_USER, to, subject, text, html });
    return;
  }
  throw new Error('email is not configured');
}
