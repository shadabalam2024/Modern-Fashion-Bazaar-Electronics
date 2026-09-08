const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { dialog } = require('electron');
const { checkPermission } = require('../session');

module.exports = (ipcMain, db) => {
  // Create backup
  ipcMain.handle('create-backup', async (event) => {
    const denied = checkPermission(event, 'admin');
    if (denied) return denied;
    try {
      const dbPath = path.join(app.getPath('userData'), 'shop.db');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = path.join(app.getPath('userData'), 'backups');

      // Create backups directory if it doesn't exist
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const backupPath = path.join(backupDir, `shop-backup-${timestamp}.db`);

      // Copy database file
      fs.copyFileSync(dbPath, backupPath);

      return { success: true, backupPath, message: 'Backup created successfully' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // List backups
  ipcMain.handle('list-backups', (event) => {
    const denied = checkPermission(event, 'admin');
    if (denied) return denied;
    try {
      const backupDir = path.join(app.getPath('userData'), 'backups');

      if (!fs.existsSync(backupDir)) {
        return [];
      }

      const files = fs.readdirSync(backupDir);
      const backups = files
        .filter(f => f.endsWith('.db'))
        .map(f => {
          const filePath = path.join(backupDir, f);
          const stats = fs.statSync(filePath);
          return {
            filename: f,
            path: filePath,
            size: stats.size,
            createdAt: stats.birthtime
          };
        })
        .sort((a, b) => b.createdAt - a.createdAt);

      return backups;
    } catch (error) {
      return [];
    }
  });

  // Restore backup
  ipcMain.handle('restore-backup', (event, backupPath) => {
    const denied = checkPermission(event, 'admin');
    if (denied) return denied;
    try {
      const dbPath = path.join(app.getPath('userData'), 'shop.db');

      // Create backup of current database before restoring
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = path.join(app.getPath('userData'), 'backups');
      const currentBackup = path.join(backupDir, `shop-backup-before-restore-${timestamp}.db`);

      if (fs.existsSync(dbPath)) {
        fs.copyFileSync(dbPath, currentBackup);
      }

      // Restore backup
      fs.copyFileSync(backupPath, dbPath);

      return { success: true, message: 'Backup restored successfully' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Delete backup
  ipcMain.handle('delete-backup', (event, backupPath) => {
    const denied = checkPermission(event, 'admin');
    if (denied) return denied;
    try {
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath);
      }
      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });
};
