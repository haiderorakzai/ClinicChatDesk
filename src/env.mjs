import fs from 'node:fs';
import path from 'node:path';

export function loadEnv(file = path.resolve(process.cwd(), '.env')) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const idx = s.indexOf('=');
    if (idx < 1) continue;
    const k = s.slice(0, idx).trim();
    let v = s.slice(idx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}

// Load .env as soon as this module is imported so dependent modules can safely
// read process.env during their own module initialization.
loadEnv();

export function envBool(name, fallback=false) {
  const v = process.env[name];
  if (v == null) return fallback;
  return ['1','true','yes','on'].includes(String(v).toLowerCase());
}
