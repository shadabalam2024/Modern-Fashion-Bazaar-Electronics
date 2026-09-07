const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const isDev = process.env.NODE_ENV === 'development';
const Database = require('./database/db');
const authHandler = require('./ipc/auth');
const invoiceHandler = require('./ipc/invoice');
const inventoryHandler = require('./ipc/inventory');
const purchaseHandler = require('./ipc/purchase');
const customerHandler = require('./ipc/customer');
const analyticsHandler = require('./ipc/analytics');
const settingsHandler = require('./ipc/settings');
const backupHandler = require('./ipc/backup');
const returnsHandler = require('./ipc/returns');
const closingHandler = require('./ipc/closing');
const { checkPermission } = require('./session');

let mainWindow;
let db;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      enableRemoteModule: false,
      nodeIntegration: false
    }
  });

  const startUrl = isDev
    ? 'http://localhost:5173'
    : `file://${path.join(__dirname, '../../dist/index.html')}`;

  mainWindow.loadURL(startUrl);

  if (isDev) mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function openPrintWindow(invoiceId) {
  const printWindow = new BrowserWindow({
    width: 420,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      enableRemoteModule: false,
      nodeIntegration: false
    }
  });

  const startUrl = isDev
    ? `http://localhost:5173/#print=${invoiceId}`
    : `file://${path.join(__dirname, '../../dist/index.html')}#print=${invoiceId}`;

  printWindow.loadURL(startUrl);
  printWindow.setMenu(null);
}

app.on('ready', async () => {
  // Initialize database
  db = new Database();
  db.initialize();

  // Register IPC handlers
  authHandler(ipcMain, db);
  invoiceHandler(ipcMain, db);
  inventoryHandler(ipcMain, db);
  purchaseHandler(ipcMain, db);
  customerHandler(ipcMain, db);
  analyticsHandler(ipcMain, db);
  settingsHandler(ipcMain, db);
  backupHandler(ipcMain, db);
  returnsHandler(ipcMain, db);
  closingHandler(ipcMain, db);

  ipcMain.handle('print-invoice', (event, invoiceId) => {
    openPrintWindow(invoiceId);
  });

  ipcMain.handle('get-app-version', () => app.getVersion());

  if (!isDev) {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = false;

    autoUpdater.on('update-available', (info) => {
      mainWindow?.webContents.send('update-available', { version: info.version });
    });
    autoUpdater.on('update-not-available', () => {
      mainWindow?.webContents.send('update-not-available');
    });
    autoUpdater.on('download-progress', (progress) => {
      mainWindow?.webContents.send('update-download-progress', { percent: progress.percent });
    });
    autoUpdater.on('update-downloaded', () => {
      mainWindow?.webContents.send('update-downloaded');
    });
    autoUpdater.on('error', (error) => {
      mainWindow?.webContents.send('update-error', { message: error.message });
    });

    // Manual "Check for Updates" button - restricted to Admin since a download/install
    // affects the whole app and everyone using it on this machine.
    ipcMain.handle('check-for-updates', (event) => {
      const denied = checkPermission(event, 'admin');
      if (denied) return denied;
      try {
        autoUpdater.checkForUpdates();
        return { success: true };
      } catch (error) {
        return { success: false, message: error.message };
      }
    });

    ipcMain.handle('install-update-now', (event) => {
      const denied = checkPermission(event, 'admin');
      if (denied) return denied;
      autoUpdater.quitAndInstall();
      return { success: true };
    });

    // Silent check on launch - the renderer surfaces a popup if one is found.
    autoUpdater.checkForUpdates().catch(() => {});
  } else {
    // Dev mode: updates aren't available, but the handlers must still exist
    // so the Settings "Updates" tab doesn't error out while developing.
    ipcMain.handle('check-for-updates', () => ({ success: false, message: 'Updates are disabled in development mode' }));
    ipcMain.handle('install-update-now', () => ({ success: false, message: 'Updates are disabled in development mode' }));
  }

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
