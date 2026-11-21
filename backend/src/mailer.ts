/**
 * Outgoing messages to customers (password reset codes).
 * E-mail: set SMTP_HOST, SMTP_PORT, SMTP_SECURE (true for 465), SMTP_USER, SMTP_PASS, SMTP_FROM in .env.
 * SMS: no provider yet — sendSms() is the single place to plug one in.
 * MAIL_DEV_LOG=1 writes the codes to the API log while nothing is configured (testing only, never in production).
 */
import { Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

const log = new Logger('Mailer');
let transport: nodemailer.Transporter | null | undefined;

export const mailConfigured = () => !!process.env.SMTP_HOST;
export const smsConfigured = () => false;

function getTransport() {
  if (transport !== undefined) return transport;
  if (!mailConfigured()) return (transport = null);
  const port = Number(process.env.SMTP_PORT) || 587;
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transport;
}

const devLog = (what: string) => {
  if (process.env.MAIL_DEV_LOG === '1') log.warn(`[MAIL_DEV_LOG] ${what}`);
};

export async function sendMail(to: string, subject: string, text: string, html?: string) {
  const t = getTransport();
  if (!t) {
    log.warn(`SMTP is not configured, e-mail to ${to.replace(/^(.).*@/, '$1***@')} not sent`);
    devLog(`to=${to} subject=${subject}\n${text}`);
    return false;
  }
  await t.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text, html });
  return true;
}

/** Plug an SMS provider in here. Returns false while none is configured. */
export async function sendSms(phone: string, text: string) {
  log.warn(`SMS provider is not configured, SMS to ***${phone.slice(-3)} not sent`);
  devLog(`sms to=${phone}: ${text}`);
  return false;
}

const RESET_TEXT: Record<string, { subject: string; body: (c: string) => string }> = {
  hy: { subject: 'LED Computers — գաղտնաբառի վերականգնում', body: (c) => `Ձեր հաստատման կոդը՝ ${c}\nԿոդը գործում է 15 րոպե։ Եթե դուք չեք խնդրել, պարզապես անտեսեք այս նամակը։` },
  ru: { subject: 'LED Computers — восстановление пароля', body: (c) => `Ваш код подтверждения: ${c}\nКод действует 15 минут. Если вы не запрашивали восстановление, просто проигнорируйте это письмо.` },
  en: { subject: 'LED Computers — password reset', body: (c) => `Your confirmation code: ${c}\nThe code is valid for 15 minutes. If you did not ask for it, just ignore this message.` },
};

export async function sendResetCode(channel: 'email' | 'sms', to: string, code: string, lang = 'hy') {
  const t = RESET_TEXT[lang] || RESET_TEXT.hy;
  if (channel === 'sms') return sendSms(to, `LED Computers: ${code}`);
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#0E1A2E">
    <p>${t.body(code).split('\n')[0].replace(code, `<b style="font-size:26px;letter-spacing:4px;color:#1468DC">${code}</b>`)}</p>
    <p style="color:#5B6B82">${t.body(code).split('\n')[1]}</p><p>LED Computers · led.am</p></div>`;
  return sendMail(to, t.subject, t.body(code), html);
}
