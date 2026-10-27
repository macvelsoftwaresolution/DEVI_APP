/**
 * Dashboard operator accounts (R4). Run on the server, from backend/:
 *
 *   npm run admin:create  -- <username> [operator|supervisor]  # new account, prints a one-time password
 *   npm run admin:reset   -- <username>                        # new password + 2FA set up again at next login
 *   npm run admin:disable -- <username>                        # blocks the account (dashboard access ends at once)
 *   npm run admin:enable  -- <username>
 *
 * The printed password is shown once: hand it to the operator privately. At first sign-in the
 * dashboard shows a setup key to add to an authenticator app (Google / Microsoft Authenticator).
 */
import { AdminService } from '../src/services/admin.service.js';
import { hashPassword, generatePassword } from '../src/utils/password.js';

const [command, rawUsername, role = 'operator'] = process.argv.slice(2);
const username = String(rawUsername || '').trim().toLowerCase();

const fail = (msg) => {
  console.error(`❌ ${msg}`);
  process.exit(1);
};

if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
  fail('Username: 3-32 characters, letters, numbers, dot, dash or underscore. Example: npm run admin:create -- priya supervisor');
}

const existing = await AdminService.findByUsername(username);

switch (command) {
  case 'create': {
    if (!['operator', 'supervisor'].includes(role)) fail('Role must be operator or supervisor');
    if (existing) fail(`Account "${username}" already exists (use admin:reset for a new password)`);
    const password = generatePassword();
    await AdminService.create({ username, passwordHash: await hashPassword(password), role });
    await AdminService.audit({ username, action: 'account_created' });
    console.log(`✅ Created ${role} "${username}"`);
    console.log(`   One-time password: ${password}`);
    console.log('   Share it privately. 2FA is set up at the first dashboard sign-in.');
    break;
  }
  case 'reset': {
    if (!existing) fail(`No account "${username}"`);
    const password = generatePassword();
    await AdminService.setPassword(existing, await hashPassword(password), { resetTotp: true });
    await AdminService.audit({ admin: existing, action: 'account_reset' });
    console.log(`✅ Reset "${username}": new password ${password}`);
    console.log('   2FA must be set up again at the next sign-in.');
    break;
  }
  case 'disable':
  case 'enable': {
    if (!existing) fail(`No account "${username}"`);
    await AdminService.setActive(existing, command === 'enable');
    await AdminService.audit({ admin: existing, action: `account_${command}d` });
    console.log(`✅ "${username}" ${command}d`);
    break;
  }
  default:
    fail('Usage: npm run admin:create|admin:reset|admin:disable|admin:enable -- <username> [role]');
}
process.exit(0);
