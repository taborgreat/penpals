import { MongoClient } from 'mongodb';
import { config } from './config.js';

const client = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 5000 });

try {
  await client.connect();
} catch (err) {
  console.error(`Could not connect to MongoDB at ${config.mongoUri}\n${err.message}`);
  console.error('Start MongoDB or set MONGODB_URI.');
  process.exit(1);
}

const db = client.db();

// users:       { _id, username, usernameLower, passwordHash, createdAt, private, blocked: [userId] }
// sessions:    { _id: token, userId, createdAt }            (TTL index expires them)
// letters:     { _id: id, senderId, from, width, height, bytes, inkColor, paper, source,
//                createdAt, inkDeleted, savedBy: [{ userId, at }], upvotes: [userId], upvoteCount,
//                recipientId, to, sentAt, openedAt, expiresAt }   (null until sent)
// friendships: { _id, key: 'idA:idB' (sorted), users: [idA, idB], requester,
//                status: 'pending' | 'accepted', createdAt, acceptedAt }
export const users = db.collection('users');
export const sessions = db.collection('sessions');
export const letters = db.collection('letters');
export const friendships = db.collection('friendships');

await Promise.all([
  users.createIndex({ usernameLower: 1 }, { unique: true }),
  users.createIndex({ blocked: 1 }),
  sessions.createIndex({ createdAt: 1 }, { expireAfterSeconds: config.sessionTtlMs / 1000 }),
  letters.createIndex({ recipientId: 1, expiresAt: 1 }),
  letters.createIndex({ senderId: 1, sentAt: -1 }),
  letters.createIndex({ expiresAt: 1, inkDeleted: 1 }),
  letters.createIndex({ 'savedBy.userId': 1 }),
  letters.createIndex({ upvoteCount: -1 }),
  friendships.createIndex({ key: 1 }, { unique: true }),
  friendships.createIndex({ users: 1, status: 1 }),
]);

export const closeDb = () => client.close();
