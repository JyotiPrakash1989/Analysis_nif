/**
 * Exchange SMS OTP for MSTOCK_JWT_TOKEN via session/token only.
 * Prerequisite: OTP sent (run `npm run mstock:login` or connect/login once today).
 *
 * @see https://api.mstock.trade/openapi/typea/session/token
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { MSTOCK_SESSION_TOKEN_URL, mstockGenerateSession } from '../server/mstockAuth.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const repoEnv = path.join(root, '..', '.env');
const localEnv = path.join(root, '.env');

dotenv.config({ path: repoEnv });
dotenv.config({ path: localEnv, override: true });

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

const apiKey = (process.env.MSTOCK_API_KEY || '').trim().replace(/^\uFEFF/, '');
const checksum = (process.env.MSTOCK_CHECKSUM || 'L').trim();
let otp = (process.env.MSTOCK_OTP || process.env.MSTOCK_REQUEST_TOKEN || '').trim();

if (!apiKey) {
  console.error('Set MSTOCK_API_KEY in .env first.');
  process.exit(1);
}

if (!otp) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  otp = await new Promise((resolve) => rl.question('Enter OTP (request_token): ', (a) => { rl.close(); resolve(a.trim()); }));
}

if (!otp) {
  console.error('OTP required (MSTOCK_OTP in .env or prompt).');
  process.exit(1);
}

try {
  console.log(`POST ${MSTOCK_SESSION_TOKEN_URL}`);
  const { accessToken } = await mstockGenerateSession(apiKey, otp, checksum);
  upsertEnvVar(localEnv, 'MSTOCK_JWT_TOKEN', accessToken);
  if (fs.existsSync(repoEnv)) upsertEnvVar(repoEnv, 'MSTOCK_JWT_TOKEN', accessToken);
  console.log('MSTOCK_JWT_TOKEN saved. Restart: npm run dev');
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
