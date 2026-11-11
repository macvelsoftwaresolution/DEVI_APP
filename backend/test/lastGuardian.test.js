import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import userRoutes from '../src/routes/user.routes.js';
import { sessions } from '../src/services/sessions.service.js';
import { UserService } from '../src/services/user.service.js';
import { signUserToken } from '../src/middlewares/auth.middleware.js';

// A signed-in user cannot save an empty guardian list: an SOS with no guardian reaches nobody.

test('saving no guardians is refused for a signed-in user; one guardian is saved', async () => {
  const realVersion = sessions.userTokenVersion;
  const realUpdate = UserService.updateUserProfile;
  const saved = [];
  sessions.userTokenVersion = async () => 0;
  UserService.updateUserProfile = async (phone, fields) => { saved.push(fields.guardians); return { id: 'u1', phone }; };
  const app = express();
  app.use(express.json());
  app.use('/api/user', userRoutes);
  const server = app.listen(0);
  try {
    const token = signUserToken({ id: 'u1', name: 'Priya' }, '+919876543210', 0);
    const put = (guardians) => fetch(`http://127.0.0.1:${server.address().port}/api/user/profile`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ phone: '+919876543210', guardians }),
    });

    const empty = await put([]);
    assert.equal(empty.status, 400);
    assert.match((await empty.json()).message, /at least one guardian/);
    assert.equal(saved.length, 0);

    assert.equal((await put([{ name: 'Amma', phone: '+919876543211' }])).status, 200);
    assert.equal(saved.length, 1);
  } finally {
    server.close();
    sessions.userTokenVersion = realVersion;
    UserService.updateUserProfile = realUpdate;
  }
});
