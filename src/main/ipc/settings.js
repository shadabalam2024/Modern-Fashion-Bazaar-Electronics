const fs = require('fs');
const path = require('path');
const { app, dialog } = require('electron');
const { checkPermission } = require('../session');

const LOGO_MIME_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };

module.exports = (ipcMain, db) => {
  // Let the user pick an image file, copy it into userData, and save the path
  ipcMain.handle('select-shop-logo', async (event) => {
    const denied = checkPermission(event, 'settings');
    if (denied) return denied;
    try {
      const result = await dialog.showOpenDialog({
        title: 'Select Company Logo',
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, canceled: true };
      }

      const sourcePath = result.filePaths[0];
      const ext = path.extname(sourcePath).toLowerCase();
      const destPath = path.join(app.getPath('userData'), `shop-logo${ext}`);
      fs.copyFileSync(sourcePath, destPath);

      const existing = db.prepare('SELECT COUNT(*) as count FROM shop_settings').get();
      if (existing.count === 0) {
        db.prepare('INSERT INTO shop_settings (logo_path) VALUES (?)').run(destPath);
      } else {
        db.prepare('UPDATE shop_settings SET logo_path = ? WHERE id = 1').run(destPath);
      }

      return { success: true, logoPath: destPath };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Read the current logo file and return it as a data URL (works uniformly in dev/prod/print window)
  ipcMain.handle('get-shop-logo', () => {
    try {
      const settings = db.prepare('SELECT logo_path FROM shop_settings WHERE id = 1').get();
      if (!settings?.logo_path || !fs.existsSync(settings.logo_path)) {
        return null;
      }
      const ext = path.extname(settings.logo_path).toLowerCase();
      const mime = LOGO_MIME_TYPES[ext] || 'image/png';
      const data = fs.readFileSync(settings.logo_path).toString('base64');
      return `data:${mime};base64,${data}`;
    } catch (error) {
      return null;
    }
  });

  // Remove the saved logo
  ipcMain.handle('remove-shop-logo', (event) => {
    const denied = checkPermission(event, 'settings');
    if (denied) return denied;
    try {
      const settings = db.prepare('SELECT logo_path FROM shop_settings WHERE id = 1').get();
      if (settings?.logo_path && fs.existsSync(settings.logo_path)) {
        fs.unlinkSync(settings.logo_path);
      }
      db.prepare('UPDATE shop_settings SET logo_path = NULL WHERE id = 1').run();
      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Get shop settings
  ipcMain.handle('get-shop-settings', () => {
    try {
      const settings = db.prepare('SELECT * FROM shop_settings WHERE id = 1').get();
      return settings || {};
    } catch (error) {
      return {};
    }
  });

  // Update shop settings
  ipcMain.handle('update-shop-settings', (event, settings) => {
    const denied = checkPermission(event, 'settings');
    if (denied) return denied;
    try {
      const existing = db.prepare('SELECT COUNT(*) as count FROM shop_settings').get();

      if (existing.count === 0) {
        db.prepare(`
          INSERT INTO shop_settings
          (shop_name, shop_address, shop_phone, shop_email, gst_number, gst_rate, payment_terms, return_policy)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          settings.shop_name,
          settings.shop_address,
          settings.shop_phone,
          settings.shop_email,
          settings.gst_number,
          settings.gst_rate || 0,
          settings.payment_terms,
          settings.return_policy
        );
      } else {
        db.prepare(`
          UPDATE shop_settings SET
          shop_name = ?, shop_address = ?, shop_phone = ?, shop_email = ?,
          gst_number = ?, gst_rate = ?, payment_terms = ?, return_policy = ?
          WHERE id = 1
        `).run(
          settings.shop_name,
          settings.shop_address,
          settings.shop_phone,
          settings.shop_email,
          settings.gst_number,
          settings.gst_rate || 0,
          settings.payment_terms,
          settings.return_policy
        );
      }

      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Get all roles
  ipcMain.handle('get-roles', () => {
    try {
      const roles = db.prepare('SELECT * FROM roles').all();
      return roles.map(r => ({
        ...r,
        permissions: JSON.parse(r.permissions)
      }));
    } catch (error) {
      return [];
    }
  });

  // Update role permissions
  ipcMain.handle('update-role-permissions', (event, { roleId, permissions }) => {
    const denied = checkPermission(event, 'admin');
    if (denied) return denied;
    try {
      db.prepare('UPDATE roles SET permissions = ? WHERE id = ?')
        .run(JSON.stringify(permissions), roleId);

      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Reset password (admin only)
  ipcMain.handle('reset-password', (event, { userId, newPassword }) => {
    const denied = checkPermission(event, 'admin');
    if (denied) return denied;
    try {
      const bcrypt = require('bcryptjs');
      const passwordHash = bcrypt.hashSync(newPassword, 10);

      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
        .run(passwordHash, userId);

      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });
};
