const { checkPermission, getSession } = require('../session');
const { loadDemoData, clearAllData, isEmpty } = require('../demoData');

module.exports = (ipcMain, db) => {
  // Fills an empty database with sample products, customers, invoices etc.
  // Refuses if any real data exists so it can never mix with or overwrite live records.
  ipcMain.handle('load-demo-data', (event) => {
    const denied = checkPermission(event, 'admin');
    if (denied) return denied;
    try {
      if (!isEmpty(db)) {
        return { success: false, message: 'Demo data can only be loaded into an empty shop. Clear existing data first.' };
      }
      const session = getSession(event.sender.id);
      const invoiceCount = loadDemoData(db, session.userId);
      return { success: true, invoiceCount };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Wipes products, customers, suppliers, invoices, purchases etc. Users, roles, settings and license stay.
  ipcMain.handle('clear-shop-data', (event) => {
    const denied = checkPermission(event, 'admin');
    if (denied) return denied;
    try {
      clearAllData(db);
      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });
};
