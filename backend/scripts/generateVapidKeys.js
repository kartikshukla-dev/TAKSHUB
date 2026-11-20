// Prints a VAPID key pair for Web Push. Run once and put the lines in
// backend/.env on the server (keep the private key secret):
//   node scripts/generateVapidKeys.js
const webpush = require('web-push');

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log('VAPID_SUBJECT=mailto:info@oncarecancer.com');
