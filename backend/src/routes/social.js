import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { getAccount, updateAccount } from '../store/accounts.js';

export const socialRouter = Router();
socialRouter.use(requireAuth);

// My privacy setting.
socialRouter.get('/', (req, res) => {
  res.json({ private: !!getAccount(req.user.id).private });
});

// Private: off the homepage, and only its owner comes into the house or sees its book.
socialRouter.post('/private', async (req, res) => {
  const value = !!req.body?.private;
  await updateAccount(req.user.id, (a) => {
    a.private = value;
  });
  res.json({ private: value });
});
