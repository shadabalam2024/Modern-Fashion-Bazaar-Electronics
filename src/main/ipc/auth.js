const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const os = require('os');
const crypto = require('crypto');
const PUBLIC_KEY = require('../license-public-key');
const { setSession, checkPermission } = require('../session');

// Generate Machine ID from hardware
function generateMachineId() {
  const interfaces = os.networkInterfaces();
  let macAddress = '';
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        macAddress = iface.mac;
        break;
      }
    }
    if (macAddress) break;
  }

  const data = `${os.cpus()[0].model}${os.hostname()}${macAddress}`;
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
}

// Get license file path
function getLicensePath() {
  return path.join(app.getPath('userData'), 'license.json');
}

// Verify a license key's RSA signature and payload against this machine.
// Returns { valid, payload?, reason? }
function verifyLicenseSignature(machineId, licenseKey) {
  try {
    const [payloadPart, signaturePart] = String(licenseKey).split('.');
    if (!payloadPart || !signaturePart) return { valid: false, reason: 'Malformed license key' };

    const payloadJson = Buffer.from(payloadPart, 'base64url').toString('utf8');
    const signature = Buffer.from(signaturePart, 'base64url');

    const signatureValid = crypto.verify('sha256', Buffer.from(payloadJson), PUBLIC_KEY, signature);
    if (!signatureValid) return { valid: false, reason: 'Invalid license key' };

    const payload = JSON.parse(payloadJson);
    if (payload.machineId !== machineId) {
      return { valid: false, reason: 'This license key was issued for a different machine' };
    }
    if (payload.expiresAt && new Date(payload.expiresAt) < new Date()) {
      return { valid: false, reason: 'This license key has expired' };
    }

    return { valid: true, payload };
  } catch (error) {
    return { valid: false, reason: 'Invalid license key' };
  }
}

// Check if app is licensed - re-verifies the stored key's signature every time
// so a hand-edited license.json can't fake activation.
function checkLicense() {
  const machineId = generateMachineId();
  const licensePath = getLicensePath();
  if (!fs.existsSync(licensePath)) {
    return { licensed: false, machineId };
  }

  try {
    const stored = JSON.parse(fs.readFileSync(licensePath, 'utf8'));
    const result = verifyLicenseSignature(machineId, stored.licenseKey);
    return { licensed: result.valid, machineId };
  } catch (error) {
    return { licensed: false, machineId };
  }
}

// Verify and persist a license key
function verifyLicenseKey(machineId, licenseKey) {
  const result = verifyLicenseSignature(machineId, licenseKey);
  if (!result.valid) return result;

  const licensePath = getLicensePath();
  fs.writeFileSync(licensePath, JSON.stringify({ machineId, licenseKey, activatedAt: new Date().toISOString() }));
  return result;
}

// ---- Password reset by signed code ----
// The login screen shows a challenge (machineId-nonce). The developer signs it
// with tools/generateResetCode.js and the customer types the result back in.
// The nonce is persisted so it survives an app restart, and deleted once used,
// so each reset code works exactly once and only on this machine.
function getChallengePath() {
  return path.join(app.getPath('userData'), 'reset-challenge.json');
}

function createResetChallenge() {
  const nonce = crypto.randomBytes(4).toString('hex');
  fs.writeFileSync(getChallengePath(), JSON.stringify({ nonce, createdAt: new Date().toISOString() }));
  return `${generateMachineId()}-${nonce}`.toUpperCase();
}

function verifyResetCode(resetCode) {
  try {
    const challengePath = getChallengePath();
    if (!fs.existsSync(challengePath)) return { valid: false, reason: 'Click "Forgot password" first to get a new request code' };
    const { nonce } = JSON.parse(fs.readFileSync(challengePath, 'utf8'));

    const [payloadPart, signaturePart] = String(resetCode).trim().split('.');
    if (!payloadPart || !signaturePart) return { valid: false, reason: 'Malformed reset code' };

    const payloadJson = Buffer.from(payloadPart, 'base64url').toString('utf8');
    const signature = Buffer.from(signaturePart, 'base64url');
    if (!crypto.verify('sha256', Buffer.from(payloadJson), PUBLIC_KEY, signature)) {
      return { valid: false, reason: 'Invalid reset code' };
    }

    const payload = JSON.parse(payloadJson);
    if (payload.type !== 'password-reset') return { valid: false, reason: 'Invalid reset code' };
    if (payload.machineId !== generateMachineId()) return { valid: false, reason: 'This reset code was issued for a different computer' };
    if (payload.nonce !== nonce) return { valid: false, reason: 'This reset code does not match the current request code. Click "Forgot password" again only if you need a new one' };
    if (payload.expiresAt && new Date(payload.expiresAt) < new Date()) return { valid: false, reason: 'This reset code has expired' };

    return { valid: true };
  } catch (error) {
    return { valid: false, reason: 'Invalid reset code' };
  }
}

