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

  createWindow();

  if (!isDev) {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.on('update-downloaded', () => {
      mainWindow?.webContents.send('update-available');
    });
    autoUpdater.checkForUpdatesAndNotify();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
