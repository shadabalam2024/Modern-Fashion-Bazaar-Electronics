// Run by the developer to answer a customer's "Forgot password" request.
// Usage: node tools/generateResetCode.js <requestCode> [expiryHours]
//   requestCode - shown on the customer's "Forgot password" screen (MACHINEID-NONCE)
//   expiryHours - optional, defaults to 24
//
// The resulting code only works on that machine, for that one request, once.
// Requires tools/private-key.pem. Never runs inside the shipped app.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const [, , requestCodeArg, expiryHoursArg] = process.argv;

const match = /^([0-9a-f]{16})-([0-9a-f]{8})$/i.exec(String(requestCodeArg || '').trim());
if (!match) {
  console.error('Usage: node tools/generateResetCode.js <requestCode> [expiryHours]');
  console.error('requestCode looks like 1A2B3C4D5E6F7A8B-9C0D1E2F');
  process.exit(1);
}

const privateKeyPath = path.join(__dirname, 'private-key.pem');
if (!fs.existsSync(privateKeyPath)) {
  console.error('tools/private-key.pem not found. Run "node tools/generateKeypair.js" once first.');
  process.exit(1);
}
const privateKey = fs.readFileSync(privateKeyPath, 'utf8');

const expiryHours = expiryHoursArg ? parseFloat(expiryHoursArg) : 24;
const payload = {
  type: 'password-reset',
  machineId: match[1].toLowerCase(),
  nonce: match[2].toLowerCase(),
  issuedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + expiryHours * 3600000).toISOString(),
};

const payloadJson = JSON.stringify(payload);
const signature = crypto.sign('sha256', Buffer.from(payloadJson), privateKey);
const resetCode = `${Buffer.from(payloadJson).toString('base64url')}.${signature.toString('base64url')}`;

console.log('Payload:', payload);
console.log('\nReset Code (send this to the customer):\n');
console.log(resetCode);