module.exports = (ipcMain, db) => {
  // Start a password reset: returns the request code the customer sends to the developer
  ipcMain.handle('get-reset-challenge', () => {
    try {
      return { success: true, challenge: createResetChallenge() };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Check a reset code and, if good, list accounts so the customer can pick theirs
  ipcMain.handle('verify-reset-code', (event, { resetCode }) => {
    const result = verifyResetCode(resetCode);
    if (!result.valid) return { success: false, message: result.reason };
    const users = db.prepare(`
      SELECT u.id, u.username, r.role_name FROM users u JOIN roles r ON u.role_id = r.id ORDER BY u.id
    `).all();
    return { success: true, users };
  });

  // Set the new password; the code is re-verified and then consumed
  ipcMain.handle('complete-password-reset', (event, { resetCode, userId, newPassword }) => {
    try {
      const result = verifyResetCode(resetCode);
      if (!result.valid) return { success: false, message: result.reason };
      if (!newPassword || String(newPassword).length < 4) {
        return { success: false, message: 'Password must be at least 4 characters' };
      }
      const info = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
        .run(bcrypt.hashSync(newPassword, 10), userId);
      if (info.changes === 0) return { success: false, message: 'User not found' };

      fs.unlinkSync(getChallengePath()); // single use
      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Check license on app start
  ipcMain.handle('check-license', () => {
    return checkLicense();
  });

  // Activate with license key
  ipcMain.handle('activate-license', (event, { machineId, licenseKey }) => {
    try {
      const result = verifyLicenseKey(machineId, licenseKey);
      if (result.valid) {
        return { success: true, message: 'License activated successfully' };
      }
      return { success: false, message: result.reason || 'Invalid license key' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // User login
  ipcMain.handle('user-login', (event, { username, password }) => {
    try {
      const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
      
      if (!user) {
        return { success: false, message: 'User not found' };
      }

      const validPassword = bcrypt.compareSync(password, user.password_hash);
      if (!validPassword) {
        return { success: false, message: 'Invalid password' };
      }

      // Get user role and permissions
      const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(user.role_id);
      const permissions = JSON.parse(role.permissions);

      // Record this window's session server-side so every future IPC call from it
      // can be checked against the real role, not whatever the renderer claims.
      setSession(event.sender.id, { userId: user.id, username: user.username, role: role.role_name, permissions });

      return {
        success: true,
        user: {
          id: user.id,
          username: user.username,
          role: role.role_name,
          permissions
        }
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Create first admin user (on app initialization)
  ipcMain.handle('create-admin', (event, { username, password, shopName }) => {
    try {
      // Check if admin exists
      const admin = db.prepare('SELECT COUNT(*) FROM users').get();
      if (admin['COUNT(*)'] > 0) {
        return { success: false, message: 'Admin already exists' };
      }

      const passwordHash = bcrypt.hashSync(password, 10);
      
      db.prepare('INSERT INTO users (username, password_hash, role_id) VALUES (?, ?, ?)')
        .run(username, passwordHash, 1); // Role 1 = Admin

      // Save shop settings
      db.prepare('INSERT INTO shop_settings (shop_name) VALUES (?)').run(shopName);

      return { success: true, message: 'Admin created successfully' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Check if admin exists
  ipcMain.handle('check-admin-exists', () => {
    try {
      const count = db.prepare('SELECT COUNT(*) as count FROM users').get();
      return count.count > 0;
    } catch (error) {
      return false;
    }
  });

  // Create new user (admin only)
  ipcMain.handle('create-user', (event, { username, password, roleId }) => {
    const denied = checkPermission(event, 'admin');
    if (denied) return denied;
    try {
      const passwordHash = bcrypt.hashSync(password, 10);
      db.prepare('INSERT INTO users (username, password_hash, role_id) VALUES (?, ?, ?)')
        .run(username, passwordHash, roleId);

      return { success: true, message: 'User created successfully' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Get all users
  ipcMain.handle('get-users', (event) => {
    const denied = checkPermission(event, 'admin');
    if (denied) return denied;
    try {
      const users = db.prepare(`
        SELECT u.id, u.username, u.role_id, r.role_name, u.created_at
        FROM users u
        JOIN roles r ON u.role_id = r.id
      `).all();

      return users;
    } catch (error) {
      return [];
    }
  });

  // Delete user
  ipcMain.handle('delete-user', (event, userId) => {
    const denied = checkPermission(event, 'admin');
    if (denied) return denied;
    try {
      db.prepare('DELETE FROM users WHERE id = ?').run(userId);
      return { success: true, message: 'User deleted' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });
};
