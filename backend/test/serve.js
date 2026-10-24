// A server in its own process, for the crash tests (a crash point exits the
// process, which must not be the test runner's). Prints its port once it listens.
import { createApp } from '../src/app.js';

const { app } = await createApp();
const server = app.listen(0, '127.0.0.1', () => process.stdout.write(`port ${server.address().port}\n`));
server.keepAliveTimeout = 120_000;
