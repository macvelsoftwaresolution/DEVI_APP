// Creates the 2FA setup key for the .env admin (ADMIN_USERNAME + ADMIN_PASSWORD_HASH).
// Usage: npm run admin:2fa   (nothing is saved or sent anywhere)
//
// 1. Put the printed ADMIN_TOTP_SECRET line in backend/.env (replace an older one).
// 2. In an authenticator app (Google Authenticator, Microsoft Authenticator): + → Enter a setup key
//    → paste the key → Time based. Or open the otpauth link on the phone.
// 3. Restart the server. Sign in then asks for the password and the 6-digit code.
// A new key logs every open admin session out and the old code in the app stops working.
import { generateTotpSecret, otpauthUrl } from '../src/utils/totp.js';

const username = (process.env.ADMIN_USERNAME || process.argv[2] || 'admin').trim();
const secret = generateTotpSecret();

console.log('\nAdd this line to backend/.env (replace any older ADMIN_TOTP_SECRET line):\n');
console.log(`ADMIN_TOTP_SECRET=${secret}\n`);
console.log('In the authenticator app: + → Enter a setup key → Time based');
console.log(`  Account: DEVI Admin (${username})`);
console.log(`  Key:     ${secret.match(/.{1,4}/g).join(' ')}`);
console.log(`  Or as a link: ${otpauthUrl(username, secret)}\n`);
console.log('Shown only now. Keep it in a password manager: losing it locks the .env admin out until a new key is made.\n');
