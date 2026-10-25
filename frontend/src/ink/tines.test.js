// The pen's nib (rooms.md §3c, Tests: Pens): pressing spreads the two tines in step with
// the line's width: the tines open as wide as the law lays the line, and the grown line is
// that wide, plus the little the wet ink spreads, at every pressure.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lineWidthPx } from './pens.js';
import { lawOf } from 'penpals-law/laws';
import { record, samplePath, PENS, testPaperKey } from 'penpals-law/tools/fixtures';

test('pressed harder the tines spread, as wide as the line the law lays', () => {
  const L = lawOf(2);
  const widths = [0.15, 0.5, 0.9].map((p) => {
    // a stroke down the page (the flex nib's tines spread across it, along x)
    const rec = record(
      [
        {
          path: samplePath(
            (u) => [0, u * 200],
            () => 60,
            { pressure: () => p },
          ),
          pen: PENS.flex,
          start: 0,
          hasP: true,
        },
      ],
      [10, 10],
    );
    const cells = L.settledCells(L.grow(L.decodeCanonical(L.encodeActs(rec)), { paperKey: testPaperKey('tines'), family: { grain: 8, weight: 8, tooth: 0 } }).tiles);
    const ys = cells.map((c) => c[0]);
    const mid = Math.round((Math.min(...ys) + Math.max(...ys)) / 2);
    const row = cells.filter((c) => c[0] === mid && c[2] + c[3] + c[4] > 200).map((c) => c[1]);
    return { tines: lineWidthPx(PENS.flex, Math.round(p * 255)), line: (Math.max(...row) - Math.min(...row) + 1) / 2 };
  });
  for (let i = 1; i < widths.length; i++) assert.ok(widths[i].tines > widths[i - 1].tines && widths[i].line > widths[i - 1].line, 'pressed harder, both wider');
  for (const w of widths) assert.ok(w.line >= w.tines && w.line <= w.tines + 3, `the line as wide as the tines (and the wet spread): ${JSON.stringify(w)}`);
  // a round nib widens a little with pressure, a broad edge not at all
  assert.ok(lineWidthPx({ nib: 0, size: 50 }, 255) > lineWidthPx({ nib: 0, size: 50 }, 0));
  assert.equal(lineWidthPx({ nib: 2, size: 160 }, 0), lineWidthPx({ nib: 2, size: 160 }, 255));
});
