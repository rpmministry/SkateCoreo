/**
 * generate-beta-codes.mjs
 * ---------------------------------------------------------------------------
 * Genera códigos promocionales SC-BETA-XXXX-XXXX-XXXX con aleatoriedad
 * criptográfica uniforme (crypto.randomInt) y un alfabeto SIN caracteres
 * ambiguos (se excluyen O, 0, I, 1 y también L para evitar confusión con 1).
 *
 * Uso:
 *   node scripts/generate-beta-codes.mjs            → imprime JSON + SQL
 *   node scripts/generate-beta-codes.mjs --count 10 → número de códigos
 *
 * No persiste nada por sí mismo: la siembra oficial se hace en la migración
 * SQL (ON CONFLICT DO NOTHING), que es la fuente de verdad en el backend.
 */

import { randomInt } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sin O, 0, I, 1, L
const BLOCKS = 3;
const BLOCK_LEN = 4;
const PREFIX = 'SC-BETA';

function randomBlock() {
  let out = '';
  for (let i = 0; i < BLOCK_LEN; i++) {
    out += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return out;
}

export function generateBetaCode() {
  const parts = [];
  for (let i = 0; i < BLOCKS; i++) parts.push(randomBlock());
  return `${PREFIX}-${parts.join('-')}`;
}

function generateUniqueCodes(count) {
  const set = new Set();
  while (set.size < count) set.add(generateBetaCode());
  return [...set];
}

const argv = process.argv.slice(2);
const countArgIndex = argv.indexOf('--count');
const count = countArgIndex !== -1 ? Number(argv[countArgIndex + 1]) || 10 : 10;

const codes = generateUniqueCodes(count);

console.log('// ── 10 códigos Beta Tester (30 días, un solo uso) ──');
console.log(JSON.stringify(codes, null, 2));
console.log('\n-- SQL de siembra (idempotente) --');
console.log('INSERT INTO public.activation_codes');
console.log('  (code, campaign, kind, duration_days, max_uses, used_count, status, subscription_plan, notes, expires_at)');
console.log('VALUES');
console.log(
  codes
    .map(
      (c) =>
        `  ('${c}', 'BETA_TESTER', 'GIFT', 30, 1, 0, 'AVAILABLE', 'beta_tester', 'BETA_TESTER · acceso 30 días', NOW() + INTERVAL '30 days')`
    )
    .join(',\n')
);
console.log('ON CONFLICT (code) DO NOTHING;');
