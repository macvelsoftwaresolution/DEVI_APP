// Dashboard accounts, one per operator, each with 2FA (db/login-security.sql must be run first).
//
//   npm run admin:user -- create <username>         new account: prints a password and a 2FA setup key
//   npm run admin:user -- list                      every account
//   npm run admin:user -- reset-password <username> new password, and signs the account out everywhere
//   npm run admin:user -- reset-2fa <username>      new 2FA setup key (lost phone), and signs out everywhere
//   npm run admin:user -- signout <username>        ends every session of the account
//   npm run admin:user -- disable <username>        no more sign in, open sessions end within a minute
//   npm run admin:user -- enable <username>
//
// Passwords and setup keys are printed once, here, and never stored in plain text. Give them to the
// operator in person or over a channel you trust. The operator adds the setup key in an
// authenticator app (Google Authenticator, Microsoft Authenticator: "Enter a setup key", time based).
// When every operator has an account, set ADMIN_ENV_LOGIN=off in .env to retire the shared login.
import crypto from 'crypto';
import { supabase } from '../src/config/supabase.js';
import { hashPassword } from '../src/utils/password.js';
import { generateTotpSecret, otpauthUrl } from '../src/utils/totp.js';
import { encryptTotpSecret } from '../src/services/sessions.service.js';

const [command, rawName] = process.argv.slice(2);
const username = String(rawName || '').trim().toLowerCase();
const TABLE = 'admin_users';

const die = (message) => {
  console.error(`❌ ${message}`);
  process.exit(1);
};

// 24 characters from 144 random bits
const newPassword = () => crypto.randomBytes(18).toString('base64url');

const grouped = (key) => key.match(/.{1,4}/g).join(' ');

const findAccount = async () => {
  if (!username) die('Give a username, e.g. npm run admin:user -- create ravi');
  const { data, error } = await supabase.from(TABLE).select('*').eq('username', username).maybeSingle();
  if (error) die(`${error.message}${error.code === '42P01' || error.code === 'PGRST205' ? ' (run db/login-security.sql first)' : ''}`);
  return data;
};

const update = async (id, values) => {
  const { error } = await supabase.from(TABLE).update(values).eq('id', id);
  if (error) die(error.message);
};

const printSecrets = ({ password, secret }) => {
  if (password) console.log(`\n  Password:   ${password}`);
  if (secret) {
    console.log(`  2FA setup key (time based, 6 digits): ${grouped(secret)}`);
    console.log(`  Or as a QR link: ${otpauthUrl(username, secret)}`);
  }
  console.log('\n  Shown only now. Hand it over in person or over a channel you trust.\n');
};

const commands = {
  async create() {
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) die('Username: 3 to 40 of a-z, 0-9, dot, dash, underscore');
    if (await findAccount()) die(`${username} already exists`);
    const id = crypto.randomUUID();
    const password = newPassword();
    const secret = generateTotpSecret();
    const { error } = await supabase.from(TABLE).insert({
      id,
      username,
      password_hash: await hashPassword(password),
      totp_secret: encryptTotpSecret(secret, id),
    });
    if (error) die(error.message);
    console.log(`✅ Created ${username}`);
    printSecrets({ password, secret });
  },

  async list() {
    const { data, error } = await supabase.from(TABLE).select('username, disabled, created_at, last_login_at').order('username');
    if (error) die(error.message);
    if (!data?.length) return console.log('No accounts yet. Create one with: npm run admin:user -- create <username>');
    for (const a of data) {
      console.log(`${a.disabled ? '⛔' : '✅'} ${a.username.padEnd(24)} created ${a.created_at?.slice(0, 10)}  last sign in ${a.last_login_at?.slice(0, 16).replace('T', ' ') || 'never'}`);
    }
  },

  async 'reset-password'() {
    const a = (await findAccount()) || die(`${username} not found`);
    const password = newPassword();
    await update(a.id, { password_hash: await hashPassword(password), token_version: (a.token_version || 0) + 1 });
    console.log(`✅ New password for ${username}; old sessions end within a minute`);
    printSecrets({ password });
  },

  async 'reset-2fa'() {
    const a = (await findAccount()) || die(`${username} not found`);
    const secret = generateTotpSecret();
    await update(a.id, { totp_secret: encryptTotpSecret(secret, a.id), token_version: (a.token_version || 0) + 1 });
    console.log(`✅ New 2FA setup key for ${username}; the old one stops working and old sessions end within a minute`);
    printSecrets({ secret });
  },

  async signout() {
    const a = (await findAccount()) || die(`${username} not found`);
    await update(a.id, { token_version: (a.token_version || 0) + 1 });
    console.log(`✅ ${username} is signed out everywhere within a minute`);
  },

  async disable() {
    const a = (await findAccount()) || die(`${username} not found`);
    await update(a.id, { disabled: true, token_version: (a.token_version || 0) + 1 });
    console.log(`⛔ ${username} disabled; open sessions end within a minute`);
  },

  async enable() {
    const a = (await findAccount()) || die(`${username} not found`);
    await update(a.id, { disabled: false });
    console.log(`✅ ${username} enabled`);
  },
};

if (!commands[command]) die(`Commands: ${Object.keys(commands).join(', ')}`);
await commands[command]();
process.exit(0);
