// index.js
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs/promises');
const nodemailer = require('nodemailer');

const { MONGODB_URI, SMTP_CONFIG, EMAIL_TO } = process.env;

if (!MONGODB_URI) {
  console.error('[ERROR] MONGODB_URI is required');
  process.exit(1);
}
if (!SMTP_CONFIG) {
  console.error('[ERROR] SMTP_CONFIG is required (example: smtp://mailhog:1025|routed@routed.dev)');
  process.exit(1);
}
if (!EMAIL_TO) {
  console.error('[ERROR] EMAIL_TO is required (comma-separated addresses)');
  process.exit(1);
}

function parseDatabaseFromMongoUri(uri) {
  // remove query string
  const withoutQuery = uri.split('?')[0];
  // split on last slash
  const parts = withoutQuery.split('/');
  const last = parts[parts.length - 1] || '';
  // if last part looks like hostname:port or is empty -> no DB
  if (!last) return null;
  if (last.includes(':') || last.includes(',') || last.includes('@')) return null;
  // returned value may be percent-encoded in some URIs
  return decodeURIComponent(last);
}

function runCommand(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const cp = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    let stdout = '', stderr = '';
    cp.stdout.on('data', d => { stdout += d.toString(); process.stdout.write(d); });
    cp.stderr.on('data', d => { stderr += d.toString(); process.stderr.write(d); });
    cp.on('error', reject);
    cp.on('close', code => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} ${args.join(' ')} exited with ${code}\n${stderr}`));
    });
  });
}

async function main() {
  const db = parseDatabaseFromMongoUri(MONGODB_URI);
  console.log('[INFO] Database parsed from URI:', db || '(all databases)');

  const ts = new Date().toISOString().replace(/[:]/g, '').replace(/\.\d+Z$/, 'Z');
  const outdir = `/backup/mongodump-${ts}`;
  await fs.mkdir(outdir, { recursive: true });

  // Build mongodump args
  const dumpArgs = ['--uri', MONGODB_URI, '--out', outdir];
  if (db) dumpArgs.push('--db', db);

  console.log('[INFO] Running mongodump...');
  await runCommand('mongodump', dumpArgs);
  console.log('[INFO] mongodump complete:', outdir);

  // zip it
  const zipName = `mongodump-${ts}.zip`;
  const zipPath = path.posix.join('/backup', zipName);

  // Run zip from /backup so zip file contains folder name rather than full path
  console.log('[INFO] Zipping dump...');
  await runCommand('zip', ['-r', zipPath, path.basename(outdir)], { cwd: '/backup' });
  console.log('[INFO] Zip created at:', zipPath);

  // prepare transporter
  const [smtpUrl, from] = SMTP_CONFIG.split('|');
  if (!smtpUrl || !from) {
    console.error('[ERROR] SMTP_CONFIG malformed. Must be: <smtp-url>|<from-address>');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport(smtpUrl, {
    secure: smtpUrl.startsWith('smtps://')
  });

  const to = EMAIL_TO.split(',').map(s => s.trim()).filter(Boolean).join(', ');
  const mailOptions = {
    from,
    to,
    subject: `MongoDB backup - ${ts}`,
    text: `Attached: MongoDB backup (${db || 'all databases'}) created at ${ts}.`,
    attachments: [
      {
        filename: zipName,
        path: zipPath
      }
    ]
  };

  console.log(`[INFO] Sending email to: ${to}`);
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('[INFO] Email sent:', info && (info.messageId || info.response) || info);
  } catch (err) {
    console.error('[ERROR] Failed to send email:', err);
    process.exit(2);
  }

  // optional: leave the zip file in /backup; you could delete older zips here if desired
  console.log('[INFO] Backup + email finished successfully');
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(3);
});
