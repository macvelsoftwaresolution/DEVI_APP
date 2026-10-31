// Creates ADMIN_PASSWORD_HASH for backend/.env (admin dashboard login).
// Usage: npm run admin:hash   (asks for the password twice; nothing is saved or sent anywhere)
// Paste the printed line into .env, remove any ADMIN_PASSWORD line, then restart the server.
// A new hash logs every open admin session out.
import readline from 'readline';
import { hashPassword, passwordProblems } from '../src/utils/password.js';

// One terminal reader for both questions; typed characters are not echoed.
// Lines are queued so piped input (both lines at once) works too.
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
rl._writeToOutput = () => {};
const lines = [];
let waiting = null;
rl.on('line', (line) => {
  if (waiting) {
    const resolve = waiting;
    waiting = null;
    resolve(line);
  } else {
    lines.push(line);
  }
});
const askHidden = async (question) => {
  process.stdout.write(question);
  const answer = lines.length ? lines.shift() : await new Promise((resolve) => { waiting = resolve; });
  process.stdout.write('\n');
  return answer;
};

const username = (process.env.ADMIN_USERNAME || process.argv[2] || '').trim();
const password = await askHidden('New admin password: ');
const problems = passwordProblems(password, username);
if (problems.length) {
  rl.close();
  console.error(`❌ Password ${problems.join('; ')}.`);
  process.exit(1);
}
const again = await askHidden('Type it again: ');
rl.close();
if (again !== password) {
  console.error('❌ The two passwords do not match.');
  process.exit(1);
}

console.log('\nAdd this line to backend/.env (and delete ADMIN_PASSWORD if it is there):\n');
console.log(`ADMIN_PASSWORD_HASH=${await hashPassword(password)}\n`);
