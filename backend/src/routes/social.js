import { Router } from 'express';
import { users, friendships } from '../db.js';
import { requireAuth } from '../auth.js';

export const socialRouter = Router();
socialRouter.use(requireAuth);

// My friends, requests and blocks, plus my privacy setting.
socialRouter.get('/', async (req, res) => {
  const me = req.user.id;
  const [rows, meDoc] = await Promise.all([
    friendships.find({ users: me }).toArray(),
    users.findOne({ _id: me }, { projection: { private: 1, blocked: 1 } }),
  ]);
  const other = (r) => r.users.find((u) => !u.equals(me));
  const ids = [...rows.map(other), ...(meDoc.blocked ?? [])];
  const named = await users.find({ _id: { $in: ids } }, { projection: { username: 1 } }).toArray();
  const name = (id) => named.find((u) => u._id.equals(id))?.username;
  const pick = (test) => rows.filter(test).map((r) => name(other(r))).filter(Boolean).sort();
  res.json({
    private: !!meDoc.private,
    friends: pick((r) => r.status === 'accepted'),
    incoming: pick((r) => r.status === 'pending' && !r.requester.equals(me)),
    outgoing: pick((r) => r.status === 'pending' && r.requester.equals(me)),
    blocked: (meDoc.blocked ?? []).map(name).filter(Boolean).sort(),
  });
});

// Private: off the homepage, and only friends can see the profile or write to it.
socialRouter.post('/private', async (req, res) => {
  const value = !!req.body?.private;
  await users.updateOne({ _id: req.user.id }, { $set: { private: value } });
  res.json({ private: value });
});
