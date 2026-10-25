const fs = require('fs');
const path = require('path');
const { app, dialog } = require('electron');
const { checkPermission, requireLoginOrTrusted } = require('../session');

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

  // Read the current logo file and return it as a data URL (works uniformly in dev/prod/print window).
  // Login-or-trusted, not permission-gated: needed by the Sidebar (any logged-in role)
  // and by the standalone invoice-print window, which has no login session of its own.
  ipcMain.handle('get-shop-logo', (event) => {
    const denied = requireLoginOrTrusted(event);
    if (denied) return denied;
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

  // Get shop settings. Login-or-trusted (see get-shop-logo above) - also needed by
  // Billing (GST rate) and the invoice-print window.
  ipcMain.handle('get-shop-settings', (event) => {
    const denied = requireLoginOrTrusted(event);
    if (denied) return denied;
    try {
      const settings = db.prepare('SELECT * FROM shop_settings WHERE id = 1').get();
      return settings || {};
    } catch (error) {
      return {};
    }
  });

  // Update shop settings. One column list drives both the first-time insert and later updates,
  // so a setting is added in exactly one place.
  const SETTING_TEXT_COLUMNS = [
    'shop_name', 'shop_address', 'shop_phone', 'shop_email', 'gst_number', 'payment_terms', 'return_policy',
    'pan_number', 'place_of_supply', 'bank_account_name', 'bank_name', 'bank_account_no', 'bank_ifsc'
  ];
  ipcMain.handle('update-shop-settings', (event, settings) => {
    const denied = checkPermission(event, 'settings');
    if (denied) return denied;
    try {
      const values = {
        ...Object.fromEntries(SETTING_TEXT_COLUMNS.map(c => [c, settings[c] ?? null])),
        gst_rate: Number(settings.gst_rate) || 0,
        prices_include_gst: settings.prices_include_gst ? 1 : 0,
        thermal_printing_enabled: settings.thermal_printing_enabled ? 1 : 0,
        thermal_printer_name: settings.thermal_printer_name || null,
        thermal_paper_width: settings.thermal_paper_width || 80
      };
      const columns = Object.keys(values);

      const existing = db.prepare('SELECT COUNT(*) as count FROM shop_settings').get();
      if (existing.count === 0) {
        db.prepare(`INSERT INTO shop_settings (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
          .run(...columns.map(c => values[c]));
      } else {
        db.prepare(`UPDATE shop_settings SET ${columns.map(c => `${c} = ?`).join(', ')} WHERE id = 1`)
          .run(...columns.map(c => values[c]));
      }

      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Get all roles
  ipcMain.handle('get-roles', (event) => {
    const denied = checkPermission(event, 'admin');
    if (denied) return denied;
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
