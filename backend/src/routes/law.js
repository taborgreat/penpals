import { Router } from 'express';
import { config } from '../config.js';
import { v1, fuzzy, unlock } from 'penpals-law';

// What a device needs to know to write by this server's law.
export const lawRouter = Router();

lawRouter.get('/', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    law: config.law,
    renderRev: config.render.rev,
    hand: {
      version: v1.HAND_VERSION,
      unfrozen: v1.LAW_HAND_UNFROZEN, // true until real hands set the radii (law/lab/freeze.js)
      radii: { phrase: v1.PHRASE_RADIUS, page: v1.PAGE_RADIUS },
      codes: { phrase: fuzzy.code('phrase').id, page: fuzzy.code('page').id },
      phraseCap: config.unlock.phraseCap,
      pageCap: config.unlock.pageCap,
    },
    kdf: unlock.KDF,
    caps: {
      maxActsBytes: config.book.maxActsBytes,
      maxSignatureActsBytes: config.book.maxSignatureActsBytes,
      maxLetterActsBytes: config.book.maxLetterActsBytes,
      scale: { min: 4, max: 640, one: 64 },
      maxCells: config.render.maxCells,
    },
  });
});
