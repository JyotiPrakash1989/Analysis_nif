/**
 * Obtain MSTOCK_JWT_TOKEN via trade.mstock.com credentials + SMS OTP.
 * Writes to stat_react/.env (and Nif/.env if present). Re-run daily before midnight.
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { mstockConnectLogin, mstockGenerateSession } from '../server/mstockAuth.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const repoEnv = path.join(root, '..', '.env');
const localEnv = path.join(root, '.env');

dotenv.config({ path: repoEnv });
dotenv.config({ path: localEnv, override: true });

function ask(rl, prompt, { secret = false } = {}) {
  return new Promise((resolve) => {
    if (!secret) {
      rl.question(prompt, resolve);
      return;
    }
    const stdin = process.stdin;
    const onData = (ch) => {
      const c = ch.toString();
      if (c === '\n' || c === '\r' || c === '\u0004') {
        stdin.pause();
        process.stdout.write('\n');
        stdin.removeListener('data', onData);
        resolve(line);
      } else if (c === '\u0003') {
        process.exit(130);
      } else {
        line += c;
        process.stdout.write('*');
      }
    };
    let line = '';
    process.stdout.write(prompt);
    stdin.resume();
    stdin.setRawMode?.(true);
    stdin.on('data', onData);
  });
}

function upsertEnvVar(filePath, key, value) {
  const line = `${key}=${value}`;
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `${line}\n`, 'utf8');
    return;
  }
  const text = fs.readFileSync(filePath, 'utf8');
  const re = new RegExp(`^${key}=.*$`, 'm');
  const next = re.test(text) ? text.replace(re, line) : `${text.trimEnd()}\n${line}\n`;
  fs.writeFileSync(filePath, next, 'utf8');
}

const apiKey = (process.env.MSTOCK_API_KEY || process.env.VITE_MSTOCK_API_KEY || '')
  .trim()
  .replace(/^\uFEFF/, '');
const username = (process.env.MSTOCK_USERNAME || '').trim();
const password = (process.env.MSTOCK_PASSWORD || '').trim();
const checksum = (process.env.MSTOCK_CHECKSUM || 'L').trim();

if (!apiKey) {
  console.error('Set MSTOCK_API_KEY in Nif/.env or stat_react/.env first.');
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

try {
  const user = username || (await ask(rl, 'mStock username (client id): '));
  const pass = password || (await ask(rl, 'mStock password: ', { secret: true }));

  console.log('\nSending OTP to your registered mobile…');
  await mstockConnectLogin(user, pass);

  const otp = await ask(rl, 'Enter OTP from SMS: ');
  rl.close();

  console.log('Generating session token…');
  const { accessToken } = await mstockGenerateSession(apiKey, otp, checksum);

  upsertEnvVar(localEnv, 'MSTOCK_JWT_TOKEN', accessToken);
  if (fs.existsSync(repoEnv)) {
    upsertEnvVar(repoEnv, 'MSTOCK_JWT_TOKEN', accessToken);
  }

  console.log('\nMSTOCK_JWT_TOKEN saved (valid until midnight). Restart: npm run dev');
} catch (e) {
  rl.close();
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
