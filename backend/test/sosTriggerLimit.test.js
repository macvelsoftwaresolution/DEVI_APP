import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { sosTriggerLimiter } from '../src/middlewares/rateLimiter.js';

test('the SOS limiter never refuses a request: past the limit it only marks it', async () => {
  const app = express();
  app.post('/trigger', sosTriggerLimiter, (req, res) => res.json({ over: !!req.sosOverIpLimit }));
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/trigger`;

  try {
    const seen = [];
    for (let i = 0; i < 32; i += 1) {
      const res = await fetch(url, { method: 'POST' });
      assert.equal(res.status, 200);
      seen.push((await res.json()).over);
    }
    assert.equal(seen.at(29), false);
    assert.equal(seen.at(30), true);
    assert.equal(seen.at(31), true);
  } finally {
    server.close();
  }
});
