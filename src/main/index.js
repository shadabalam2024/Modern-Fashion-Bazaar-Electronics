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
const { checkPermission, markTrusted, unmarkTrusted } = require('./session');

let mainWindow;
let db;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, '../../public/icon.png'),
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

  const printWebContentsId = printWindow.webContents.id;
  markTrusted(printWebContentsId);
  printWindow.on('closed', () => unmarkTrusted(printWebContentsId));

  printWindow.loadURL(startUrl);
  printWindow.setMenu(null);
}

// Print a small standalone HTML page silently to a named printer. Used for the invoice
// print window's direct-to-thermal-printer path and for the Settings "Test Print" button.
// Resolves { success, message? } - never throws (a missing/offline printer is a normal,
// expected failure mode here, not a bug).
function silentPrintHtml(html, printerName) {
  return new Promise((resolve) => {
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    win.webContents.once('did-finish-load', () => {
      win.webContents.print({ silent: true, deviceName: printerName, printBackground: true }, (success, failureReason) => {
        resolve({ success, message: success ? undefined : (failureReason || 'Print failed') });
        win.close();
      });
    });
    win.webContents.once('did-fail-load', (event, errorCode, errorDescription) => {
      resolve({ success: false, message: errorDescription || 'Failed to prepare print content' });
      win.close();
    });
  });
}

app.on('ready', async () => {
  // Remove Electron's default menu bar - it binds Ctrl+R/Cmd+R to Reload, which wipes
  // the app's in-memory login state (no persisted session) and drops the user back to
  // the Login screen. A POS app has no use for the default File/Edit/View/Window menu anyway.
  Menu.setApplicationMenu(null);

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
    const denied = checkPermission(event, 'billing');
    if (denied) return denied;
    openPrintWindow(invoiceId);
  });

  // Sent by the invoice-print window itself once it has rendered real invoice content
  // and detected thermal auto-print is enabled (see InvoicePrint.jsx). No permission
  // check needed beyond being the trusted print window - print-invoice already required
  // 'billing' to open it. Settings are re-read from the DB here rather than trusted from
  // the renderer, since they may have changed since the window loaded.
  ipcMain.on('invoice-print-ready', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const settings = db.prepare('SELECT thermal_printing_enabled, thermal_printer_name FROM shop_settings WHERE id = 1').get();
    if (!settings?.thermal_printing_enabled || !settings.thermal_printer_name) {
      event.sender.send('thermal-print-result', { success: false, message: 'Thermal printing is no longer enabled' });
      return;
    }
    win.webContents.print({ silent: true, deviceName: settings.thermal_printer_name, printBackground: true }, (success, failureReason) => {
      event.sender.send('thermal-print-result', { success, message: success ? undefined : (failureReason || 'Print failed') });
    });
  });

  // List installed Windows printers, for the Settings printer picker.
  ipcMain.handle('list-printers', async (event) => {
    const denied = checkPermission(event, 'settings');
    if (denied) return denied;
    try {
      const printers = await event.sender.getPrintersAsync();
      return printers.map(p => ({ name: p.name, displayName: p.displayName, isDefault: p.isDefault }));
    } catch (error) {
      return [];
    }
  });

  // Settings "Test Print" button - prints a minimal receipt directly, bypassing the DB,
  // so the admin can confirm a printer works before flipping thermal_printing_enabled on.
  ipcMain.handle('test-print', async (event, { printerName, paperWidth }) => {
    const denied = checkPermission(event, 'settings');
    if (denied) return denied;
    if (!printerName) return { success: false, message: 'Select a printer first' };
    const width = Number(paperWidth) || 80;
    const html = `
      <style>
        @page { size: ${width}mm auto; margin: 3mm; }
        body { font-family: 'Courier New', monospace; font-size: 13px; margin: 0; }
      </style>
      <div style="text-align:center;">
        <div style="font-weight:bold;">TEST PRINT</div>
        <div>${new Date().toLocaleString()}</div>
        <div style="border-top:1px dashed #000; margin:8px 0;"></div>
        <div>If you can read this, the printer is set up correctly.</div>
      </div>
    `;
    return silentPrintHtml(html, printerName);
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
