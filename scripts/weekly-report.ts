// Usage : npm run weekly-report [-- --dry-run]   (dry-run : écrit report.html, n'envoie rien)
import { writeFileSync } from 'node:fs';
import nodemailer from 'nodemailer';
import { todayParis } from '../src/core/dates';
import { buildEngine } from '../src/core/engine';
import { buildWeeklyReport } from '../src/core/report';
import { renderEmail } from './lib/email';
import { openData, requireEnv } from './lib/files';

async function main() {
  const dry = process.argv.includes('--dry-run');
  const { vault, prices } = await openData(requireEnv('VAULT_PASSPHRASE'));
  const [owner, repo] = (process.env.GITHUB_REPOSITORY ?? `${vault.settings.github.owner}/${vault.settings.github.repo}`).split('/');
  const url = process.env.DASHBOARD_URL ?? (owner && repo ? `https://${owner.toLowerCase()}.github.io/${repo}/` : '');
  const mail = renderEmail(buildWeeklyReport(buildEngine(vault, prices, todayParis())), url);
  if (dry) { writeFileSync('report.html', mail.html); console.log(`✔ report.html écrit — ${mail.subject}`); return; }
  const port = Number(process.env.SMTP_PORT ?? 465);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com', port, secure: port === 465,
    auth: { user: requireEnv('SMTP_USER'), pass: requireEnv('SMTP_PASS') },
  });
  await transport.sendMail({ from: `Patrimoine <${requireEnv('SMTP_USER')}>`, to: requireEnv('MAIL_TO'), subject: mail.subject, html: mail.html, text: mail.text });
  console.log(`✔ Mail envoyé : ${mail.subject}`);
}
main().catch((e) => { console.error(`✖ ${e.message}`); process.exit(1); });
