/**
 * Auto MSTOCK_JWT_TOKEN using registered TOTP (verifytotp).
 * Set MSTOCK_API_KEY + MSTOCK_TOTP_SECRET in .env.
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { mstockVerifyTotp } from '../server/mstockAuth.mjs';
import { generateTotpCode } from '../server/mstockTotp.mjs';

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
const totpSecret = process.env.MSTOCK_TOTP_SECRET || '';

if (!apiKey) {
  console.error('Set MSTOCK_API_KEY in .env');
  process.exit(1);
}
if (!totpSecret.trim()) {
  console.error('Set MSTOCK_TOTP_SECRET (base32 from mStock TOTP registration) in .env');
  process.exit(1);
}

try {
  const totp = generateTotpCode(totpSecret);
  console.log('POST verifytotp with current TOTP code…');
  const { accessToken } = await mstockVerifyTotp(apiKey, totp);
  upsertEnvVar(localEnv, 'MSTOCK_JWT_TOKEN', accessToken);
  if (fs.existsSync(repoEnv)) upsertEnvVar(repoEnv, 'MSTOCK_JWT_TOKEN', accessToken);
  console.log('MSTOCK_JWT_TOKEN saved (valid until midnight). Restart: npm run dev');
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
