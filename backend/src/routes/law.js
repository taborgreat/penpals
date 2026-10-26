import { Router } from 'express';
import { config } from '../config.js';
import { unlock } from 'penpals-law';

// What a device needs to know to write by this server's law.
export const lawRouter = Router();

lawRouter.get('/', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    law: config.law,
    renderRev: config.render.rev,
    kdf: unlock.KDF, // the password backup's stretch
    caps: {
      maxActsBytes: config.book.maxActsBytes,
      maxSignatureActsBytes: config.book.maxSignatureActsBytes,
      scale: { min: 4, max: 640, one: 64 },
      maxCells: config.render.maxCells,
    },
  });
});
