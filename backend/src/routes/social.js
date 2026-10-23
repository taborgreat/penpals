import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { getAccount, nameOf, updateAccount } from '../store/accounts.js';

export const socialRouter = Router();
socialRouter.use(requireAuth);

const names = (ids) => ids.map(nameOf).filter(Boolean).sort();

// My friends, requests and blocks, plus my privacy setting.
socialRouter.get('/', (req, res) => {
  const me = getAccount(req.user.id);
  res.json({
    private: !!me.private,
    friends: names(me.friends),
    incoming: names(me.incoming),
    outgoing: names(me.outgoing),
    blocked: names(me.blocked),
  });
});

// Private: off the homepage, and only friends can see the profile or write to it.
socialRouter.post('/private', async (req, res) => {
  const value = !!req.body?.private;
  await updateAccount(req.user.id, (a) => { a.private = value; });
  res.json({ private: value });
});
