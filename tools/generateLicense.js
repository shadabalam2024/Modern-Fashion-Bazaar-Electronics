// Run by the developer to mint a license key for one customer's machine.
// Usage: node tools/generateLicense.js <machineId> [expiryDays]
//   machineId  - shown on the customer's Activation screen, they send it to you
//   expiryDays - optional; omit for a perpetual license, or e.g. 365 for a 1-year one
//
// Requires tools/private-key.pem (see generateKeypair.js). Never runs inside
// the shipped app — this file is a developer-only tool.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const [, , machineId, expiryDaysArg] = process.argv;

if (!machineId) {
  console.error('Usage: node tools/generateLicense.js <machineId> [expiryDays]');
  process.exit(1);
}

const privateKeyPath = path.join(__dirname, 'private-key.pem');
if (!fs.existsSync(privateKeyPath)) {
  console.error('tools/private-key.pem not found. Run "node tools/generateKeypair.js" once first.');
  process.exit(1);
}
const privateKey = fs.readFileSync(privateKeyPath, 'utf8');

const expiryDays = expiryDaysArg ? parseInt(expiryDaysArg, 10) : null;
const payload = {
  machineId,
  issuedAt: new Date().toISOString(),
  expiresAt: expiryDays ? new Date(Date.now() + expiryDays * 86400000).toISOString() : null,
};

const payloadJson = JSON.stringify(payload);
const signature = crypto.sign('sha256', Buffer.from(payloadJson), privateKey);
const licenseKey = `${Buffer.from(payloadJson).toString('base64url')}.${signature.toString('base64url')}`;

console.log('Payload:', payload);
console.log('\nLicense Key (send this to the customer to paste into Activation):\n');
console.log(licenseKey);
