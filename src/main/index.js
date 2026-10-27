const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
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
const demoHandler = require('./ipc/demo');
const ledgerHandler = require('./ipc/ledger');
const { checkPermission, requireLoginOrTrusted, markTrusted, unmarkTrusted } = require('./session');
const { openPdfPreview, showPdfPreview } = require('./printPreview');
const { buildInventoryHtml } = require('./inventoryPrint');
const { buildPurchaseHtml, buildPurchaseListHtml } = require('./purchasePrint');
const { buildLabelsHtml } = require('./labelsPrint');
const { nextBarcodes } = require('./barcodes');

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
    ? 'http://127.0.0.1:5273'
    : `file://${path.join(__dirname, '../../dist/index.html')}`;

  mainWindow.loadURL(startUrl);

  if (isDev) mainWindow.webContents.openDevTools();

  // Belt-and-suspenders on top of removing the app menu (which already drops the
  // Reload/Force-Reload accelerators): Chromium's DevTools frontend has its own
  // built-in reload shortcuts for the inspected page that are NOT controlled by the
  // app's Menu at all, so Ctrl+R/Cmd+R/F5/Ctrl+Shift+R could still reset the app's
  // in-memory login state while DevTools is open (which it always is in dev mode).
  // Intercept at the input level so none of these can reach the page regardless.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const key = input.key.toLowerCase();
    const isReloadCombo = (key === 'r' && (input.control || input.meta)) || key === 'f5';
    if (isReloadCombo) event.preventDefault();
  });

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
    ? `http://127.0.0.1:5273/#print=${invoiceId}`
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
  demoHandler(ipcMain, db);
  ledgerHandler(ipcMain, db);

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

  // Sent by the invoice-print window: renders its own page to a PDF (A4 invoice, or a
  // receipt slip sized from settings), shows it in the PDF preview, then closes the
  // little print window.
  ipcMain.handle('invoice-preview-pdf', async (event, { contentHeightPx, format }) => {
    const denied = requireLoginOrTrusted(event);
    if (denied) return denied;
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      const settings = db.prepare('SELECT thermal_paper_width FROM shop_settings WHERE id = 1').get();
      const widthIn = (Number(settings?.thermal_paper_width) || 80) / 25.4;
      const heightIn = Math.max(Number(contentHeightPx) || 0, 200) / 96;
      // 'a4' = full-page invoice for a normal printer; otherwise a receipt-width slip
      const pdf = format === 'a4'
        ? await event.sender.printToPDF({
            pageSize: 'A4',
            printBackground: true,
            margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 }
          })
        : await event.sender.printToPDF({
            pageSize: { width: widthIn, height: heightIn },
            printBackground: true,
            margins: { top: 0, bottom: 0, left: 0, right: 0 }
          });
      showPdfPreview(pdf, 'Invoice - Print Preview');
      win?.close();
      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
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

  // Inventory stock sheet: the renderer sends only the product ids (already filtered and
  // sorted as on screen); rows are re-read from the DB so the printout can't be spoofed.
  ipcMain.handle('print-inventory', async (event, { productIds, filterLabel }) => {
    const denied = checkPermission(event, 'inventory');
    if (denied) return denied;
    try {
      const ids = (productIds || []).filter(Number.isInteger);
      if (ids.length === 0) return { success: false, message: 'Nothing to print' };
      const byId = new Map(db.prepare(`
        SELECT p.*, c.name AS category_name,
          (SELECT pi.landed_unit_cost FROM purchase_items pi
             JOIN purchases pu ON pu.id = pi.purchase_id
            WHERE pi.product_id = p.id AND pu.status = 'received' AND pi.landed_unit_cost IS NOT NULL
            ORDER BY pu.id DESC, pi.id DESC LIMIT 1) AS landed_cost
        FROM products p LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.id IN (${ids.map(() => '?').join(',')})
      `).all(...ids).map(p => [p.id, p]));
      const products = ids.map(id => byId.get(id)).filter(Boolean);
      const shop = db.prepare('SELECT shop_name FROM shop_settings WHERE id = 1').get();
      return await openPdfPreview(
        buildInventoryHtml({ shopName: shop?.shop_name, filterLabel, products }),
        'Inventory - Print Preview'
      );
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Goods-receipt print of one purchase
  ipcMain.handle('print-purchase', async (event, purchaseId) => {
    const denied = checkPermission(event, 'purchase');
    if (denied) return denied;
    try {
      const purchase = db.prepare(`
        SELECT p.*, s.name AS supplier_name, s.phone AS supplier_phone, s.address AS supplier_address, s.gstin AS supplier_gstin
        FROM purchases p JOIN suppliers s ON p.supplier_id = s.id WHERE p.id = ?
      `).get(purchaseId);
      if (!purchase) return { success: false, message: 'Purchase not found' };
      purchase.items = db.prepare(`
        SELECT pi.*, p.name AS product_name, p.sku, p.barcode
        FROM purchase_items pi JOIN products p ON pi.product_id = p.id WHERE pi.purchase_id = ? ORDER BY pi.id
      `).all(purchaseId);
      const shop = db.prepare('SELECT shop_name FROM shop_settings WHERE id = 1').get();
      return await openPdfPreview(buildPurchaseHtml({ shopName: shop?.shop_name, purchase }), 'Purchase - Print Preview');
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Summary list: the renderer sends the ids in the order shown; rows are re-read from the DB
  ipcMain.handle('print-purchase-list', async (event, { purchaseIds, filterLabel }) => {
    const denied = checkPermission(event, 'purchase');
    if (denied) return denied;
    try {
      const ids = (purchaseIds || []).filter(Number.isInteger);
      if (ids.length === 0) return { success: false, message: 'Nothing to print' };
      const byId = new Map(db.prepare(`
        SELECT p.*, s.name AS supplier_name FROM purchases p JOIN suppliers s ON p.supplier_id = s.id
        WHERE p.id IN (${ids.map(() => '?').join(',')})
      `).all(...ids).map(p => [p.id, p]));
      const purchases = ids.map(id => byId.get(id)).filter(Boolean);
      const shop = db.prepare('SELECT shop_name FROM shop_settings WHERE id = 1').get();
      return await openPdfPreview(buildPurchaseListHtml({ shopName: shop?.shop_name, purchases, filterLabel }), 'Purchases - Print Preview');
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Barcode stickers. items: [{ productId, count }]. A product with no barcode gets the next
  // free number first (saved on the product), since a sticker without one is useless.
  ipcMain.handle('print-labels', async (event, { items }) => {
    const denied = checkPermission(event, 'inventory');
    if (denied) return denied;
    try {
      const wanted = (items || []).filter(i => Number.isInteger(i.productId) && Number(i.count) > 0);
      if (wanted.length === 0) return { success: false, message: 'Nothing to print' };
      if (wanted.reduce((t, i) => t + Number(i.count), 0) > 2000) return { success: false, message: 'That is too many labels at once (limit 2000)' };

      let assigned = 0;
      const labels = db.transaction(() => {
        const out = [];
        for (const item of wanted) {
          const p = db.prepare('SELECT id, name, barcode, mrp, selling_price FROM products WHERE id = ?').get(item.productId);
          if (!p) continue;
          let barcode = p.barcode;
          if (!barcode) {
            barcode = nextBarcodes(db, 1)[0];
            db.prepare('UPDATE products SET barcode = ? WHERE id = ?').run(barcode, p.id);
            assigned++;
          }
          for (let n = 0; n < Number(item.count); n++) out.push({ name: p.name, barcode, mrp: p.mrp, price: p.selling_price });
        }
        return out;
      })();

      if (labels.length === 0) return { success: false, message: 'Nothing to print' };
      const shop = db.prepare('SELECT shop_name FROM shop_settings WHERE id = 1').get();
      const result = await openPdfPreview(buildLabelsHtml({ shopName: shop?.shop_name, labels }), 'Barcode Labels - Print Preview',
        { margins: { top: 0, bottom: 0, left: 0, right: 0 }, footer: false });
      return { ...result, assigned, total: labels.length };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('get-app-version', () => app.getVersion());

  // Support links open in the user's own WhatsApp / mail app or browser - nothing else is allowed through
  ipcMain.handle('open-support-link', async (event, url) => {
    if (typeof url !== 'string' || !(url.startsWith('https://wa.me/') || url.startsWith('mailto:'))) {
      return { success: false, message: 'Link not allowed' };
    }
    await shell.openExternal(url);
    return { success: true };
  });

  if (!isDev) {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = false; // the user chooses: Update now / Later
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

    ipcMain.handle('download-update', async (event) => {
      const denied = checkPermission(event, 'admin');
      if (denied) return denied;
      try {
        await autoUpdater.downloadUpdate();
        return { success: true };
      } catch (error) {
        return { success: false, message: error.message };
      }
    });

    ipcMain.handle('install-update-now', (event) => {
      const denied = checkPermission(event, 'admin');
      if (denied) return denied;
      autoUpdater.quitAndInstall(true, true); // silent install (no wizard), then reopen the app
      return { success: true };
    });

    // Silent check on launch - the renderer surfaces a popup if one is found.
    autoUpdater.checkForUpdates().catch(() => {});
  } else {
    // Dev mode: updates aren't available, but the handlers must still exist
    // so the Settings "Updates" tab doesn't error out while developing.
    ipcMain.handle('check-for-updates', () => ({ success: false, message: 'Updates are disabled in development mode' }));
    ipcMain.handle('install-update-now', () => ({ success: false, message: 'Updates are disabled in development mode' }));
    ipcMain.handle('download-update', () => ({ success: false, message: 'Updates are disabled in development mode' }));
  }

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
