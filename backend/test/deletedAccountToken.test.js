import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessions, DELETED_VERSION } from '../src/services/sessions.service.js';
import { createAccountDeletion } from '../src/services/accountDeletion.service.js';

// A deleted account's tokens must stop. Before, a user with no row read as "unknown" (like the
// database being down), so the token was accepted and could, for example, save a profile again.

const versionsDb = (rows) => ({
  from: () => {
    let id;
    const chain = {
      select: () => chain,
      eq: (_k, v) => { id = v; return chain; },
      maybeSingle: async () => ({ data: rows[id] ?? null, error: null }),
    };
    return chain;
  },
});

test('a user with no row has the deleted version, which no token carries', async () => {
  const s = createSessions({ db: versionsDb({ u1: { token_version: 0 } }) });
  assert.equal(await s.userTokenVersion('u1'), 0);
  assert.equal(await s.userTokenVersion('gone'), DELETED_VERSION);
  s.forgetUser('u1');
  assert.equal(await s.userTokenVersion('u1'), DELETED_VERSION, 'at once on this server, despite the cache');
});

test('deleting the account stops its tokens', async () => {
  const tables = { users: [{ id: 'u1' }], sos_history: [] };
  const db = {
    from: (t) => {
      const chain = {
        select: () => chain,
        delete: () => { tables[t] = []; return chain; },
        eq: () => chain,
        maybeSingle: async () => ({ data: tables[t][0] ?? null, error: null }),
        then: (ok) => Promise.resolve({ data: tables[t], error: null }).then(ok),
      };
      return chain;
    },
  };
  const forgotten = [];
  const service = createAccountDeletion({ db, sessions: { delete() {} }, tokens: { forgetUser: (id) => forgotten.push(id) } });
  assert.equal((await service.deleteAccount('u1')).ok, true);
  assert.deepEqual(forgotten, ['u1']);
});
