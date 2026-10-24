// Grows law 2 fixtures for /scene-check (dev): the scene's field, the paper's
// own detail, the moments and a side view, as the device does for its own sheets.
import { fixtureV2Bytes } from 'penpals-law/tools/fixtures-v2';
import { testPaperKey } from 'penpals-law/tools/fixtures';
import { lawOf } from 'penpals-law/laws';
import { paperDetail } from 'penpals-law/v2/scene';

const family = { grain: 8, weight: 8, tooth: 0 };
const L = lawOf(2);
const grown = new Map();
function grow(name) {
  if (!grown.has(name)) {
    const { rec } = fixtureV2Bytes(name);
    const paperKey = testPaperKey('golden');
    const cells = L.settledCells(L.grow(rec, { paperKey, family }).tiles);
    grown.set(name, { rec, paperKey, cells, box: L.boxOf(cells) });
  }
  return grown.get(name);
}

self.onmessage = ({ data: m }) => {
  try {
    const g = grow(m.name);
    if (m.type === 'field') {
      const field = L.sceneField(g.cells, g.box, m.view ?? {});
      const detail = paperDetail(g.paperKey, family, g.box);
      self.postMessage({ id: m.id, field, detail });
    } else if (m.type === 'moments') {
      self.postMessage({ id: m.id, ...L.momentsOf(g.rec, { paperKey: g.paperKey, family }, g.box) });
    } else if (m.type === 'side') {
      const pic = L.sideView(g.cells, { x0: m.a[0], y0: m.a[1], x1: m.b[0], y1: m.b[1] }, { px: 3 });
      self.postMessage({ id: m.id, ...pic });
    }
  } catch (err) {
    self.postMessage({ id: m.id, error: err.message });
  }
};
