import { one, run } from '../server/db';
const email = process.argv[2]?.trim().toLowerCase();
if (!email || !email.includes('@'))
  throw Error('Usage: npm run admin -- your-existing-account@example.com');
const user = one<any>("SELECT id FROM users WHERE email=? AND kind='account'", email);
if (!user) throw Error('Create the intended administrator account in the app first.');
run('UPDATE users SET admin=1 WHERE id=?', user.id);
console.log(
  'Administrator authorization granted to the selected existing account. Sign in again to open Preferences → Catalog administration.',
);
