import { config, appUrl } from '../config.js';
import { log, errInfo } from '../log.js';

export async function sendEmail(to, subject, text) {
  if (!config.BREVO_API_KEY || !config.EMAIL_FROM_ADDRESS) {
    log.info('email not sent (Brevo not configured); printing instead', { to, subject, text });
    return;
  }
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': config.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: config.EMAIL_FROM_NAME, email: config.EMAIL_FROM_ADDRESS },
      to: [{ email: to }],
      subject,
      textContent: text,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

// Email must never break the request that triggered it.
export const sendEmailSafe = (to, subject, text) =>
  sendEmail(to, subject, text).catch((e) => log.error('email failed', { to, subject, err: errInfo(e) }));

export const link = (path) => `${appUrl}${path}`;
