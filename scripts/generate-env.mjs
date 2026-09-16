import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const env = {
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? '',
  API_URL: process.env.API_URL ?? 'http://localhost:3000',
};

writeFileSync(
  resolve('public/env.js'),
  `window.__env = ${JSON.stringify(env, null, 2)};\n`,
  'utf8',
);
