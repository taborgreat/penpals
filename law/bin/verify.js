#!/usr/bin/env node
// Verify a .book or a proof bundle offline, with nothing but this repository.
//   node law/bin/verify.js <file.book | proof.json> [--json] [--no-regrow]
// Exit code 0 when everything checks, 1 when something does not.
import fs from 'node:fs';
import { verifyBook, verifyProof } from '../verify.js';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) {
  console.error('usage: node law/bin/verify.js <file.book | proof.json> [--json] [--no-regrow]');
  process.exit(2);
}
const text = fs.readFileSync(file, 'utf8');
const regrowOpen = !args.includes('--no-regrow');
let report;
try {
  const first = JSON.parse(text.split('\n')[0]);
  report = first.proof === 1 ? { type: 'proof', ...verifyProof(JSON.parse(text), { regrowOpen }) } : { type: 'book', ...verifyBook(text, { regrowOpen }) };
} catch (err) {
  report = { type: 'unknown', ok: false, problems: [`cannot read ${file}: ${err.message}`] };
}
if (args.includes('--json')) console.log(JSON.stringify(report, null, 1));
else if (report.type === 'book') {
  console.log(`${report.name}  key ${report.key}  (${report.fingerprint})`);
  for (const r of report.results) {
    const what = r.error ? `FAILS: ${r.error}` : [r.sealed && 'sealed', r.open && 'open', r.regrown === true && 'regrown', r.regrown === false && 'DOES NOT REGROW'].filter(Boolean).join(', ');
    console.log(`  ${r.id}  ${(r.use ?? r.kind ?? '').padEnd(9)} ${String(r.sheet ?? '').padEnd(27)} ${what}`);
  }
  for (const p of report.problems) console.log(`  problem: ${p}`);
  console.log(report.ok ? 'the book checks' : 'THE BOOK DOES NOT CHECK');
} else {
  for (const p of report.problems) console.log(`problem: ${p}`);
  console.log(report.ok ? `the proof checks${report.regrown ? ' and regrows' : ''}` : 'THE PROOF DOES NOT CHECK');
}
process.exit(report.ok ? 0 : 1);
